"""Resilient HTTP client for pbg-backend with thread-safe JWT management and auto-healing."""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

import httpx

from pbg_eval.config import Config

logger = logging.getLogger(__name__)


class ComparisonTraceCapture:
    """Live-capture the backend's SSE thinking-trace stream for a comparison job."""

    def __init__(self, client: "BackendClient"):
        self._client = client
        self._job_id: str | None = None
        self._stop = threading.Event()
        self._parts: list[str] = []
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None

    def start(self, job_id: str) -> None:
        if self._thread is not None:
            return
        self._job_id = job_id
        self._stop.clear()
        self._parts = []
        self._thread = threading.Thread(
            target=self._runner, name="pbg-trace-capture", daemon=True
        )
        self._thread.start()

    def stop(self, join_timeout: float = 15.0) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=join_timeout)
            self._thread = None

    @property
    def text(self) -> str:
        with self._lock:
            return "".join(self._parts)

    def _append(self, chunk: str) -> None:
        if not chunk:
            return
        with self._lock:
            self._parts.append(chunk)

    def _runner(self) -> None:
        job_id = self._job_id
        while job_id and not self._stop.is_set():
            if self._client._stream_comparison_log_once(job_id, self._stop, self._append):
                return
            self._stop.wait(2.0)


def _iter_sse_events(resp: httpx.Response):
    """Yield (event_name, data) pairs from an SSE response body."""
    event: str | None = None
    data_lines: list[str] = []
    for line in resp.iter_lines():
        if not line:
            if event or data_lines:
                yield (event or "message"), "\n".join(data_lines)
            event = None
            data_lines = []
        elif line.startswith("event:"):
            event = line[len("event:"):].strip()
        elif line.startswith("data:"):
            data_lines.append(line[len("data:"):].strip())
    if event or data_lines:
        yield (event or "message"), "\n".join(data_lines)


def is_transient(exc: Exception) -> bool:
    """A transport error we may reasonably retry (connect/read timeouts, broken pipes)."""
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)):
        return True
    return False


def _network_error(exc: Exception, prefix: str = "") -> BackendError:
    return BackendError("network", f"{prefix}{exc}", transient=is_transient(exc))


class BackendError(Exception):
    def __init__(
        self,
        reason: str,
        detail: str = "",
        transient: bool = False,
        doc_id: str | None = None,
    ):
        self.reason = reason
        self.detail = detail
        self.transient = transient
        self.doc_id = doc_id
        super().__init__(detail or reason)


