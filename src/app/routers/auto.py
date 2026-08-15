"""Router for controlling autonomous continuous evaluation daemon and sweeps."""

from __future__ import annotations

import logging
from dataclasses import asdict
from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.schemas import DaemonStartRequest, DaemonStatusResponse, SweepTriggerRequest, SweepTriggerResponse
from pbg_eval.services.auto_eval import AutoEvalDaemon

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auto", tags=["auto-eval"])


@router.get("/status", response_model=DaemonStatusResponse)
def get_status():
    """Get the running state and metrics of the autonomous evaluation daemon."""
    daemon = AutoEvalDaemon.get_instance()
    status = daemon.get_status()
    return DaemonStatusResponse(**asdict(status))


@router.post("/start", response_model=DaemonStatusResponse)
def start_daemon(body: DaemonStartRequest = DaemonStartRequest()):
    """Start the autonomous evaluation background daemon."""
    daemon = AutoEvalDaemon.get_instance()
    daemon.start(
        interval_seconds=body.interval_seconds,
        docs_dir=body.docs_dir,
        repeats=body.repeats,
    )
    return DaemonStatusResponse(**asdict(daemon.get_status()))


@router.post("/stop", response_model=DaemonStatusResponse)
def stop_daemon():
    """Stop the autonomous evaluation background daemon."""
    daemon = AutoEvalDaemon.get_instance()
    daemon.stop()
    return DaemonStatusResponse(**asdict(daemon.get_status()))


@router.post("/sweep", response_model=SweepTriggerResponse)
def trigger_sweep(body: SweepTriggerRequest, background_tasks: BackgroundTasks):
    """Trigger an immediate autonomous evaluation sweep."""
    daemon = AutoEvalDaemon.get_instance()
    try:
        # Schedule sweep in background task
        background_tasks.add_task(
            daemon.trigger_sweep_now,
            version_label=body.version_label,
            docs_dir=body.docs_dir,
            repeats=body.repeats,
        )
        return SweepTriggerResponse(job_id=0, status="scheduled")
    except Exception as exc:
        logger.error("[AutoRouter] Failed to trigger sweep: %s", exc)
        raise HTTPException(500, str(exc))
