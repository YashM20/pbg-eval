"""Plain dataclasses and score helpers for pbg-eval."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pbg_eval.config import ScoreWeights, ScopePenalty


@dataclass
class DocFixture:
    doc_id: str
    backend_doc_id: str | None = None
    pdf_path: Path | None = None
    master_text: str | None = None
    vendor_text: str | None = None


@dataclass
class PipelineVersion:
    id: int
    label: str
    prompt_hash: str
    model_config: str
    created_at: str
    notes: str | None = None


@dataclass
class EvalJob:
    id: int
    version_id: int
    status: str
    total: int
    completed: int
    error: str | None
    started_at: str
    finished_at: str | None = None
    stopped: int = 0


@dataclass
class Run:
    id: int
    version_id: int
    doc_id: str
    backend_doc_id: str | None
    backend_job_id: str | None
    timestamp: str
    latency_seconds: float | None
    raw_qwen_output: str | None
    thinking_trace: str | None
    master_text: str | None
    vendor_text: str | None
    extraction_ok: bool
    status: str
    exclusion_reason: str | None = None
    heal_count: int = 0
    job_id: int | None = None


@dataclass
class Grade:
    id: int
    run_id: int
    deviation_recall: float
    deviation_precision: float
    severity_correctness: float
    reasoning_quality: float
    schema_integrity: float
    scope_discipline: float
    overall_score: float
    independent_read: str
    grader_notes: str | None
    graded_at: str | None = None


@dataclass
class ExtractionGrade:
    id: int
    run_id: int
    score_bg_number: float
    score_amendment_date: float
    score_validity_date: float
    score_claim_period: float
    score_amount: float
    score_po_no: float
    score_vendor_name: float
    score_bank_branch_address: float
    overall_extraction_score: float
    em_bg_number: int
    em_amendment_date: int
    em_validity_date: int
    em_claim_period: int
    em_amount: int
    em_po_no: int
    em_vendor_name: int
    em_bank_branch_address: int
    target_metadata: str
    ground_truth_metadata: str
    field_discrepancies: str
    graded_at: str | None = None


@dataclass
class FaultLog:
    id: int
    run_id: int | None
    job_id: int | None
    fault_type: str
    error_message: str | None
    detected_at: str
    remedy_applied: str | None
    success: int = 0


def compute_overall(
    scores: dict[str, float],
    weights: ScoreWeights,
    scope: float,
    scope_penalty: ScopePenalty,
) -> float:
    w = {
        "deviation_recall": weights.deviation_recall,
        "deviation_precision": weights.deviation_precision,
        "severity_correctness": weights.severity_correctness,
        "schema_integrity": weights.schema_integrity,
        "reasoning_quality": weights.reasoning_quality,
    }
    base = sum(float(scores.get(k, 0)) * w[k] for k in w)
    if scope < scope_penalty.threshold:
        base *= scope_penalty.factor
    return round(base, 2)