class BackendClient:
    def __init__(self, config: Config, allow_prod: bool = False):
        self.config = config
        self.base = config.backend_url.rstrip("/")
        self._token: str | None = None
        self._refresh_token: str | None = None
        self._auth_lock = threading.Lock()

        if not config.is_staging() and not (config.allow_prod or allow_prod):
            logger.error("[BackendClient] Refusing non-staging backend URL: %s", self.base)
            raise BackendError("prod_guard", f"Refusing non-staging backend: {self.base}")

    def _headers(self) -> dict[str, str]:
        if not self._token:
            raise BackendError("auth_failed", "Not authenticated")
        return {"Authorization": f"Bearer {self._token}"}

    def login(self, email: str | None = None, password: str | None = None) -> None:
        """Authenticate with username and password, storing access & refresh tokens."""
        email = email or self.config.backend_email
        password = password or self.config.backend_password
        logger.info("[BackendClient] Authenticating with backend at %s (%s)...", self.base, email)

        with self._auth_lock:
            try:
                with httpx.Client(timeout=self.config.request_timeout) as client:
                    resp = client.post(
                        f"{self.base}/auth/login",
                        json={"email": email, "password": password},
                    )
                    if resp.status_code == 401:
                        logger.error("[BackendClient] Invalid credentials for %s", email)
                        raise BackendError("auth_failed", "Invalid credentials")
                    resp.raise_for_status()
                    data = resp.json()
                    self._token = data["access_token"]
                    self._refresh_token = data.get("refresh_token")
                    logger.info("[BackendClient] Authentication successful")
            except httpx.HTTPError as exc:
                logger.error("[BackendClient] Network error during authentication: %s", exc)
                raise _network_error(exc) from exc

    def refresh_access_token(self) -> None:
        """Thread-safe access token refresh with auto-login fallback."""
        with self._auth_lock:
            if not self._refresh_token:
                logger.info("[BackendClient] No refresh token available — logging in...")
                self._token = None
                self._refresh_token = None
                self._login_unlocked()
                return

            logger.info("[BackendClient] Refreshing access token...")
            try:
                with httpx.Client(timeout=self.config.request_timeout) as client:
                    resp = client.post(
                        f"{self.base}/auth/refresh",
                        json={"refresh_token": self._refresh_token},
                    )
                    if resp.status_code == 401:
                        logger.warning("[BackendClient] Refresh token rejected/reused — falling back to full login")
                        self._token = None
                        self._refresh_token = None
                        self._login_unlocked()
                        return
                    resp.raise_for_status()
                    data = resp.json()
                    self._token = data["access_token"]
                    self._refresh_token = data.get("refresh_token")
                    logger.info("[BackendClient] Access token refreshed successfully")
            except httpx.HTTPError as exc:
                logger.warning("[BackendClient] Refresh failed: %s — attempting re-login", exc)
                self._login_unlocked()

    def _login_unlocked(self) -> None:
        """Login helper assuming _auth_lock is already held."""
        email = self.config.backend_email
        password = self.config.backend_password
        with httpx.Client(timeout=self.config.request_timeout) as client:
            resp = client.post(
                f"{self.base}/auth/login",
                json={"email": email, "password": password},
            )
            if resp.status_code == 401:
                raise BackendError("auth_failed", "Invalid credentials during re-login")
            resp.raise_for_status()
            data = resp.json()
            self._token = data["access_token"]
            self._refresh_token = data.get("refresh_token")
            logger.info("[BackendClient] Re-login successful")

    def _ensure_authenticated(self) -> None:
        if not self._token:
            self.login()

    def _request_with_refresh(
        self,
        method: str,
        url: str,
        *,
        max_retries: int = 1,
        **kwargs: Any,
    ) -> httpx.Response:
        """Make an HTTP request, automatically refreshing token or re-authenticating on 401."""
        self._ensure_authenticated()
        attempt = 0
        while True:
            headers = kwargs.pop("headers", None) or self._headers()
            try:
                with httpx.Client(timeout=self.config.request_timeout) as client:
                    resp = client.request(method, url, headers=headers, **kwargs)

                if resp.status_code == 401 and attempt < max_retries:
                    logger.warning("[BackendClient] Received 401 on %s, refreshing auth and retrying", url)
                    self.refresh_access_token()
                    attempt += 1
                    continue

                resp.raise_for_status()
                return resp
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 401 and attempt < max_retries:
                    logger.warning("[BackendClient] Received 401 status error, refreshing auth and retrying")
                    self.refresh_access_token()
                    attempt += 1
                    continue
                raise
            except httpx.HTTPError as exc:
                if is_transient(exc):
                    raise _network_error(exc) from exc
                raise

    def health(self) -> dict[str, Any]:
        try:
            resp = self._request_with_refresh("GET", f"{self.base}/health")
            return resp.json()
        except Exception as exc:
            logger.error("[BackendClient] Health check failed: %s", exc)
            raise _network_error(exc) from exc

    def get_status(self, doc_id: str) -> dict[str, Any]:
        try:
            resp = self._request_with_refresh("GET", f"{self.base}/documents/{doc_id}/status")
            return resp.json()
        except Exception as exc:
            logger.error("[BackendClient] Failed to get status for doc_id %s: %s", doc_id, exc)
            raise _network_error(exc) from exc

    def cancel_job(self, job_id: str) -> None:
        """Cancel a job to release GPU VRAM on Ollama/PaddleOCR."""
        logger.info("[BackendClient] Cancelling job_id %s...", job_id)
        try:
            self._request_with_refresh("POST", f"{self.base}/jobs/{job_id}/cancel")
            logger.info("[BackendClient] Job cancelled successfully for job_id %s", job_id)
        except Exception as exc:
            logger.warning("[BackendClient] Network error cancelling job_id %s: %s", job_id, exc)

    def retry_job(self, job_id: str) -> None:
        logger.info("[BackendClient] Retrying comparison job_id %s...", job_id)
        try:
            self._request_with_refresh("POST", f"{self.base}/jobs/{job_id}/retry")
            logger.info("[BackendClient] Job retry triggered for job_id %s", job_id)
        except Exception as exc:
            logger.error("[BackendClient] Error retrying job_id %s: %s", job_id, exc)
            raise _network_error(exc) from exc

    def get_latest_comparison(self, doc_id: str) -> dict[str, Any]:
        """Fetch comparison result for a document, trying direct endpoint first."""
        logger.info("[BackendClient] Fetching comparison for doc_id %s...", doc_id)
        try:
            # 1. Direct document comparison endpoint
            try:
                resp = self._request_with_refresh("GET", f"{self.base}/documents/{doc_id}/comparison")
                data = resp.json()
                deviations = data.get("deviations") or []
                metadata = data.get("vendorMetadata") or data.get("vendor_metadata") or {}
                return {
                    "deviations": deviations,
                    "vendorMetadata": metadata,
                    "debug": data.get("debug"),
                }
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 404:
                    raise

            # 2. Fallback to /comparison list endpoint
            resp = self._request_with_refresh("GET", f"{self.base}/comparison")
            items = resp.json()
            matches = [i for i in items if str(i.get("document_id")) == str(doc_id) and i.get("id")]
            if not matches:
                raise BackendError("backend_error", f"No comparison found for doc {doc_id}")

            latest = max(matches, key=lambda x: str(x.get("created_at", "")))
            detail_resp = self._request_with_refresh("GET", f"{self.base}/comparison/{latest['id']}")
            detail = detail_resp.json()
            return {
                "deviations": detail.get("deviations") or [],
                "vendorMetadata": detail.get("vendor_metadata") or detail.get("vendorMetadata") or {},
                "debug": detail.get("debug"),
            }
        except BackendError:
            raise
        except Exception as exc:
            logger.error("[BackendClient] Error fetching comparison for doc_id %s: %s", doc_id, exc)
            raise _network_error(exc) from exc

    def get_active_master_text(self) -> str | None:
        """Fetch extracted text of the active master PBG format."""
        try:
            resp = self._request_with_refresh("GET", f"{self.base}/master-formats/active")
            text = resp.json().get("extracted_text")
            return text or None
        except Exception as exc:
            logger.warning("[BackendClient] Could not fetch active master text: %s", exc)
            return None

    def get_comparison_job_id(self, doc_id: str) -> str:
        status = self.get_status(doc_id)
        comp = status.get("comparison")
        if not comp:
            raise BackendError("backend_error", f"No comparison job found for doc {doc_id}")
        job_id = comp.get("job_id") or comp.get("jobId")
        if not job_id:
            raise BackendError("backend_error", f"No comparison job ID found for doc {doc_id}")
        return str(job_id)

    def get_comparison_if_complete(self, doc_id: str) -> dict[str, Any] | None:
        try:
            status = self.get_status(doc_id)
        except Exception:
            return None
        comp = status.get("comparison")
        if comp and comp.get("status") == "completed":
            try:
                return self.get_latest_comparison(doc_id)
            except Exception:
                return None
        return None

    def get_upload_url(self, filename: str, content_type: str = "application/pdf") -> dict[str, Any]:
        logger.info("[BackendClient] Requesting S3 upload URL for '%s'...", filename)
        try:
            resp = self._request_with_refresh(
                "POST",
                f"{self.base}/documents/upload-url",
                json={"filename": filename, "content_type": content_type},
            )
            return resp.json()
        except Exception as exc:
            logger.error("[BackendClient] Failed to get upload URL: %s", exc)
            raise _network_error(exc) from exc

    def upload_to_s3(self, upload_url: str, file_bytes: bytes, content_type: str = "application/pdf") -> None:
        logger.info("[BackendClient] Uploading %d bytes directly to S3...", len(file_bytes))
        try:
            with httpx.Client(timeout=self.config.s3_upload_timeout) as client:
                resp = client.put(
                    upload_url,
                    content=file_bytes,
                    headers={"Content-Type": content_type},
                )
                resp.raise_for_status()
                logger.info("[BackendClient] S3 direct upload complete")
        except Exception as exc:
            logger.error("[BackendClient] Direct S3 upload failed: %s", exc)
            raise _network_error(exc, prefix="S3 upload failed: ") from exc

    def confirm_upload(self, doc_id: str) -> dict[str, Any]:
        logger.info("[BackendClient] Confirming upload for doc_id %s...", doc_id)
        try:
            resp = self._request_with_refresh(
                "POST", f"{self.base}/documents/{doc_id}/confirm-upload"
            )
            return resp.json()
        except Exception as exc:
            logger.error("[BackendClient] Confirm upload failed: %s", exc)
            raise _network_error(exc) from exc

    def poll_comparison(self, doc_id: str) -> str:
        """Poll until comparison finishes with progressive backoff."""
        deadline = time.time() + self.config.poll_timeout
        job_id: str | None = None
        current_interval = self.config.poll_interval

        while time.time() < deadline:
            status = self.get_status(doc_id)
            comp = status.get("comparison")
            if comp:
                job_id = str(comp.get("job_id") or comp.get("jobId", ""))
                st = comp.get("status", "")
                if st == "completed":
                    logger.info("[BackendClient] Comparison completed for doc_id %s", doc_id)
                    return job_id
                if st == "failed":
                    err_msg = comp.get("error") or "Comparison failed on backend"
                    raise BackendError("backend_error", err_msg)

            overall = status.get("overall_status", "")
            if overall == "done" and job_id:
                return job_id
            if overall == "failed":
                raise BackendError("backend_error", "Document failed on backend")

            time.sleep(current_interval)
            current_interval = min(current_interval * 1.05, 15.0)

        raise BackendError("poll_timeout", f"Timed out polling doc {doc_id}")

    def poll_upload_completion(
        self, doc_id: str, trace: ComparisonTraceCapture | None = None
    ) -> str:
        """Poll extraction + comparison full pipeline."""
        deadline = time.time() + self.config.upload_poll_timeout
        job_id: str | None = None
        trace_started = False
        current_interval = self.config.poll_interval

        while time.time() < deadline:
            status = self.get_status(doc_id)
            comp = status.get("comparison")
            if comp:
                job_id = str(comp.get("job_id") or comp.get("jobId", ""))
                if trace is not None and job_id and not trace_started:
                    trace.start(job_id)
                    trace_started = True
                st = comp.get("status", "")
                if st == "completed":
                    return job_id
                if st == "failed":
                    raise BackendError("backend_error", comp.get("error") or "Comparison failed")

            overall = status.get("overall_status", "")
            if overall == "done" and job_id:
                return job_id
            if overall == "failed":
                raise BackendError("backend_error", "Processing failed on backend")

            time.sleep(current_interval)
            current_interval = min(current_interval * 1.05, 15.0)

        raise BackendError("poll_timeout", f"Timed out polling upload for doc {doc_id}")

    def upload_and_process_pdf(self, pdf_path: Path) -> tuple[str, str, dict[str, Any]]:
        """Upload a PDF, run the full pipeline, and return (doc_id, comparison_job_id, result)."""
        logger.info("[BackendClient] Uploading & processing PDF: %s", pdf_path)
        start = time.time()
        doc_id: str | None = None
        trace: ComparisonTraceCapture | None = None

        try:
            upload_info = self.get_upload_url(pdf_path.name)
            doc_id = str(
                upload_info.get("document_id")
                or upload_info.get("documentId")
                or upload_info.get("id")
            )
            upload_url = str(
                upload_info.get("upload_url")
                or upload_info.get("uploadUrl")
                or upload_info.get("presigned_url")
            )

            self.upload_to_s3(upload_url, pdf_path.read_bytes())
            self.confirm_upload(doc_id)

            if self.config.capture_trace:
                trace = ComparisonTraceCapture(self)

            comp_job_id = self.poll_upload_completion(doc_id, trace)
            result = self.get_latest_comparison(doc_id)
            result["_latency"] = time.time() - start
            if trace is not None and trace.text:
                result["_trace"] = trace.text

            return doc_id, comp_job_id, result
        except BackendError as exc:
            if doc_id and exc.doc_id is None:
                exc.doc_id = doc_id
            raise
        finally:
            if trace is not None:
                trace.stop()

    def run_repeat(self, doc_id: str, comparison_job_id: str) -> dict[str, Any]:
        """Retry a comparison job and capture thinking trace."""
        logger.info("[BackendClient] Running repeat comparison for doc %s (job %s)...", doc_id, comparison_job_id)
        start = time.time()
        result = self._with_transport_retry(
            lambda: self._run_repeat_once(doc_id, comparison_job_id),
            what=f"repeat run for doc {doc_id}",
        )
        result["_latency"] = time.time() - start
        return result

    def _run_repeat_once(self, doc_id: str, comparison_job_id: str) -> dict[str, Any]:
        trace: ComparisonTraceCapture | None = None
        if self.config.capture_trace:
            trace = ComparisonTraceCapture(self)
            trace.start(comparison_job_id)
        try:
            self.retry_job(comparison_job_id)
            self.poll_comparison(doc_id)
            result = self.get_latest_comparison(doc_id)
        finally:
            if trace is not None:
                trace.stop()
        if trace is not None and trace.text:
            result["_trace"] = trace.text
        return result

    def _stream_comparison_log_once(
        self, job_id: str, stop_event: threading.Event, on_token: Any
    ) -> bool:
        """Stream SSE log with Bearer token in headers and periodic read timeout to prevent thread hangs."""
        self._ensure_authenticated()
        token = self._token
        if not token:
            return True

        timeout = httpx.Timeout(
            connect=10.0, read=30.0, write=10.0, pool=10.0
        )
        headers = {"Authorization": f"Bearer {token}"}
        try:
            with httpx.Client(timeout=timeout) as client:
                with client.stream(
                    "GET",
                    f"{self.base}/jobs/{job_id}/stream-log",
                    headers=headers,
                    params={"token": token},
                ) as resp:
                    if resp.status_code == 401:
                        self.refresh_access_token()
                        return False
                    resp.raise_for_status()
                    for name, data in _iter_sse_events(resp):
                        if stop_event.is_set():
                            return True
                        if name == "token":
                            try:
                                text = json.loads(data).get("text", "")
                            except Exception:
                                text = data
                            if text:
                                on_token(text)
                        elif name == "done":
                            return True
                        elif name == "error":
                            try:
                                detail = json.loads(data).get("detail", "")
                            except Exception:
                                detail = data
                            if "Stream log not available" in detail:
                                return False
                            return True
        except httpx.ReadTimeout:
            # Reconnect if still running or return if stop_event is set
            return stop_event.is_set()
        except httpx.HTTPError:
            return False
        return False

    def _with_transport_retry(self, fn: Any, what: str) -> Any:
        retries = self.config.transport_retries
        delay = self.config.transport_retry_delay
        attempt = 0
        while True:
            try:
                return fn()
            except BackendError as exc:
                if not exc.transient or attempt >= retries:
                    raise
                attempt += 1
                logger.warning(
                    "[BackendClient] Transient failure during %s (%d/%d): %s — retry in %.1fs",
                    what, attempt, retries, exc.detail, delay,
                )
                time.sleep(delay)

    @staticmethod
    def serialize_comparison(result: dict[str, Any]) -> str:
        payload = {
            "deviations": result.get("deviations", []),
            "vendorMetadata": result.get("vendorMetadata", {}),
        }
        if result.get("debug"):
            payload["debug"] = result["debug"]
        return json.dumps(payload, ensure_ascii=False)
