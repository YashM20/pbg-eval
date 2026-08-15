"""Router for CI/CD regression quality gates and compliance export."""

from __future__ import annotations

import logging
from typing import Any
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from pbg_eval.services.export_report import generate_html_compliance_report
from pbg_eval.services.report import list_versions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gates", tags=["quality-gates"])


class QualityGateRequest(BaseModel):
    version_label: str
    min_overall_score: float = Field(default=7.5, ge=0.0, le=10.0)
    max_exclusion_rate: float = Field(default=0.05, ge=0.0, le=1.0)
    max_stdev: float = Field(default=1.5, ge=0.0)


class QualityGateResponse(BaseModel):
    version_label: str
    verdict: str  # PASSED | BLOCKED
    checks: dict[str, dict[str, Any]]
    score_mean: float | None
    exclusion_rate: float
    stdev: float | None


@router.post("/evaluate", response_model=QualityGateResponse)
def evaluate_gate(body: QualityGateRequest):
    """Evaluate whether a pipeline version meets production deployment thresholds."""
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


@router.get("/export/html")
def export_html(version: str | None = Query(None)):
    """Export standalone, audit-ready HTML compliance report."""
    html_content = generate_html_compliance_report(version)
    return Response(content=html_content, media_type="text/html")
