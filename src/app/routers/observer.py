"""FastAPI router for Production Drift Sentinel & Observer."""

from __future__ import annotations

from fastapi import APIRouter
from pbg_eval.services.observer import get_production_drift_telemetry

router = APIRouter(prefix="/api/observer", tags=["drift-observer"])


@router.get("/drift")
def get_drift_telemetry():
    """Retrieve live production drift analysis, confidence distribution, and anomaly alerts."""
    return get_production_drift_telemetry()
