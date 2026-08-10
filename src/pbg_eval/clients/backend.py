from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

import httpx

from pbg_eval.config import Config

logger = logging.getLogger(__name__)


class ComparisonTraceCapture:
    """Live-capture the backend's SSE thinking-trace stream for a comparison job.

    The backend worker streams Qwen output tokens (content + reasoning) to
    ``cache/stream_logs/<job_id>.log`` and exposes them over
    ``GET /jobs/{id}/stream-log`` (SSE). The log file is deleted as soon as
    streaming finishes, so the trace must be captured while the job is still
    processing. This runs a daemon thread that tails the stream and reconnects
    until stopped or a terminal stream event arrives.
    """

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
        self._thread = threading.Thread(
            target=self._runner, name="pbg-trace-capture", daemon=True
        )
        self._thread.start()

    def stop(self, join_timeout: float = 30.0) -> None:
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


def is_transient(exc: httpx.HTTPError) -> bool:
    """A transport error we may reasonably retry (connect/read timeouts, broken pipes)."""
    if isinstance(exc, httpx.TimeoutException):
        return True
    if isinstance(exc, (httpx.ConnectError, httpx.ReadError)):
        return True
    return False


def _network_error(exc: httpx.HTTPError, prefix: str = "") -> BackendError:
    return BackendError("network", f"{prefix}{exc}", transient=is_transient(exc))


