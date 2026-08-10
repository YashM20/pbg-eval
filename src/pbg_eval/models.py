"""Plain dataclasses and score helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pbg_eval.config import ScoreWeights, ScopePenalty


from pathlib import Path


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
class Run:
    id: int
    version_id: int
    doc_id: str
    backend_doc_id: str
    backend_job_id: str | None
    timestamp: str
    latency_seconds: float | None
    raw_qwen_output: str | None
    master_text: str | None
    vendor_text: str | None
    extraction_ok: bool
    status: str
    exclusion_reason: str | None = None


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
