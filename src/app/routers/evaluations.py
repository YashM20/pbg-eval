"""Consolidated router for evaluation batches, versions, runs, traces, and metrics."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.schemas import BatchRequest, BatchStartResponse, BatchStatusResponse, GradeRequest, GradeResponse
from pbg_eval.analytics.clause_matrix import compute_version_clause_matrix, get_multi_version_clause_heatmap
from pbg_eval.analytics.trace_diagnostics import analyze_thinking_trace
from pbg_eval.analytics.unified_metrics import get_unified_version_payload
from pbg_eval.clients.backend import BackendClient
from pbg_eval.clients.gemini import GeminiClient
from pbg_eval.config import get_config
from pbg_eval.db import connect
from pbg_eval.extraction.analytics import (
    get_extraction_leaderboard,
    get_run_extraction_grade,
    get_version_extraction_matrix,
    grade_version_metadata,
)
from pbg_eval.models import compute_overall
from pbg_eval.services.grade import grade_version
from pbg_eval.services.report import list_versions, version_runs
from pbg_eval.services.run import execute_run_batch, get_eval_job, get_job_doc_status, start_run, stop_run
from pbg_eval.services.versioning import discover_benchmark_documents, get_next_version_label

logger = logging.getLogger(__name__)

router = APIRouter(tags=["evaluations"])


# --- Workspace Auto-Discovery & Version Suggestion ---

@router.get("/api/versions/suggest-label")
def suggest_version():
    """Auto-suggest next logical version label based on existing records."""
    return {"suggested_label": get_next_version_label()}


@router.get("/api/versions/discover-documents")
def list_workspace_documents():
    """Auto-discover benchmark PDFs in workspace."""
    return {"documents": discover_benchmark_documents()}


# --- Batches ---

@router.post("/api/batches", response_model=BatchStartResponse)
def create_batch(body: BatchRequest, background_tasks: BackgroundTasks):
    docs_dir = Path(body.docs_dir)
    if not docs_dir.is_dir():
        raise HTTPException(400, f"docs_dir not found: {body.docs_dir}")

    config = get_config()
    if not config.is_staging() and not (config.allow_prod or body.allow_prod):
        raise HTTPException(400, "Non-staging backend requires allow_prod=true")

    ver_label = body.version or get_next_version_label()
    job_id, _ = start_run(
        version_label=ver_label,
        docs_dir=docs_dir,
        repeats=body.repeats,
        allow_prod=body.allow_prod,
        prompt_hash=body.prompt_hash,
        model_config=body.model_config_json,
        config=config,
    )
    background_tasks.add_task(
        execute_run_batch,
        job_id=job_id,
        version_label=ver_label,
        docs_dir=docs_dir,
        repeats=body.repeats,
        allow_prod=body.allow_prod,
        auto_grade=body.auto_grade,
        config=config,
    )
    return BatchStartResponse(batch_id=job_id)


@router.post("/api/batches/upload", response_model=BatchStartResponse)
async def upload_batch(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    version: str = Form(""),
    repeats: int = Form(5),
    allow_prod: bool = Form(False),
    auto_grade: bool = Form(True),
    prompt_hash: str = Form(""),
    model_config_json: str = Form("{}"),
):
    if not files:
        raise HTTPException(400, "No files uploaded")

    config = get_config()
    if not config.is_staging() and not (config.allow_prod or allow_prod):
        raise HTTPException(400, "Non-staging backend requires allow_prod=true")

    batch_dir = Path("data/uploads") / str(uuid.uuid4())
    batch_dir.mkdir(parents=True, exist_ok=True)

    for upload in files:
        filename = upload.filename or "uploaded_doc.pdf"
        target_path = batch_dir / filename
        content = await upload.read()
        target_path.write_bytes(content)

    ver_label = version.strip() if version and version.strip() else get_next_version_label()
    job_id, _ = start_run(
        version_label=ver_label,
        docs_dir=batch_dir,
        repeats=repeats,
        allow_prod=allow_prod,
        prompt_hash=prompt_hash,
        model_config=model_config_json,
        config=config,
    )
    background_tasks.add_task(
        execute_run_batch,
        job_id=job_id,
        version_label=ver_label,
        docs_dir=batch_dir,
        repeats=repeats,
        allow_prod=allow_prod,
        auto_grade=auto_grade,
        config=config,
    )
    return BatchStartResponse(batch_id=job_id)


@router.post("/api/batches/{batch_id}/stop")
def stop_batch(batch_id: int):
    config = get_config()
    conn = connect(config.db_path)
    job = get_eval_job(conn, batch_id)
    if not job:
        conn.close()
        raise HTTPException(404, "Batch not found")
    if job["status"] != "running":
        conn.close()
        raise HTTPException(400, f"Batch is not running (status: {job['status']})")

    backend_job_ids = [
        str(row["backend_job_id"])
        for row in conn.execute(
            "SELECT backend_job_id FROM run WHERE job_id = ? AND backend_job_id IS NOT NULL",
            (batch_id,),
        )
    ]
    conn.close()

    if backend_job_ids:
        try:
            client = BackendClient(config)
            client.login()
            for jid in backend_job_ids:
                client.cancel_job(jid)
        except Exception:
            pass

    stop_run(connect(config.db_path), batch_id)
    return {"message": f"Batch {batch_id} stopped"}


@router.get("/api/batches/{batch_id}", response_model=BatchStatusResponse)
def get_batch(batch_id: int):
    conn = connect(get_config().db_path)
    job = get_eval_job(conn, batch_id)
    docs = get_job_doc_status(conn, batch_id) if job else []
    conn.close()
    if not job:
        raise HTTPException(404, "Batch not found")
    return BatchStatusResponse(
        batch_id=job["id"],
        version_id=job["version_id"],
        status=job["status"],
        total=job["total"],
        completed=job["completed"],
        error=job["error"],
        started_at=job["started_at"],
        finished_at=job.get("finished_at"),
        docs=docs,
    )


# --- Versions & Unified Version Workspace ---

@router.get("/api/versions")
def get_versions():
    """Retrieve version leaderboard."""
    return list_versions()


@router.get("/api/versions/{label}/workspace")
def get_version_workspace(label: str):
    """Retrieve complete single-pass unified version workspace (runs, clause matrix, extraction, diagnosis)."""
    try:
        return get_unified_version_payload(label)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        logger.error("[EvaluationsRouter] Failed to fetch version workspace: %s", exc)
        raise HTTPException(500, str(exc))


@router.get("/api/versions/{label}/runs")
def get_version_runs(label: str):
    """Retrieve runs for a version."""
    try:
        return version_runs(label)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


# --- Runs & Traces ---

@router.get("/api/runs/{run_id}")
def get_run(run_id: int):
    conn = connect(get_config().db_path)
    row = conn.execute(
        """
        SELECT r.*, g.overall_score, g.deviation_recall, g.deviation_precision,
               g.severity_correctness, g.reasoning_quality, g.schema_integrity,
               g.scope_discipline, g.grader_notes, g.independent_read
        FROM run r
        LEFT JOIN grade g ON g.run_id = r.id
        WHERE r.id = ?
        """,
        (run_id,),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, f"Run {run_id} not found")
    return dict(row)


@router.get("/api/runs/{run_id}/trace-analysis")
def get_trace_analysis(run_id: int):
    conn = connect(get_config().db_path)
    row = conn.execute("SELECT thinking_trace, raw_qwen_output FROM run WHERE id = ?", (run_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, f"Run {run_id} not found")
    return analyze_thinking_trace(row["thinking_trace"], row["raw_qwen_output"])


@router.post("/api/runs/{run_id}/regrade")
def regrade_run(run_id: int):
    config = get_config()
    conn = connect(config.db_path)
    row = conn.execute("SELECT * FROM run WHERE id = ?", (run_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, f"Run {run_id} not found")

    master = row["master_text"] or ""
    vendor = row["vendor_text"] or ""
    raw = row["raw_qwen_output"] or ""

    if not master or not raw:
        conn.close()
        raise HTTPException(400, "Run missing master text or raw output")

    gemini = GeminiClient(config)
    try:
        import json
        derivation = gemini.derive(master, vendor)
        independent_read = json.dumps(derivation, ensure_ascii=False)
        result = gemini.score(master, vendor, independent_read, raw)

        if result.get("exclude"):
            reason = result.get("exclusion_reason") or "semantic_exclusion"
            conn.execute("UPDATE run SET status = 'excluded', exclusion_reason = ? WHERE id = ?", (reason, run_id))
            conn.execute("DELETE FROM grade WHERE run_id = ?", (run_id,))
            conn.commit()
            conn.close()
            return {"status": "excluded", "reason": reason}

        scores = result.get("scores") or {}
        scope = float(scores.get("scope_discipline", 10))
        overall = compute_overall(
            {k: float(scores.get(k, 0)) for k in scores},
            config.score_weights,
            scope,
            config.scope_penalty,
        )

        def _to_float(v: Any, default: float = 0.0) -> float:
            try:
                return float(v) if v is not None else default
            except (ValueError, TypeError):
                return default

        conn.execute(
            """
            INSERT INTO grade (
                run_id, deviation_recall, deviation_precision, severity_correctness,
                reasoning_quality, schema_integrity, scope_discipline, overall_score,
                independent_read, grader_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                deviation_recall = excluded.deviation_recall,
                deviation_precision = excluded.deviation_precision,
                severity_correctness = excluded.severity_correctness,
                reasoning_quality = excluded.reasoning_quality,
                schema_integrity = excluded.schema_integrity,
                scope_discipline = excluded.scope_discipline,
                overall_score = excluded.overall_score,
                independent_read = excluded.independent_read,
                grader_notes = excluded.grader_notes,
                graded_at = datetime('now')
            """,
            (
                run_id,
                _to_float(scores.get("deviation_recall")),
                _to_float(scores.get("deviation_precision")),
                _to_float(scores.get("severity_correctness")),
                _to_float(scores.get("reasoning_quality")),
                _to_float(scores.get("schema_integrity")),
                _to_float(scores.get("scope_discipline"), 10.0),
                overall,
                independent_read,
                result.get("grader_notes"),
            ),
        )
        conn.execute("UPDATE run SET status = 'scored' WHERE id = ?", (run_id,))

        # Also evaluate metadata extraction if available
        try:
            from pbg_eval.extraction.judge import MetadataJudge
            judge = MetadataJudge(config)
            target_data = json.loads(raw)
            target_meta = target_data.get("vendorMetadata", {})
            ground_meta = derivation.get("vendorMetadata", {}) if isinstance(derivation, dict) else {}
            if not ground_meta and vendor:
                ground_meta = judge.derive_ground_truth(vendor)

            eval_res = judge.evaluate_metadata(target_meta, ground_meta)
            fs = eval_res["field_scores"]
            em = eval_res["exact_matches"]
            overall_ext = eval_res["overall_extraction_score"]

            conn.execute(
                """
                INSERT INTO extraction_grade (
                    run_id, score_bg_number, score_amendment_date, score_validity_date,
                    score_claim_period, score_amount, score_po_no, score_vendor_name,
                    score_bank_branch_address, overall_extraction_score,
                    em_bg_number, em_amendment_date, em_validity_date, em_claim_period,
                    em_amount, em_po_no, em_vendor_name, em_bank_branch_address,
                    target_metadata, ground_truth_metadata, field_discrepancies
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(run_id) DO UPDATE SET
                    score_bg_number = excluded.score_bg_number,
                    score_amendment_date = excluded.score_amendment_date,
                    score_validity_date = excluded.score_validity_date,
                    score_claim_period = excluded.score_claim_period,
                    score_amount = excluded.score_amount,
                    score_po_no = excluded.score_po_no,
                    score_vendor_name = excluded.score_vendor_name,
                    score_bank_branch_address = excluded.score_bank_branch_address,
                    overall_extraction_score = excluded.overall_extraction_score,
                    em_bg_number = excluded.em_bg_number,
                    em_amendment_date = excluded.em_amendment_date,
                    em_validity_date = excluded.em_validity_date,
                    em_claim_period = excluded.em_claim_period,
                    em_amount = excluded.em_amount,
                    em_po_no = excluded.em_po_no,
                    em_vendor_name = excluded.em_vendor_name,
                    em_bank_branch_address = excluded.em_bank_branch_address,
                    target_metadata = excluded.target_metadata,
                    ground_truth_metadata = excluded.ground_truth_metadata,
                    field_discrepancies = excluded.field_discrepancies,
                    graded_at = datetime('now')
                """,
                (
                    run_id,
                    fs["score_bg_number"], fs["score_amendment_date"], fs["score_validity_date"],
                    fs["score_claim_period"], fs["score_amount"], fs["score_po_no"],
                    fs["score_vendor_name"], fs["score_bank_branch_address"], overall_ext,
                    em["em_bg_number"], em["em_amendment_date"], em["em_validity_date"],
                    em["em_claim_period"], em["em_amount"], em["em_po_no"],
                    em["em_vendor_name"], em["em_bank_branch_address"],
                    json.dumps(target_meta), json.dumps(ground_meta), json.dumps(eval_res["field_discrepancies"]),
                ),
            )
        except Exception:
            pass

        conn.commit()
        conn.close()
        return {"status": "scored", "overall_score": overall, "scores": scores}
    except Exception as exc:
        conn.close()
        raise HTTPException(500, f"Regrade failed: {exc}")


@router.post("/api/runs/{run_id}/replay")
def replay_historical_run(run_id: int):
    """Execute an exact rerun of a historical run preserving frozen parameters."""
    from pbg_eval.services.run import replay_run
    try:
        new_run_id = replay_run(run_id)
        return {"replayed": True, "original_run_id": run_id, "new_run_id": new_run_id}
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        logger.error("[EvaluationsRouter] Replay failed: %s", exc)
        raise HTTPException(500, f"Replay failed: {exc}")


# --- Batch Grading Triggers ---

@router.post("/api/grade", response_model=GradeResponse)
def grade_runs(body: GradeRequest):
    try:
        result = grade_version(body.version)
        grade_version_metadata(body.version)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return GradeResponse(version=body.version, **result)


@router.post("/api/extraction/grade/{version_label}")
def grade_metadata_endpoint(version_label: str):
    try:
        return grade_version_metadata(version_label)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


# --- Analytics & Extraction Sub-routes (Preserved for compatibility) ---

@router.get("/api/analytics/heatmap")
def get_heatmap_route():
    return get_multi_version_clause_heatmap()


@router.get("/api/analytics/versions/{label}/matrix")
def get_clause_matrix_route(label: str):
    try:
        return compute_version_clause_matrix(label)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/api/extraction/leaderboard")
def get_extraction_leaderboard_route():
    return get_extraction_leaderboard()


@router.get("/api/extraction/versions/{label}/matrix")
def get_extraction_matrix_route(label: str):
    try:
        return get_version_extraction_matrix(label)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/api/extraction/runs/{run_id}")
def get_run_extraction_grade_route(run_id: int):
    grade = get_run_extraction_grade(run_id)
    if not grade:
        raise HTTPException(404, f"No extraction grade found for run {run_id}")
    return grade
