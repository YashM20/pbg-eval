import hashlib
import json
import logging
import time
import sqlite3
from pathlib import Path

from pbg_eval.clients.backend import BackendClient, BackendError
from pbg_eval.config import Config, get_config
from pbg_eval.db import connect
from pbg_eval.exclude import check_output
from pbg_eval.extraction import check_extraction
from pbg_eval.models import DocFixture

logger = logging.getLogger(__name__)


def load_fixtures(docs_dir: Path) -> list[DocFixture]:
    """Load fixtures from a directory."""
    fixtures: list[DocFixture] = []
    json_count = 0
    pdf_count = 0

    # JSON fixtures — may have backend_doc_id and/or pdf_path
    for path in sorted(docs_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        pdf_path: Path | None = None
        if data.get("pdf_path"):
            raw = Path(data["pdf_path"])
            pdf_path = raw if raw.is_absolute() else docs_dir / raw

        fixtures.append(
            DocFixture(
                doc_id=data["doc_id"],
                backend_doc_id=data.get("backend_doc_id"),
                pdf_path=pdf_path,
                master_text=data.get("master_text"),
                vendor_text=data.get("vendor_text"),
            )
        )
        json_count += 1

    # Raw PDF files — no JSON companion, full upload mode
    json_stems = {f.stem for f in docs_dir.glob("*.json")}
    for path in sorted(docs_dir.glob("*.pdf")):
        if path.stem in json_stems:
            continue  # already referenced by a JSON fixture
        fixtures.append(
            DocFixture(
                doc_id=path.stem,
                pdf_path=path,
            )
        )
        pdf_count += 1

    logger.info("[RunService] Loaded %d fixtures from %s (%d JSON, %d raw PDF)", len(fixtures), docs_dir, json_count, pdf_count)
    return fixtures


def get_or_create_version(
    conn: sqlite3.Connection,
    label: str,
    prompt_hash: str = "",
    model_config: str = "{}",
    notes: str | None = None,
) -> int:
    row = conn.execute("SELECT id FROM pipeline_version WHERE label = ?", (label,)).fetchone()
    if row:
        return row[0]
    cur = conn.execute(
        "INSERT INTO pipeline_version (label, prompt_hash, model_config, notes) VALUES (?, ?, ?, ?)",
        (label, prompt_hash or hashlib.sha256(label.encode()).hexdigest()[:16], model_config, notes),
    )
    conn.commit()
    return cur.lastrowid  # type: ignore[return-value]


def create_eval_job(conn: sqlite3.Connection, version_id: int, total: int) -> int:
    cur = conn.execute(
        "INSERT INTO eval_job (version_id, status, total, completed) VALUES (?, 'running', ?, 0)",
        (version_id, total),
    )
    conn.commit()
    return cur.lastrowid  # type: ignore[return-value]


def update_job_progress(conn: sqlite3.Connection, job_id: int, completed: int, status: str = "running", error: str | None = None) -> None:
    conn.execute(
        "UPDATE eval_job SET completed = ?, status = ?, error = ? WHERE id = ?",
        (completed, status, error, job_id),
    )
    conn.commit()


def stop_run(conn: sqlite3.Connection, job_id: int) -> None:
    """Mark an eval job as stopped so execute_run_batch exits gracefully."""
    conn.execute(
        "UPDATE eval_job SET stopped = 1, status = 'stopped' WHERE id = ? AND status = 'running'",
        (job_id,),
    )
    conn.commit()


def get_eval_job(conn: sqlite3.Connection, job_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM eval_job WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None


def get_job_doc_status(conn: sqlite3.Connection, job_id: int) -> list[dict]:
    """Per-document progress for an eval job, derived from its run rows."""
    rows = conn.execute(
        """
        SELECT
            doc_id,
            COUNT(*) AS total,
            SUM(CASE WHEN status IN ('scored', 'pending') THEN 1 ELSE 0 END) AS ok,
            SUM(CASE WHEN status = 'excluded' THEN 1 ELSE 0 END) AS excluded,
            MAX(CASE WHEN status = 'excluded' AND exclusion_reason IS NOT NULL THEN exclusion_reason END) AS error
        FROM run
        WHERE job_id = ?
        GROUP BY doc_id
        ORDER BY doc_id
        """,
        (job_id,),
    ).fetchall()

    result = []
    for row in rows:
        ok = row["ok"] or 0
        excluded = row["excluded"] or 0
        result.append(
            {
                "doc_id": row["doc_id"],
                "total": row["total"],
                "completed": ok + excluded,
                "pending": row["total"] - (ok + excluded),
                "excluded": excluded,
                "error": row["error"],
            }
        )
    return result


def _store_run(
    conn: sqlite3.Connection,
    version_id: int,
    fixture: DocFixture,
    raw_output: str | None,
    backend_job_id: str | None,
    latency: float | None,
    status: str,
    exclusion_reason: str | None,
    extraction_ok: bool,
    eval_job_id: int | None = None,
    thinking_trace: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO run (
            version_id, job_id, doc_id, backend_doc_id, backend_job_id, latency_seconds,
            raw_qwen_output, thinking_trace, master_text, vendor_text, extraction_ok, status, exclusion_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            version_id,
            eval_job_id,
            fixture.doc_id,
            fixture.backend_doc_id,
            backend_job_id,
            latency,
            raw_output,
            thinking_trace,
            fixture.master_text,
            fixture.vendor_text,
            int(extraction_ok),
            status,
            exclusion_reason,
        ),
    )
    conn.commit()


def _extract_vendor_text_from_result(result: dict) -> str:
    """Derive a proxy vendor text from comparison result deviations."""
    deviations = result.get("deviations") or []
    parts: list[str] = []
    for dev in deviations:
        if isinstance(dev, dict):
            clause = dev.get("clauseNo", "")
            appearing = dev.get("appearingInBg", "")
            if appearing:
                parts.append(f"[Clause {clause}] {appearing}" if clause else appearing)
    return "\n\n".join(parts) if parts else ""


def execute_run_batch(
    job_id: int,
    version_label: str,
    docs_dir: Path,
    repeats: int,
    allow_prod: bool = False,
    auto_grade: bool = True,
    config: Config | None = None,
) -> None:
    config = config or get_config()
    conn = connect(config.db_path)
    version_id = get_or_create_version(conn, version_label)
    fixtures = load_fixtures(docs_dir)
    total = len(fixtures) * repeats
    conn.execute("UPDATE eval_job SET total = ? WHERE id = ?", (total, job_id))
    conn.commit()

    client = BackendClient(config, allow_prod=allow_prod)
    try:
        client.login()
    except BackendError as exc:
        update_job_progress(conn, job_id, 0, "failed", exc.reason)
        conn.close()
        return

    # Fetch master text once from backend (active master format)
    # This is used when fixtures don't have their own master_text snapshot
    _cached_master_text: str | None = None

    def _get_master_text(fixture: DocFixture) -> str | None:
        nonlocal _cached_master_text
        if fixture.master_text:
            return fixture.master_text
        if _cached_master_text is None:
            try:
                _cached_master_text = client.get_active_master_text() or ""
                if not _cached_master_text:
                    logger.warning("No active master format text found on backend")
            except BackendError as exc:
                logger.warning("Could not fetch active master text: %s", exc)
                _cached_master_text = ""
        return _cached_master_text or None

    completed = 0
    was_stopped = False
    try:
        for fixture in fixtures:
            needs_upload = fixture.backend_doc_id is None and fixture.pdf_path is not None
            has_no_source = fixture.backend_doc_id is None and fixture.pdf_path is None

            # --- No source: exclude all repeats immediately ---
            if has_no_source:
                logger.error("Fixture %s has neither backend_doc_id nor pdf_path — skipping", fixture.doc_id)
                for _ in range(repeats):
                    _store_run(conn, version_id, fixture, None, None, None, "excluded", "no_source", False, job_id)
                    completed += 1
                    update_job_progress(conn, job_id, completed)
                continue

            # --- Check if job was stopped ---
            stopped_row = conn.execute("SELECT stopped FROM eval_job WHERE id = ?", (job_id,)).fetchone()
            if stopped_row and stopped_row["stopped"]:
                logger.info("[RunService] Job %d stopped — skipping remaining fixtures", job_id)
                update_job_progress(conn, job_id, completed, "stopped")
                was_stopped = True
                break

            # --- Heal check: if backend_doc_id exists and comparison already completed, fetch it ---
            if fixture.backend_doc_id:
                try:
                    healed = client.get_comparison_if_complete(fixture.backend_doc_id)
                    if healed is not None:
                        logger.info("[RunService] Healed fixture %s — comparison already completed on backend", fixture.doc_id)
                        raw = BackendClient.serialize_comparison(healed)
                        latency = healed.get("_latency")
                        meta = healed.get("vendorMetadata") or {}
                        extraction_ok, _ = check_extraction(meta)
                        master = _get_master_text(fixture)
                        vendor = fixture.vendor_text or _extract_vendor_text_from_result(healed)
                        fixture.master_text = master
                        fixture.vendor_text = vendor if vendor else None
                        reason = check_output(raw, fixture.master_text, fixture.vendor_text)
                        status = "excluded" if reason else "pending"
                        _store_run(
                            conn, version_id, fixture, raw, None, latency,
                            status, reason, extraction_ok, job_id, healed.get("_trace"),
                        )
                        completed += 1
                        update_job_progress(conn, job_id, completed)
                        continue
                except BackendError as exc:
                    logger.warning("[RunService] Heal check failed for fixture %s: %s", fixture.doc_id, exc)

            # --- PDF Upload mode: upload → full pipeline → get initial result ---
            if needs_upload:
                logger.info("Uploading PDF for fixture %s: %s", fixture.doc_id, fixture.pdf_path)
                try:
                    doc_id, comparison_job_id, first_result = client.upload_and_process_pdf(fixture.pdf_path)
                except BackendError as exc:
                    fixture.backend_doc_id = exc.doc_id
                    # If transient error and backend_doc_id known, check for completed comparison
                    if exc.transient and exc.doc_id:
                        try:
                            healed = client.get_comparison_if_complete(exc.doc_id)
                            if healed is not None:
                                logger.info("[RunService] Healed fixture %s after transient upload error", fixture.doc_id)
                                raw = BackendClient.serialize_comparison(healed)
                                latency = healed.get("_latency")
                                meta = healed.get("vendorMetadata") or {}
                                extraction_ok, _ = check_extraction(meta)
                                master = _get_master_text(fixture)
                                vendor = fixture.vendor_text or _extract_vendor_text_from_result(healed)
                                fixture.master_text = master
                                fixture.vendor_text = vendor if vendor else None
                                reason = check_output(raw, fixture.master_text, fixture.vendor_text)
                                status = "excluded" if reason else "pending"
                                _store_run(
                                    conn, version_id, fixture, raw, None, latency,
                                    status, reason, extraction_ok, job_id, healed.get("_trace"),
                                )
                                completed += 1
                                update_job_progress(conn, job_id, completed)
                                continue
                        except BackendError:
                            pass
                    if exc.transient:
                        logger.error("Transient network failure uploading %s after retries: %s", fixture.doc_id, exc.detail)
                    else:
                        logger.error("Failed to upload/process %s: %s", fixture.doc_id, exc.detail)
                    for _ in range(repeats):
                        _store_run(
                            conn, version_id, fixture, None, None, None, "excluded",
                            f"{exc.reason}: {exc.detail}" if exc.detail else exc.reason, False, job_id,
                        )
                        completed += 1
                        update_job_progress(conn, job_id, completed)
                    continue

                # Populate backend_doc_id now that we have it
                fixture.backend_doc_id = doc_id

                # Store Run 1 using the first result we already fetched
                run1_raw = BackendClient.serialize_comparison(first_result)
                run1_latency = first_result.get("_latency")
                run1_meta = first_result.get("vendorMetadata") or {}
                run1_extraction_ok, _ = check_extraction(run1_meta)

                # Resolve master & vendor text for grading
                master = _get_master_text(fixture)
                vendor = fixture.vendor_text or _extract_vendor_text_from_result(first_result)
                fixture.master_text = master
                fixture.vendor_text = vendor if vendor else None

                run1_reason = check_output(run1_raw, fixture.master_text, fixture.vendor_text)
                run1_status = "excluded" if run1_reason else "pending"
                _store_run(
                    conn, version_id, fixture, run1_raw, comparison_job_id, run1_latency,
                    run1_status, run1_reason, run1_extraction_ok, job_id,
                    first_result.get("_trace"),
                )
                completed += 1
                update_job_progress(conn, job_id, completed)

                # Repeats 2..N via retry
                for _ in range(repeats - 1):
                    try:
                        result = client.run_repeat(fixture.backend_doc_id, comparison_job_id)
                        raw = BackendClient.serialize_comparison(result)
                        latency = result.get("_latency")
                        meta = result.get("vendorMetadata") or {}
                        extraction_ok, _ = check_extraction(meta)
                        reason = check_output(raw, fixture.master_text, fixture.vendor_text)
                        status = "excluded" if reason else "pending"
                        _store_run(
                            conn, version_id, fixture, raw, comparison_job_id, latency,
                            status, reason, extraction_ok, job_id, result.get("_trace"),
                        )
                    except BackendError as exc:
                        if exc.transient:
                            logger.warning("[RunService] Transient error on repeat for %s, retrying once", fixture.doc_id)
                            time.sleep(5)
                            try:
                                result = client.run_repeat(fixture.backend_doc_id, comparison_job_id)
                                raw = BackendClient.serialize_comparison(result)
                                latency = result.get("_latency")
                                meta = result.get("vendorMetadata") or {}
                                extraction_ok, _ = check_extraction(meta)
                                reason = check_output(raw, fixture.master_text, fixture.vendor_text)
                                status = "excluded" if reason else "pending"
                                _store_run(
                                    conn, version_id, fixture, raw, comparison_job_id, latency,
                                    status, reason, extraction_ok, job_id, result.get("_trace"),
                                )
                            except BackendError as exc2:
                                _store_run(
                                    conn, version_id, fixture, None, comparison_job_id, None,
                                    "excluded", f"{exc2.reason}: {exc2.detail}" if exc2.detail else exc2.reason, False, job_id,
                                )
                        else:
                            _store_run(
                                conn, version_id, fixture, None, comparison_job_id, None,
                                "excluded", f"{exc.reason}: {exc.detail}" if exc.detail else exc.reason, False, job_id,
                            )
                    completed += 1
                    update_job_progress(conn, job_id, completed)

                continue

            # --- Legacy mode: pre-existing backend_doc_id ---
            # Ensure master/vendor text is populated from backend if not in fixture
            fixture.master_text = _get_master_text(fixture)

            try:
                comparison_job_id = client.get_comparison_job_id(fixture.backend_doc_id)
            except BackendError as exc:
                for _ in range(repeats):
                    _store_run(
                        conn, version_id, fixture, None, None, None, "excluded",
                        f"{exc.reason}: {exc.detail}" if exc.detail else exc.reason, False, job_id,
                    )
                    completed += 1
                    update_job_progress(conn, job_id, completed)
                continue

            for _ in range(repeats):
                try:
                    result = client.run_repeat(fixture.backend_doc_id, comparison_job_id)
                    raw = BackendClient.serialize_comparison(result)
                    latency = result.get("_latency")
                    meta = result.get("vendorMetadata") or {}
                    extraction_ok, _ = check_extraction(meta)

                    # Vendor text: use fixture snapshot if available, else derive from result
                    if not fixture.vendor_text:
                        fixture.vendor_text = _extract_vendor_text_from_result(result) or None

                    reason = check_output(raw, fixture.master_text, fixture.vendor_text)
                    status = "excluded" if reason else "pending"
                    _store_run(
                        conn, version_id, fixture, raw, comparison_job_id, latency,
                        status, reason, extraction_ok, job_id, result.get("_trace"),
                    )
                except BackendError as exc:
                    if exc.transient:
                        logger.warning("[RunService] Transient error on repeat for %s, retrying once", fixture.doc_id)
                        time.sleep(5)
                        try:
                            result = client.run_repeat(fixture.backend_doc_id, comparison_job_id)
                            raw = BackendClient.serialize_comparison(result)
                            latency = result.get("_latency")
                            meta = result.get("vendorMetadata") or {}
                            extraction_ok, _ = check_extraction(meta)
                            if not fixture.vendor_text:
                                fixture.vendor_text = _extract_vendor_text_from_result(result) or None
                            reason = check_output(raw, fixture.master_text, fixture.vendor_text)
                            status = "excluded" if reason else "pending"
                            _store_run(
                                conn, version_id, fixture, raw, comparison_job_id, latency,
                                status, reason, extraction_ok, job_id, result.get("_trace"),
                            )
                        except BackendError as exc2:
                            _store_run(
                                conn, version_id, fixture, None, comparison_job_id, None,
                                "excluded", f"{exc2.reason}: {exc2.detail}" if exc2.detail else exc2.reason, False, job_id,
                            )
                    else:
                        _store_run(
                            conn, version_id, fixture, None, comparison_job_id, None,
                            "excluded", f"{exc.reason}: {exc.detail}" if exc.detail else exc.reason, False, job_id,
                        )
                completed += 1
                update_job_progress(conn, job_id, completed)

        if not was_stopped:
            update_job_progress(conn, job_id, completed, "done")
        conn.close()

        # Auto-grade after all runs complete
        if auto_grade and not was_stopped:
            logger.info("Auto-grading version '%s'...", version_label)
            try:
                from pbg_eval.services.grade import grade_version
                result = grade_version(version_label, config)
                logger.info(
                    "Auto-grade complete: graded=%d excluded=%d errors=%d",
                    result["graded"], result["excluded"], len(result["errors"]),
                )
            except Exception as exc:
                logger.error("Auto-grade failed: %s", exc)

    except Exception as exc:
        update_job_progress(conn, job_id, completed, "failed", str(exc))
        conn.close()


def start_run(
    version_label: str,
    docs_dir: Path,
    repeats: int = 5,
    allow_prod: bool = False,
    prompt_hash: str = "",
    model_config: str = "{}",
    config: Config | None = None,
) -> tuple[int, int]:
    """Create eval_job and return (job_id, version_id). Caller runs execute_run_batch."""
    config = config or get_config()
    conn = connect(config.db_path)
    fixtures = load_fixtures(docs_dir)
    version_id = get_or_create_version(conn, version_label, prompt_hash, model_config)
    job_id = create_eval_job(conn, version_id, len(fixtures) * repeats)
    conn.close()
    return job_id, version_id
