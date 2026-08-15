"""Router for fault detection and healing telemetry."""

from __future__ import annotations

import logging
from fastapi import APIRouter

from app.schemas import FaultSummaryResponse
from pbg_eval.services.report import get_fault_summary

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/faults", tags=["faults"])


@router.get("/summary", response_model=FaultSummaryResponse)
def get_fault_telemetry():
    """Retrieve fault detection and auto-healing summary metrics and event log."""
    return get_fault_summary()
