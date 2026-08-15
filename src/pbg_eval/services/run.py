"""Batch execution service with fault healing and isolated trace capture."""

from __future__ import annotations

import hashlib
import json
import logging
import sqlite3
import time
from pathlib import Path

from pbg_eval.clients.backend import BackendClient, BackendError
from pbg_eval.config import Config, get_config
from pbg_eval.db import connect
from pbg_eval.exclude import check_output
from pbg_eval.extraction import check_extraction
from pbg_eval.healing.healer import FaultHealer
from pbg_eval.models import DocFixture

logger = logging.getLogger(__name__)


def load_fixtures(docs_dir: Path) -> list[DocFixture]:
    """Load fixtures from a directory (JSON fixtures and raw PDFs)."""
    fixtures: list[DocFixture] = []
    json_count = 0
    pdf_count = 0

    if not docs_dir.exists():
        return fixtures

    # JSON fixtures
    for path in sorted(docs_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            pdf_path: Path | None = None
            if data.get("pdf_path"):
                raw = Path(data["pdf_path"])
                pdf_path = raw if raw.is_absolute() else docs_dir / raw

            fixtures.append(
                DocFixture(
                    doc_id=data.get("doc_id", path.stem),
                    backend_doc_id=data.get("backend_doc_id"),
                    pdf_path=pdf_path,
                    master_text=data.get("master_text"),
                    vendor_text=data.get("vendor_text"),
                )
            )
            json_count += 1
        except Exception as exc:
            logger.warning("Could not parse fixture %s: %s", path, exc)

    # Raw PDF files
    json_stems = {f.doc_id for f in fixtures}
    for path in sorted(docs_dir.glob("*.pdf")):
        if path.stem in json_stems:
            continue
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
    prompt_text: str | None = None,
    hyperparameters: str | None = None,
    dataset_fingerprint: str | None = None,
    notes: str | None = None,
) -> int:
    row = conn.execute("SELECT id FROM pipeline_version WHERE label = ?", (label,)).fetchone()
    if row:
        return row[0]
    cur = conn.execute(
        """
        INSERT INTO pipeline_version (
            label, prompt_hash, model_config, prompt_text, hyperparameters, dataset_fingerprint, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            label,
            prompt_hash or hashlib.sha256(label.encode()).hexdigest()[:16],
            model_config,
            prompt_text,
            hyperparameters,
            dataset_fingerprint,
            notes,
        ),
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


def update_job_progress(
    conn: sqlite3.Connection,
    job_id: int,
    completed: int,
    status: str = "running",
    error: str | None = None,
) -> None:
    finished_clause = ", finished_at = datetime('now')" if status in ("completed", "done", "failed", "stopped") else ""
    conn.execute(
        f"UPDATE eval_job SET completed = ?, status = ?, error = ? {finished_clause} WHERE id = ?",
        (completed, status, error, job_id),
    )
    conn.commit()


def stop_run(conn: sqlite3.Connection, job_id: int) -> None:
    conn.execute(
        "UPDATE eval_job SET stopped = 1, status = 'stopped', finished_at = datetime('now') WHERE id = ? AND status = 'running'",
        (job_id,),
    )
    conn.commit()


def get_eval_job(conn: sqlite3.Connection, job_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM eval_job WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None


def get_job_doc_status(conn: sqlite3.Connection, job_id: int) -> list[dict]:
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
    heal_count: int = 0,
) -> int:
    cur = conn.execute(
        """
        INSERT INTO run (
            version_id, job_id, doc_id, backend_doc_id, backend_job_id, latency_seconds,
            raw_qwen_output, thinking_trace, master_text, vendor_text, extraction_ok,
            status, exclusion_reason, heal_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            heal_count,
        ),
    )
    conn.commit()
    return cur.lastrowid  # type: ignore[return-value]


