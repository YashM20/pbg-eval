"""Router for synthetic adversarial benchmark suite."""

from __future__ import annotations

from dataclasses import asdict
from fastapi import APIRouter
from pydantic import BaseModel

from pbg_eval.synthetic.generator import generate_synthetic_suite
from pbg_eval.synthetic.runner import evaluate_synthetic_output

router = APIRouter(prefix="/api/synthetic", tags=["synthetic-benchmarks"])


class SyntheticEvalRequest(BaseModel):
    doc_id: str
    raw_output: str


@router.get("/suite")
def get_suite():
    """Retrieve all available synthetic test documents with ground-truth anomalies."""
    suite = generate_synthetic_suite()
    return [asdict(d) for d in suite]


@router.post("/evaluate")
def evaluate_synthetic(body: SyntheticEvalRequest):
    """Evaluate target output against ground-truth synthetic document."""
    suite = {d.doc_id: d for d in generate_synthetic_suite()}
    doc = suite.get(body.doc_id)
    if not doc:
        return {"error": f"Synthetic document '{body.doc_id}' not found"}
    return evaluate_synthetic_output(doc, body.raw_output)
