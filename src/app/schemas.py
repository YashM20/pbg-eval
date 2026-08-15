"""Pydantic schemas for REST API endpoints."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class BatchRequest(BaseModel):
    version: str
    docs_dir: str
    repeats: int = Field(default=5, ge=1, le=20)
    allow_prod: bool = False
    auto_grade: bool = True
    prompt_hash: str = ""
    model_config_json: str = "{}"


class BatchStartResponse(BaseModel):
    batch_id: int
    status: str = "started"


class BatchDocStatus(BaseModel):
    doc_id: str
    total: int
    completed: int
    pending: int
    excluded: int
    error: str | None = None


class BatchStatusResponse(BaseModel):
    batch_id: int
    version_id: int
    status: str
    total: int
    completed: int
    error: str | None = None
    started_at: str
    finished_at: str | None = None
    docs: list[BatchDocStatus] = []


class GradeRequest(BaseModel):
    version: str


class GradeResponse(BaseModel):
    version: str
    graded: int
    excluded: int
    errors: list[str]


class FaultEventDetail(BaseModel):
    id: int
    run_id: int | None
    job_id: int | None
    doc_id: str | None = None
    fault_type: str
    error_message: str | None
    detected_at: str
    remedy_applied: str | None
    success: int


class FaultSummaryItem(BaseModel):
    fault_type: str
    count: int
    healed: int | None = 0


class FaultSummaryResponse(BaseModel):
    summary: list[FaultSummaryItem]
    recent_events: list[FaultEventDetail]


class DaemonStartRequest(BaseModel):
    interval_seconds: int = Field(default=3600, ge=60)
    docs_dir: str = "sample_docs"
    repeats: int = Field(default=3, ge=1, le=20)


class DaemonStatusResponse(BaseModel):
    is_running: bool
    interval_seconds: int
    last_sweep_at: str | None
    total_sweeps: int
    active_job_id: int | None
    last_error: str | None


class SweepTriggerRequest(BaseModel):
    version_label: str | None = None
    docs_dir: str | None = None
    repeats: int | None = None


class SweepTriggerResponse(BaseModel):
    job_id: int
    status: str = "started"