def _extract_vendor_text_from_result(result: dict) -> str:
    deviations = result.get("deviations") or []
    parts: list[str] = []
    for dev in deviations:
        if isinstance(dev, dict):
            clause = dev.get("clauseNo", "")
            appearing = dev.get("appearingInBg", "")
            if appearing and appearing != "Missing":
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
    healer = FaultHealer(client, conn)

    try:
        client.login()
    except Exception as exc:
        healer.handle_backend_failure(exc, doc_id="auth", job_id=job_id)
        update_job_progress(conn, job_id, 0, "failed", str(exc))
        conn.close()
        return

    _cached_master_text: str | None = None

    def _get_master_text(fixture: DocFixture) -> str | None:
        nonlocal _cached_master_text
        if fixture.master_text:
            return fixture.master_text
        if _cached_master_text is None:
            try:
                _cached_master_text = client.get_active_master_text() or ""
            except Exception as exc:
                logger.warning("Could not fetch active master text: %s", exc)
                _cached_master_text = ""
        return _cached_master_text or None

    completed = 0
    was_stopped = False

    try:
        for fixture in fixtures:
            needs_upload = fixture.backend_doc_id is None and fixture.pdf_path is not None
            has_no_source = fixture.backend_doc_id is None and fixture.pdf_path is None

            if has_no_source:
                logger.error("Fixture %s has no source (no PDF or doc_id) — excluding", fixture.doc_id)
                for _ in range(repeats):
                    _store_run(conn, version_id, fixture, None, None, None, "excluded", "no_source", False, job_id)
                    completed += 1
                    update_job_progress(conn, job_id, completed)
                continue

            stopped_row = conn.execute("SELECT stopped FROM eval_job WHERE id = ?", (job_id,)).fetchone()
            if stopped_row and stopped_row["stopped"]:
                logger.info("[RunService] Batch %d was stopped", job_id)
                update_job_progress(conn, job_id, completed, "stopped")
                was_stopped = True
                break

            # Check if comparison already completed on backend
            if fixture.backend_doc_id:
                try:
                    healed = client.get_comparison_if_complete(fixture.backend_doc_id)
                    if healed is not None:
                        logger.info("[RunService] Retrieved completed comparison for %s", fixture.doc_id)
                        raw = BackendClient.serialize_comparison(healed)
                        latency = healed.get("_latency")
                        meta = healed.get("vendorMetadata") or {}
                        extraction_ok, _ = check_extraction(meta)
                        master = _get_master_text(fixture)
                        vendor = fixture.vendor_text or _extract_vendor_text_from_result(healed)
                        fixture.master_text = master
                        fixture.vendor_text = vendor or None
                        reason = check_output(raw, fixture.master_text, fixture.vendor_text)
                        status = "excluded" if reason else "pending"
                        _store_run(
                            conn, version_id, fixture, raw, None, latency,
                            status, reason, extraction_ok, job_id, healed.get("_trace"),
                        )
                        completed += 1
                        update_job_progress(conn, job_id, completed)
                        continue
                except Exception as exc:
                    healer.handle_backend_failure(exc, fixture.doc_id, job_id=job_id)

            # Fresh PDF Upload flow
            if needs_upload:
                comparison_job_id = None
                first_result = None
                heal_count = 0

                try:
                    doc_id, comparison_job_id, first_result = client.upload_and_process_pdf(fixture.pdf_path)
                    fixture.backend_doc_id = doc_id
                except Exception as exc:
                    remedy = healer.handle_backend_failure(exc, fixture.doc_id, job_id=job_id)
                    if remedy.healed:
                        heal_count += 1
                        try:
                            doc_id, comparison_job_id, first_result = client.upload_and_process_pdf(fixture.pdf_path)
                            fixture.backend_doc_id = doc_id
                        except Exception as retry_exc:
                            logger.error("Upload retry failed for %s: %s", fixture.doc_id, retry_exc)
                            for _ in range(repeats):
                                _store_run(
                                    conn, version_id, fixture, None, None, None,
                                    "excluded", f"upload_failed: {retry_exc}", False, job_id,
                                    heal_count=heal_count,
                                )
                                completed += 1
                                update_job_progress(conn, job_id, completed)
                            continue
                    else:
                        for _ in range(repeats):
                            _store_run(
                                conn, version_id, fixture, None, None, None,
                                "excluded", f"upload_failed: {exc}", False, job_id,
                            )
                            completed += 1
                            update_job_progress(conn, job_id, completed)
                        continue

                # Run 1 Store
                run1_raw = BackendClient.serialize_comparison(first_result)
                run1_latency = first_result.get("_latency")
                run1_meta = first_result.get("vendorMetadata") or {}
                run1_extraction_ok, _ = check_extraction(run1_meta)
                master = _get_master_text(fixture)
                vendor = fixture.vendor_text or _extract_vendor_text_from_result(first_result)
                fixture.master_text = master
                fixture.vendor_text = vendor or None

                run1_reason = check_output(run1_raw, fixture.master_text, fixture.vendor_text)
                run1_status = "excluded" if run1_reason else "pending"
                _store_run(
                    conn, version_id, fixture, run1_raw, comparison_job_id, run1_latency,
                    run1_status, run1_reason, run1_extraction_ok, job_id,
                    first_result.get("_trace"), heal_count=heal_count,
                )
                completed += 1
                update_job_progress(conn, job_id, completed)

                # Repeats 2..N
                for _ in range(repeats - 1):
                    repeat_heal = 0
                    try:
                        result = client.run_repeat(fixture.backend_doc_id, comparison_job_id)
                    except Exception as exc:
                        remedy = healer.handle_backend_failure(exc, fixture.doc_id, comparison_job_id, job_id=job_id)
                        if remedy.healed:
                            repeat_heal += 1
                            try:
                                result = client.run_repeat(fixture.backend_doc_id, comparison_job_id)
                            except Exception as retry_exc:
                                _store_run(
                                    conn, version_id, fixture, None, comparison_job_id, None,
                                    "excluded", f"repeat_failed: {retry_exc}", False, job_id,
                                    heal_count=repeat_heal,
                                )
                                completed += 1
                                update_job_progress(conn, job_id, completed)
                                continue
                        else:
                            _store_run(
                                conn, version_id, fixture, None, comparison_job_id, None,
                                "excluded", f"repeat_failed: {exc}", False, job_id,
                            )
                            completed += 1
                            update_job_progress(conn, job_id, completed)
                            continue

                    raw = BackendClient.serialize_comparison(result)
                    latency = result.get("_latency")
                    meta = result.get("vendorMetadata") or {}
                    extraction_ok, _ = check_extraction(meta)
                    reason = check_output(raw, fixture.master_text, fixture.vendor_text)
                    status = "excluded" if reason else "pending"
                    _store_run(
                        conn, version_id, fixture, raw, comparison_job_id, latency,
                        status, reason, extraction_ok, job_id, result.get("_trace"),
                        heal_count=repeat_heal,
                    )
                    completed += 1
                    update_job_progress(conn, job_id, completed)

                continue

            # Pre-existing backend_doc_id mode
            fixture.master_text = _get_master_text(fixture)
            try:
                comparison_job_id = client.get_comparison_job_id(fixture.backend_doc_id)
            except Exception as exc:
                for _ in range(repeats):
                    _store_run(
                        conn, version_id, fixture, None, None, None,
                        "excluded", f"job_id_lookup_failed: {exc}", False, job_id,
                    )
                    completed += 1
                    update_job_progress(conn, job_id, completed)
                continue

            for _ in range(repeats):
                repeat_heal = 0
                try:
                    result = client.run_repeat(fixture.backend_doc_id, comparison_job_id)
                except Exception as exc:
                    remedy = healer.handle_backend_failure(exc, fixture.doc_id, comparison_job_id, job_id=job_id)
                    if remedy.healed:
                        repeat_heal += 1
                        try:
                            result = client.run_repeat(fixture.backend_doc_id, comparison_job_id)
                        except Exception as retry_exc:
                            _store_run(
                                conn, version_id, fixture, None, comparison_job_id, None,
                                "excluded", f"repeat_failed: {retry_exc}", False, job_id,
                                heal_count=repeat_heal,
                            )
                            completed += 1
                            update_job_progress(conn, job_id, completed)
                            continue
                    else:
                        _store_run(
                            conn, version_id, fixture, None, comparison_job_id, None,
                            "excluded", f"repeat_failed: {exc}", False, job_id,
                        )
                        completed += 1
                        update_job_progress(conn, job_id, completed)
                        continue

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
                    heal_count=repeat_heal,
                )
                completed += 1
                update_job_progress(conn, job_id, completed)

        if not was_stopped:
            update_job_progress(conn, job_id, completed, "completed")
    except Exception as exc:
        logger.error("[RunService] Fatal error during batch execution: %s", exc)
        try:
            update_job_progress(conn, job_id, completed, "failed", str(exc))
        except Exception:
            pass
    finally:
        try:
            conn.close()
        except Exception:
            pass

    # Auto-grade comparison and metadata extraction if enabled
    if auto_grade and not was_stopped:
        logger.info("Auto-grading version '%s' (Comparison & Metadata Extraction)...", version_label)
        try:
            from pbg_eval.services.grade import grade_version
            from pbg_eval.extraction.analytics import grade_version_metadata
            grade_res = grade_version(version_label, config)
            logger.info(
                "Auto-grade comparison complete: graded=%d, excluded=%d, errors=%d",
                grade_res["graded"], grade_res["excluded"], len(grade_res["errors"])
            )
            meta_res = grade_version_metadata(version_label)
            logger.info("Auto-grade metadata extraction complete: graded=%d runs", meta_res.get("graded_runs", 0))
        except Exception as exc:
            logger.error("Auto-grade failed: %s", exc)