class BackendError(Exception):
    def __init__(self, reason: str, detail: str = "", transient: bool = False, doc_id: str | None = None):
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
        if not config.is_staging() and not (config.allow_prod or allow_prod):
            logger.error("[BackendClient] Refusing non-staging backend URL: %s", self.base)
            raise BackendError("prod_guard", f"Refusing non-staging backend: {self.base}")

    def _headers(self) -> dict[str, str]:
        if not self._token:
            raise BackendError("auth_failed", "Not authenticated")
        return {"Authorization": f"Bearer {self._token}"}

    def login(self, email: str | None = None, password: str | None = None) -> None:
        email = email or self.config.backend_email
        password = password or self.config.backend_password
        logger.info("[BackendClient] Authenticating with backend at %s (email: %s)...", self.base, email)
        try:
            with httpx.Client(timeout=self.config.request_timeout) as client:
                resp = client.post(
                    f"{self.base}/auth/login",
                    json={"email": email, "password": password},
                )
                if resp.status_code == 401:
                    logger.error("[BackendClient] Authentication failed: Invalid credentials for %s", email)
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
        """Refresh the access token using the stored refresh token."""
        if not self._refresh_token:
            logger.error("[BackendClient] No refresh token available — re-authentication required")
            raise BackendError("auth_failed", "No refresh token available")
        logger.info("[BackendClient] Refreshing access token...")
        try:
            with httpx.Client(timeout=self.config.request_timeout) as client:
                resp = client.post(
                    f"{self.base}/auth/refresh",
                    json={"refresh_token": self._refresh_token},
                )
                if resp.status_code == 401:
                    logger.error("[BackendClient] Refresh token rejected — re-authentication required")
                    self._token = None
                    self._refresh_token = None
                    raise BackendError("auth_failed", "Refresh token rejected")
                resp.raise_for_status()
                data = resp.json()
                self._token = data["access_token"]
                self._refresh_token = data.get("refresh_token")
                logger.info("[BackendClient] Access token refreshed successfully")
        except httpx.HTTPError as exc:
            logger.error("[BackendClient] Network error refreshing token: %s", exc)
            raise _network_error(exc) from exc

    def _request_with_refresh(
        self,
        method: str,
        url: str,
        *,
        max_retries: int = 1,
        **kwargs: Any,
    ) -> httpx.Response:
        """Make an HTTP request, automatically refreshing the token on 401 and retrying once."""
        attempt = 0
        while True:
            try:
                with httpx.Client(timeout=self.config.request_timeout) as client:
                    resp = client.request(method, url, headers=self._headers(), **kwargs)
                if resp.status_code == 401 and self._refresh_token and attempt < max_retries:
                    logger.warning("[BackendClient] Received 401, refreshing token and retrying")
                    self.refresh_access_token()
                    attempt += 1
                    continue
                resp.raise_for_status()
                return resp
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 401 and self._refresh_token and attempt < max_retries:
                    logger.warning("[BackendClient] Received 401, refreshing token and retrying")
                    self.refresh_access_token()
                    attempt += 1
                    continue
                raise
            except httpx.HTTPError:
                raise

    def health(self) -> dict[str, Any]:
        try:
            resp = self._request_with_refresh("GET", f"{self.base}/health")
            return resp.json()
        except httpx.HTTPError as exc:
            logger.error("[BackendClient] Health check failed: %s", exc)
            raise _network_error(exc) from exc

    def get_status(self, doc_id: str) -> dict[str, Any]:
        try:
            resp = self._request_with_refresh(
                "GET", f"{self.base}/documents/{doc_id}/status"
            )
            return resp.json()
        except httpx.HTTPError as exc:
            logger.error("[BackendClient] Failed to get status for doc_id %s: %s", doc_id, exc)
            raise _network_error(exc) from exc

    def retry_job(self, job_id: str) -> None:
        logger.info("[BackendClient] Retrying comparison job_id %s...", job_id)
        try:
            resp = self._request_with_refresh(
                "POST", f"{self.base}/jobs/{job_id}/retry"
            )
            logger.info("[BackendClient] Job retry triggered successfully for job_id %s", job_id)
        except httpx.HTTPError as exc:
            logger.error("[BackendClient] Network error retrying job_id %s: %s", job_id, exc)
            raise _network_error(exc) from exc

    def cancel_job(self, job_id: str) -> None:
        logger.info("[BackendClient] Cancelling job_id %s...", job_id)
        try:
            resp = self._request_with_refresh(
                "POST", f"{self.base}/jobs/{job_id}/cancel"
            )
            logger.info("[BackendClient] Job cancelled successfully for job_id %s", job_id)
        except httpx.HTTPError as exc:
            logger.error("[BackendClient] Network error cancelling job_id %s: %s", job_id, exc)
            raise _network_error(exc) from exc

    def get_latest_comparison(self, doc_id: str) -> dict[str, Any]:
        """Fetch newest comparison for a doc."""
        logger.info("[BackendClient] Fetching latest comparison for doc_id %s...", doc_id)
        try:
            resp = self._request_with_refresh("GET", f"{self.base}/comparison")
            matches = [
                item
                for item in resp.json()
                if str(item.get("document_id")) == doc_id and item.get("id")
            ]
            if not matches:
                logger.error("[BackendClient] No comparison record found for doc_id %s", doc_id)
                raise BackendError("backend_error", f"No comparison found for doc {doc_id}")
            latest = max(matches, key=lambda item: item.get("created_at", ""))
            detail_resp = self._request_with_refresh(
                "GET", f"{self.base}/comparison/{latest['id']}"
            )
            if detail_resp.status_code == 404:
                logger.error("[BackendClient] Comparison detail 404 for comparison_id %s", latest['id'])
                raise BackendError("backend_error", "Comparison not found")
            detail_resp.raise_for_status()
            detail = detail_resp.json()
            deviations = detail.get("deviations", [])
            logger.info("[BackendClient] Successfully fetched comparison for doc_id %s (%d deviations)", doc_id, len(deviations))
            return {
                "deviations": deviations,
                "vendorMetadata": detail.get("vendor_metadata")
                or detail.get("vendorMetadata")
                or {},
                "debug": detail.get("debug"),
            }
        except httpx.HTTPError as exc:
            logger.error("[BackendClient] Network error fetching comparison for doc_id %s: %s", doc_id, exc)
            raise _network_error(exc) from exc

    def poll_comparison(self, doc_id: str) -> str:
        """Poll until comparison completes. Returns comparison job_id."""
        deadline = time.time() + self.config.poll_timeout
        logger.info("[BackendClient] Polling comparison for doc_id %s (timeout: %.0fs)...", doc_id, self.config.poll_timeout)
        job_id: str | None = None
        while time.time() < deadline:
            status = self.get_status(doc_id)
            comp = status.get("comparison")
            if comp:
                job_id = str(comp.get("job_id") or comp.get("jobId", ""))
                st = comp.get("status", "")
                if st == "completed":
                    logger.info("[BackendClient] Comparison completed for doc_id %s (job_id: %s)", doc_id, job_id)
                    return job_id or ""
                if st == "failed":
                    err_msg = comp.get("error") or "Comparison failed"
                    logger.error("[BackendClient] Comparison failed for doc_id %s: %s", doc_id, err_msg)
                    raise BackendError("backend_error", err_msg)
            overall = status.get("overall_status", "")
            if overall == "done" and job_id:
                logger.info("[BackendClient] Overall status done for doc_id %s (job_id: %s)", doc_id, job_id)
                return job_id
            time.sleep(self.config.poll_interval)
        logger.error("[BackendClient] Polling timed out for doc_id %s after %.0fs", doc_id, self.config.poll_timeout)
        raise BackendError("poll_timeout", f"Timed out polling doc {doc_id}")

    def stream_comparison_log(self, job_id: str) -> str:
        """Blocking read of the full SSE thinking-trace stream for a job.

        Reconnects until the stream reaches a terminal state or the job ends.
        """
        parts: list[str] = []
        stop = threading.Event()

        def _on_token(chunk: str) -> None:
            parts.append(chunk)

        for _ in range(600):
            if stop.is_set():
                break
            if self._stream_comparison_log_once(job_id, stop, _on_token):
                break
            time.sleep(2.0)
        return "".join(parts)

    def _stream_comparison_log_once(
        self, job_id: str, stop_event: threading.Event, on_token: Any
    ) -> bool:
        """Read one SSE session for the job's live stream log.

        Returns True when a terminal state is reached (job done/failed or the
        stream ended for a non-cold-start reason), False when the caller should
        reconnect (transport blip, or the worker hasn't created the log yet).
        """
        token = self._token
        if not token:
            logger.error("[BackendClient] Cannot stream log for job %s — not authenticated", job_id)
            return True
        timeout = httpx.Timeout(
            connect=10.0, read=self.config.sse_timeout, write=10.0, pool=10.0
        )
        try:
            with httpx.Client(timeout=timeout) as client:
                with client.stream(
                    "GET",
                    f"{self.base}/jobs/{job_id}/stream-log",
                    params={"token": token},
                ) as resp:
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
                                return False  # job not streaming yet — reconnect
                            logger.warning(
                                "[BackendClient] Trace stream ended for job %s: %s",
                                job_id, detail,
                            )
                            return True
        except httpx.HTTPError as exc:
            logger.warning("[BackendClient] Trace stream transport error for job %s: %s", job_id, exc)
            return False
        return False  # connection ended without a terminal event — reconnect

    def run_repeat(self, doc_id: str, comparison_job_id: str) -> dict[str, Any]:
        """Retry comparison job, poll, fetch result, capturing the thinking trace."""
        logger.info("[BackendClient] Starting repeat run for doc_id %s (comparison_job_id %s)...", doc_id, comparison_job_id)
        start = time.time()
        result = self._with_transport_retry(
            lambda: self._run_repeat_once(doc_id, comparison_job_id),
            what=f"repeat run for doc {doc_id}",
        )
        latency = time.time() - start
        result["_latency"] = latency
        logger.info("[BackendClient] Repeat run completed for doc_id %s in %.2fs", doc_id, latency)
        return result

    def _run_repeat_once(self, doc_id: str, comparison_job_id: str) -> dict[str, Any]:
        capture: ComparisonTraceCapture | None = None
        if self.config.capture_trace:
            capture = ComparisonTraceCapture(self)
            capture.start(comparison_job_id)
        try:
            self.retry_job(comparison_job_id)
            self.poll_comparison(doc_id)
            result = self.get_latest_comparison(doc_id)
        finally:
            if capture is not None:
                capture.stop()
        if capture is not None and capture.text:
            result["_trace"] = capture.text
        return result

    def _with_transport_retry(self, fn: Any, what: str) -> Any:
        """Retry a callable on transient transport errors with backoff."""
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
                    "[BackendClient] Transient failure during %s (attempt %d/%d): %s — retrying in %.0fs",
                    what, attempt, retries, exc.detail, delay,
                )
                time.sleep(delay)

    def get_comparison_job_id(self, doc_id: str) -> str:
        status = self.get_status(doc_id)
        comp = status.get("comparison")
        if not comp:
            raise BackendError("backend_error", "No comparison job found")
        job_id = comp.get("job_id") or comp.get("jobId")
        if not job_id:
            raise BackendError("backend_error", "No comparison job found")
        return str(job_id)

    def get_upload_url(self, filename: str, content_type: str = "application/pdf") -> dict[str, Any]:
        logger.info("[BackendClient] Requesting S3 upload URL for filename '%s'...", filename)
        try:
            resp = self._request_with_refresh(
                "POST",
                f"{self.base}/documents/upload-url",
                json={"filename": filename, "content_type": content_type},
            )
            data = resp.json()
            logger.info("[BackendClient] Upload URL received for doc_id %s", data.get("document_id"))
            return data
        except httpx.HTTPError as exc:
            logger.error("[BackendClient] Failed to get upload URL for '%s': %s", filename, exc)
            raise _network_error(exc) from exc

    def upload_to_s3(self, upload_url: str, file_bytes: bytes, content_type: str = "application/pdf") -> None:
        logger.info("[BackendClient] Transmitting PDF (%d bytes) directly to S3...", len(file_bytes))
        try:
            with httpx.Client(timeout=self.config.s3_upload_timeout) as client:
                resp = client.put(
                    upload_url,
                    content=file_bytes,
                    headers={"Content-Type": content_type},
                )
                resp.raise_for_status()
                logger.info("[BackendClient] S3 upload successfully completed")
        except httpx.HTTPError as exc:
            logger.error("[BackendClient] Direct S3 upload failed: %s", exc)
            raise _network_error(exc, prefix="S3 upload failed: ") from exc

    def confirm_upload(self, doc_id: str) -> dict[str, Any]:
        logger.info("[BackendClient] Confirming upload for doc_id %s...", doc_id)
        try:
            resp = self._request_with_refresh(
                "POST", f"{self.base}/documents/{doc_id}/confirm-upload"
            )
            data = resp.json()
            logger.info("[BackendClient] Upload confirmed for doc_id %s (extraction_job_id: %s)", doc_id, data.get("extraction_job_id"))
            return data
        except httpx.HTTPError as exc:
            logger.error("[BackendClient] Failed to confirm upload for doc_id %s: %s", doc_id, exc)
            raise _network_error(exc) from exc

    def poll_upload_completion(
        self, doc_id: str, trace: ComparisonTraceCapture | None = None
    ) -> str:
        """Poll until initial document extraction & comparison complete. Returns comparison job_id."""
        deadline = time.time() + self.config.upload_poll_timeout
        logger.info("[BackendClient] Polling full extraction + comparison pipeline for doc_id %s (timeout: %.0fs)...", doc_id, self.config.upload_poll_timeout)
        job_id: str | None = None
        trace_started = False
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
                    logger.info("[BackendClient] Fresh PDF pipeline completed for doc_id %s (comparison_job_id: %s)", doc_id, job_id)
                    return job_id or ""
                if st == "failed":
                    err_msg = comp.get("error") or "Comparison failed"
                    logger.error("[BackendClient] Backend comparison failed for doc_id %s: %s", doc_id, err_msg)
                    raise BackendError("backend_error", err_msg)
            overall = status.get("overall_status", "")
            if overall == "done" and job_id:
                logger.info("[BackendClient] Fresh PDF overall status done for doc_id %s", doc_id)
                return job_id
            if overall == "failed":
                logger.error("[BackendClient] Document processing marked failed for doc_id %s", doc_id)
                raise BackendError("backend_error", "Document processing failed on backend")
            time.sleep(self.config.poll_interval)
        logger.error("[BackendClient] Timed out waiting for fresh PDF processing on doc_id %s", doc_id)
        raise BackendError("poll_timeout", f"Timed out polling uploaded doc {doc_id}")

    def get_active_master_text(self) -> str | None:
        """Fetch extracted text of active master format from backend."""
        logger.info("[BackendClient] Fetching active master format text from backend...")
        try:
            resp = self._request_with_refresh("GET", f"{self.base}/master-formats/active")
            text = resp.json().get("extracted_text")
            logger.info("[BackendClient] Active master format text retrieved (%d chars)", len(text) if text else 0)
            return text
        except httpx.HTTPError as exc:
            logger.error("[BackendClient] Network error fetching active master format: %s", exc)
            raise _network_error(exc) from exc

    def get_comparison_if_complete(self, doc_id: str) -> dict[str, Any] | None:
        """Return comparison result if already completed, None otherwise."""
        try:
            status = self.get_status(doc_id)
        except BackendError:
            return None
        comp = status.get("comparison")
        if comp and comp.get("status") == "completed":
            try:
                return self.get_latest_comparison(doc_id)
            except BackendError:
                return None
        return None
        comp = status.get("comparison")
        if comp and comp.get("status") == "completed":
            try:
                return self.get_latest_comparison(doc_id)
            except BackendError:
                return None
        return None

    def get_active_master_text(self) -> str | None:
        """Fetch extracted text of active master format from backend."""
        logger.info("[BackendClient] Fetching active master format text from backend...")
        try:
            with httpx.Client(timeout=self.config.request_timeout) as client:
                resp = client.get(
                    f"{self.base}/master-formats/active",
                    headers=self._headers(),
                )
                if resp.status_code == 404:
                    logger.warning("[BackendClient] No active master format set on backend (404)")
                    return None
                resp.raise_for_status()
                text = resp.json().get("extracted_text")
                logger.info("[BackendClient] Active master format text retrieved (%d chars)", len(text) if text else 0)
                return text
        except httpx.HTTPError as exc:
            logger.error("[BackendClient] Network error fetching active master format: %s", exc)
            raise _network_error(exc) from exc

    @staticmethod
    def serialize_comparison(result: dict[str, Any]) -> str:
        payload = {
            "deviations": result.get("deviations", []),
            "vendorMetadata": result.get("vendorMetadata", {}),
        }
        if result.get("debug"):
            payload["debug"] = result["debug"]
        return json.dumps(payload, ensure_ascii=False)

