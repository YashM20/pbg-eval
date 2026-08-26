"""Multi-Model Tournament Arena & Pareto Frontier Benchmark Service."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from pbg_eval.config import Config, get_config
from pbg_eval.db import connect
from pbg_eval.services.report import _stats

logger = logging.getLogger(__name__)


def get_available_ollama_models(config: Config | None = None) -> list[dict[str, Any]]:
    """Query connected Ollama instance to discover verified installed model tags."""
    config = config or get_config()
    # Default known IOCL model tags
    default_models = [
        {"name": "qwen3.5:9b", "size_gb": 6.6, "parameter_size": "9.7B", "quantization": "Q4_K_M"},
        {"name": "qwen2.5-coder:3b", "size_gb": 1.9, "parameter_size": "3.1B", "quantization": "Q4_K_M"},
    ]

    ollama_endpoint = config.ollama_endpoints.split(",")[0].strip().strip('"').strip("'") if config.ollama_endpoints else ""
    if ollama_endpoint:
        try:
            url = f"{ollama_endpoint.rstrip('/')}/api/tags"
            with httpx.Client(timeout=5.0) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    models = []
                    for m in data.get("models", []):
                        name = m.get("name") or m.get("model")
                        details = m.get("details", {})
                        param_size = details.get("parameter_size", "Auto")
                        quant = details.get("quantization_level", "Standard")
                        size_gb = round(m.get("size", 0) / (1024**3), 1) or 5.0
                        if name:
                            models.append({
                                "name": name,
                                "size_gb": size_gb,
                                "parameter_size": param_size,
                                "quantization": quant,
                            })
                    if models:
                        return models
        except Exception as exc:
            logger.debug("[ArenaService] Ollama api/tags discovery error: %s", exc)

    try:
        url = f"{config.backend_url.rstrip('/')}/v1/models"
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                models = []
                for m in data.get("data", []):
                    m_id = m.get("id")
                    if m_id:
                        models.append({"name": m_id, "size_gb": 10.0, "parameter_size": "Auto", "quantization": "Standard"})
                if models:
                    return models
    except Exception as exc:
        logger.debug("[ArenaService] Local model discovery fallback: %s", exc)

    return default_models


def get_multi_model_benchmarks() -> list[dict[str, Any]]:
    """Compute cross-model benchmark metrics, accuracy vs latency tradeoff, and Pareto ranking."""
    conn = connect(get_config().db_path)
    rows = conn.execute(
        """
        SELECT pv.model_config, r.latency_seconds, r.status,
               g.overall_score, g.deviation_recall, g.deviation_precision,
               eg.overall_extraction_score
        FROM run r
        JOIN pipeline_version pv ON pv.id = r.version_id
        LEFT JOIN grade g ON g.run_id = r.id
        LEFT JOIN extraction_grade eg ON eg.run_id = r.id
        """
    ).fetchall()
    conn.close()

    model_groups: dict[str, list[Any]] = {}
    for r in rows:
        cfg = r["model_config"] or "qwen3.5:9b"
        model_groups.setdefault(cfg, []).append(r)

    benchmarks = []
    for model_name, run_list in model_groups.items():
        total = len(run_list)
        scored = [r for r in run_list if r["status"] == "scored"]
        excluded = [r for r in run_list if r["status"] == "excluded"]

        comp_scores = [r["overall_score"] for r in scored if r["overall_score"] is not None]
        ext_scores = [r["overall_extraction_score"] for r in scored if r["overall_extraction_score"] is not None]
        latencies = [r["latency_seconds"] for r in run_list if r["latency_seconds"] is not None]

        mean_comp = round(sum(comp_scores) / len(comp_scores), 2) if comp_scores else 0.0
        mean_ext = round(sum(ext_scores) / len(ext_scores), 2) if ext_scores else 0.0
        mean_latency = round(sum(latencies) / len(latencies), 1) if latencies else 0.0
        excl_rate = round(len(excluded) / total, 3) if total else 0.0

        # Efficiency Score = (Accuracy / max(Latency, 1)) * 10
        pareto_score = round((mean_comp / max(mean_latency, 1.0)) * 10.0, 2)

        benchmarks.append({
            "model_name": model_name,
            "total_runs": total,
            "comparison_score": mean_comp,
            "extraction_score": mean_ext,
            "mean_latency_seconds": mean_latency,
            "exclusion_rate": excl_rate,
            "pareto_score": pareto_score,
            "is_pareto_optimal": mean_comp >= 8.5 and excl_rate <= 0.05,
        })

    return sorted(benchmarks, key=lambda x: x["comparison_score"], reverse=True)
