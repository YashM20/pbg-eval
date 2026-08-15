"""FastAPI router for dedicated Metadata Extraction evaluation & analytics."""

from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException

from pbg_eval.extraction.analytics import (
    get_extraction_leaderboard,
    get_run_extraction_grade,
    get_version_extraction_matrix,
    grade_version_metadata,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/extraction", tags=["metadata-extraction-eval"])


@router.get("/leaderboard")
def get_leaderboard():
    """Retrieve metadata extraction leaderboard across pipeline versions."""
    return get_extraction_leaderboard()


@router.get("/versions/{label}/matrix")
def get_matrix(label: str):
    """Retrieve field-by-field accuracy matrix and discrepancies for a version."""
    try:
        return get_version_extraction_matrix(label)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        logger.error("[ExtractionRouter] Failed to fetch extraction matrix: %s", exc)
        raise HTTPException(500, str(exc))


@router.get("/runs/{run_id}")
def get_run_grade(run_id: int):
    """Retrieve metadata extraction grade and target vs ground-truth diff for a run."""
    grade = get_run_extraction_grade(run_id)
    if not grade:
        raise HTTPException(404, f"No extraction grade found for run {run_id}")
    return grade


@router.post("/grade/{version_label}")
def grade_metadata(version_label: str):
    """Trigger metadata extraction evaluation grading for all runs in a version."""
    try:
        return grade_version_metadata(version_label)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        logger.error("[ExtractionRouter] Failed to grade metadata: %s", exc)
        raise HTTPException(500, str(exc))
