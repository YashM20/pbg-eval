"""Consolidated router for daemon automation, telemetry, quality gates, and report comparison."""

from __future__ import annotations

import logging
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.schemas import DaemonStartRequest, DaemonStatusResponse, FaultSummaryResponse, SweepTriggerRequest, SweepTriggerResponse
from pbg_eval.services.auto_eval import AutoEvalDaemon
from pbg_eval.services.export_report import generate_html_compliance_report
from pbg_eval.services.report import compare_versions, get_fault_summary, list_versions

logger = logging.getLogger(__name__)

router = APIRouter(tags=["automation"])


# --- AutoEval Continuous Daemon ---

@router.get("/api/auto/status", response_model=DaemonStatusResponse)
def get_status():
    daemon = AutoEvalDaemon.get_instance()
    status = daemon.get_status()
    return DaemonStatusResponse(**asdict(status))


@router.post("/api/auto/start", response_model=DaemonStatusResponse)
def start_daemon(body: DaemonStartRequest = DaemonStartRequest()):
    daemon = AutoEvalDaemon.get_instance()
    daemon.start(
        interval_seconds=body.interval_seconds,
        docs_dir=body.docs_dir,
        repeats=body.repeats,
    )
    return DaemonStatusResponse(**asdict(daemon.get_status()))


@router.post("/api/auto/stop", response_model=DaemonStatusResponse)
def stop_daemon():
    daemon = AutoEvalDaemon.get_instance()
    daemon.stop()
    return DaemonStatusResponse(**asdict(daemon.get_status()))


@router.post("/api/auto/sweep", response_model=SweepTriggerResponse)
def trigger_sweep(body: SweepTriggerRequest, background_tasks: BackgroundTasks):
    daemon = AutoEvalDaemon.get_instance()
    try:
        background_tasks.add_task(
            daemon.trigger_sweep_now,
            version_label=body.version_label,
            docs_dir=body.docs_dir,
            repeats=body.repeats,
        )
        return SweepTriggerResponse(job_id=0, status="scheduled")
    except Exception as exc:
        logger.error("[AutomationRouter] Failed to trigger sweep: %s", exc)
        raise HTTPException(500, str(exc))


# --- Fault Telemetry ---

@router.get("/api/faults/summary", response_model=FaultSummaryResponse)
def get_fault_telemetry():
    return get_fault_summary()


# --- Quality Gates & Compliance Export ---

class QualityGateRequest(BaseModel):
    version_label: str
    min_overall_score: float = Field(default=7.5, ge=0.0, le=10.0)
    max_exclusion_rate: float = Field(default=0.05, ge=0.0, le=1.0)
    max_stdev: float = Field(default=1.5, ge=0.0)


class QualityGateResponse(BaseModel):
    version_label: str
    verdict: str
    checks: dict[str, dict[str, Any]]
    score_mean: float | None
    exclusion_rate: float
    stdev: float | None


@router.post("/api/gates/evaluate", response_model=QualityGateResponse)
def evaluate_gate(body: QualityGateRequest):
    versions = {v["label"]: v for v in list_versions()}
    v_data = versions.get(body.version_label)
    if not v_data:
        raise HTTPException(404, f"Version '{body.version_label}' not found")

    stats = v_data["score_stats"]
    mean_score = stats.get("mean")
    stdev = stats.get("stdev")
    excl_rate = v_data.get("exclusion_rate", 0.0)

    score_pass = mean_score is not None and mean_score >= body.min_overall_score
    excl_pass = excl_rate <= body.max_exclusion_rate
    stdev_pass = stdev is None or stdev <= body.max_stdev

    verdict = "PASSED" if (score_pass and excl_pass and stdev_pass) else "BLOCKED"

    return QualityGateResponse(
        version_label=body.version_label,
        verdict=verdict,
        checks={
            "mean_score": {
                "threshold": body.min_overall_score,
                "actual": mean_score,
                "passed": score_pass,
            },
            "exclusion_rate": {
                "threshold": body.max_exclusion_rate,
                "actual": excl_rate,
                "passed": excl_pass,
            },
            "stdev": {
                "threshold": body.max_stdev,
                "actual": stdev,
                "passed": stdev_pass,
            },
        },
        score_mean=mean_score,
        exclusion_rate=excl_rate,
        stdev=stdev,
    )


@router.get("/api/gates/export/html")
def export_html(version: str | None = Query(None)):
    html_content = generate_html_compliance_report(version)
    return Response(content=html_content, media_type="text/html")


# --- Version Comparison ---

@router.get("/api/report/compare")
def compare(v1: str = Query(...), v2: str = Query(...)):
    try:
        from pbg_eval.analytics.unified_metrics import compare_versions_normalized
        return compare_versions_normalized(v1, v2)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
