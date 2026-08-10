import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from app.schemas import BatchRequest, BatchStartResponse, BatchStatusResponse
from pbg_eval.clients.backend import BackendClient
from pbg_eval.config import get_config
from pbg_eval.db import connect
from pbg_eval.services.run import execute_run_batch, get_eval_job, get_job_doc_status, start_run, stop_run

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/batches", tags=["batches"])


@router.post("", response_model=BatchStartResponse)
def create_batch(body: BatchRequest, background_tasks: BackgroundTasks):
    logger.info("[BatchesRouter] Received POST /api/batches for version '%s' (docs_dir='%s', repeats=%d, auto_grade=%s)", body.version, body.docs_dir, body.repeats, body.auto_grade)
    docs_dir = Path(body.docs_dir)
    if not docs_dir.is_dir():
        logger.error("[BatchesRouter] docs_dir directory not found: %s", body.docs_dir)
        raise HTTPException(400, f"docs_dir not found: {body.docs_dir}")

    config = get_config()
    if not config.is_staging() and not (config.allow_prod or body.allow_prod):
        logger.error("[BatchesRouter] Refused non-staging backend without allow_prod=true")
        raise HTTPException(400, "Non-staging backend requires allow_prod=true")

    job_id, _ = start_run(
        body.version,
        docs_dir,
        body.repeats,
        body.allow_prod,
        body.prompt_hash,
        body.model_config_json,
        config,
    )
    logger.info("[BatchesRouter] Created batch job_id=%d for version '%s'. Dispatching background task...", job_id, body.version)
    background_tasks.add_task(
        execute_run_batch,
        job_id,
        body.version,
        docs_dir,
        body.repeats,
        body.allow_prod,
        body.auto_grade,
        config,
    )
    return BatchStartResponse(batch_id=job_id)


@router.post("/upload", response_model=BatchStartResponse)
async def upload_batch(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    version: str = Form(...),
    repeats: int = Form(5),
    allow_prod: bool = Form(False),
    auto_grade: bool = Form(True),
    prompt_hash: str = Form(""),
    model_config_json: str = Form("{}"),
):
    logger.info("[BatchesRouter] Received POST /api/batches/upload for version '%s' (%d uploaded files, repeats=%d, auto_grade=%s)", version, len(files), repeats, auto_grade)
    if not files:
        logger.error("[BatchesRouter] Upload batch failed: No files provided in request")
        raise HTTPException(400, "No files uploaded")

    config = get_config()
    if not config.is_staging() and not (config.allow_prod or allow_prod):
        logger.error("[BatchesRouter] Refused non-staging backend without allow_prod=true")
        raise HTTPException(400, "Non-staging backend requires allow_prod=true")

    batch_dir = Path("data/uploads") / str(uuid.uuid4())
    batch_dir.mkdir(parents=True, exist_ok=True)

    for upload in files:
        filename = upload.filename or "uploaded_doc.pdf"
        target_path = batch_dir / filename
        content = await upload.read()
        target_path.write_bytes(content)
        logger.info("[BatchesRouter] Saved uploaded document '%s' (%d bytes) to %s", filename, len(content), target_path)

    job_id, _ = start_run(
        version,
        batch_dir,
        repeats,
        allow_prod,
        prompt_hash,
        model_config_json,
        config,
    )
    logger.info("[BatchesRouter] Created upload batch job_id=%d for version '%s'. Dispatching background task...", job_id, version)
    background_tasks.add_task(
        execute_run_batch,
        job_id,
        version,
        batch_dir,
        repeats,
        allow_prod,
        auto_grade,
        config,
    )
    return BatchStartResponse(batch_id=job_id)


@router.post("/{batch_id}/stop")
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

    # Cancel active backend jobs for this batch
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
            for job_id in backend_job_ids:
                try:
                    client.cancel_job(job_id)
                    logger.info("[BatchesRouter] Cancelled backend job %s", job_id)
                except Exception as exc:
                    logger.warning("[BatchesRouter] Failed to cancel backend job %s: %s", job_id, exc)
        except Exception as exc:
            logger.warning("[BatchesRouter] Could not connect to backend for cancellation: %s", exc)

    stop_run(connect(config.db_path), batch_id)
    logger.info("[BatchesRouter] Stopped batch %d", batch_id)
    return {"message": f"Batch {batch_id} stopped"}


@router.get("/{batch_id}", response_model=BatchStatusResponse)
def get_batch(batch_id: int):
    conn = connect(get_config().db_path)
    job = get_eval_job(conn, batch_id)
    docs = get_job_doc_status(conn, batch_id) if job else []
    conn.close()
    if not job:
        logger.warning("[BatchesRouter] GET /api/batches/%d: Batch not found", batch_id)
        raise HTTPException(404, "Batch not found")
    return BatchStatusResponse(
        batch_id=job["id"],
        version_id=job["version_id"],
        status=job["status"],
        total=job["total"],
        completed=job["completed"],
        error=job["error"],
        started_at=job["started_at"],
        docs=docs,
    )

