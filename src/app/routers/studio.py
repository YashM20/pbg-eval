"""Router for Prompt Optimization Studio, error diagnosis, and prompt mutation."""

from __future__ import annotations

import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pbg_eval.optimization.diagnostician import diagnose_version_errors
from pbg_eval.optimization.mutator import mutate_prompt_candidates

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/studio", tags=["prompt-studio"])


class DiagnoseRequest(BaseModel):
    version_label: str


class MutateRequest(BaseModel):
    baseline_prompt: str
    version_label: str
    focus_objective: str = "balanced"


@router.post("/diagnose")
def diagnose_version(body: DiagnoseRequest):
    """Analyze lowest scoring runs and cluster recurring error patterns for a version."""
    try:
        return diagnose_version_errors(body.version_label)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        logger.error("[StudioRouter] Diagnosis failed: %s", exc)
        raise HTTPException(500, str(exc))


@router.post("/mutate")
def mutate_prompt(body: MutateRequest):
    """Generate 3 targeted prompt candidate variations based on diagnostic report."""
    try:
        diag = diagnose_version_errors(body.version_label)
        candidates = mutate_prompt_candidates(body.baseline_prompt, diag, body.focus_objective)
        return {
            "version_label": body.version_label,
            "diagnosis": diag,
            "candidates": candidates,
        }
    except Exception as exc:
        logger.error("[StudioRouter] Mutation failed: %s", exc)
        raise HTTPException(500, str(exc))


@router.get("/baseline-prompt")
def get_baseline_prompt():
    """Retrieve canonical baseline comparison prompt template."""
    prompts_dir = Path(__file__).resolve().parents[2] / "pbg_eval" / "prompts"
    rules = (prompts_dir / "pbg_rules.txt").read_text(encoding="utf-8")
    return {"baseline_prompt": rules}
