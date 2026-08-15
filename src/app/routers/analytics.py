"""Router for clause matrix, heatmap, and deep analytics endpoints."""

from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException

from pbg_eval.analytics.clause_matrix import compute_version_clause_matrix, get_multi_version_clause_heatmap

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/heatmap")
def get_heatmap():
    """Retrieve multi-version clause accuracy heatmap matrix."""
    return get_multi_version_clause_heatmap()


@router.get("/versions/{label}/matrix")
def get_version_matrix(label: str):
    """Retrieve detailed clause-by-clause confusion matrix and error breakdowns for a version."""
    try:
        return compute_version_clause_matrix(label)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        logger.error("[AnalyticsRouter] Failed to compute clause matrix: %s", exc)
        raise HTTPException(500, str(exc))