def start_run(
    version_label: str,
    docs_dir: Path,
    repeats: int = 5,
    allow_prod: bool = False,
    prompt_hash: str = "",
    model_config: str = "{}",
    prompt_text: str | None = None,
    hyperparameters: str | None = None,
    dataset_fingerprint: str | None = None,
    config: Config | None = None,
) -> tuple[int, int]:
    config = config or get_config()
    conn = connect(config.db_path)
    fixtures = load_fixtures(docs_dir)
    version_id = get_or_create_version(
        conn,
        version_label,
        prompt_hash,
        model_config,
        prompt_text=prompt_text,
        hyperparameters=hyperparameters,
        dataset_fingerprint=dataset_fingerprint,
    )
    job_id = create_eval_job(conn, version_id, len(fixtures) * repeats)
    conn.close()
    return job_id, version_id


def replay_run(run_id: int, config: Config | None = None) -> int:
    """Execute an exact replay of a historical run with full provenance preservation."""
    config = config or get_config()
    conn = connect(config.db_path)
    row = conn.execute("SELECT * FROM run WHERE id = ?", (run_id,)).fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Run {run_id} not found")

    version_id = row["version_id"]
    doc_id = row["doc_id"]
    backend_doc_id = row["backend_doc_id"]
    backend_job_id = row["backend_job_id"]
    master_text = row["master_text"]
    vendor_text = row["vendor_text"]

    client = BackendClient(config)
    client.login()

    logger.info("[RunService] Replaying run %d (doc: %s, job: %s)...", run_id, doc_id, backend_job_id)
    result = client.run_repeat(backend_doc_id, backend_job_id)
    raw = BackendClient.serialize_comparison(result)
    latency = result.get("_latency")
    meta = result.get("vendorMetadata") or {}
    extraction_ok, _ = check_extraction(meta)
    reason = check_output(raw, master_text, vendor_text)
    status = "excluded" if reason else "pending"

    fixture = DocFixture(doc_id=doc_id, backend_doc_id=backend_doc_id, master_text=master_text, vendor_text=vendor_text)
    cur = conn.execute(
        """
        INSERT INTO run (
            version_id, job_id, doc_id, backend_doc_id, backend_job_id, latency_seconds,
            raw_qwen_output, thinking_trace, master_text, vendor_text, extraction_ok,
            status, exclusion_reason, heal_count, is_replay
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        """,
        (
            version_id,
            row["job_id"],
            doc_id,
            backend_doc_id,
            backend_job_id,
            latency,
            raw,
            result.get("_trace"),
            master_text,
            vendor_text,
            int(extraction_ok),
            status,
            reason,
            0,
        ),
    )
    new_run_id = cur.lastrowid
    conn.commit()
    conn.close()

    # Re-grade the replayed run
    if status != "excluded":
        try:
            from app.routers.evaluations import regrade_run
            regrade_run(new_run_id)
        except Exception:
            pass

    return new_run_id
