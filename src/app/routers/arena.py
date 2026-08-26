"""FastAPI router for Multi-Model Tournament Arena."""

from __future__ import annotations

import logging
from fastapi import APIRouter

from pbg_eval.services.arena import get_available_ollama_models, get_multi_model_benchmarks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/arena", tags=["model-arena"])


@router.get("/models")
def list_available_models():
    """Retrieve verified installed model tags available for evaluation."""
    return {"models": get_available_ollama_models()}


@router.get("/benchmarks")
def get_model_benchmarks():
    """Retrieve cross-model accuracy, latency, and Pareto frontier leaderboard."""
    return {"benchmarks": get_multi_model_benchmarks()}
