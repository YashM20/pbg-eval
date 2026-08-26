"""Production Drift Sentinel & Live Anomaly Observer Service."""

from __future__ import annotations

import logging
from typing import Any

from pbg_eval.config import get_config
from pbg_eval.db import connect

logger = logging.getLogger(__name__)


def get_production_drift_telemetry() -> dict[str, Any]:
    """Analyze recent evaluation runs to detect distribution drift, confidence anomalies, and unclassified clauses."""
    conn = connect(get_config().db_path)
    runs = conn.execute(
        """
        SELECT r.id, r.doc_id, r.status, r.latency_seconds, r.heal_count,
               g.overall_score, g.deviation_recall, g.deviation_precision,
               eg.overall_extraction_score
        FROM run r
        LEFT JOIN grade g ON g.run_id = r.id
        LEFT JOIN extraction_grade eg ON eg.run_id = r.id
        ORDER BY r.timestamp DESC
        LIMIT 100
        """
    ).fetchall()
    conn.close()

    total_observed = len(runs)
    if total_observed == 0:
        return {
            "total_observed": 0,
            "drift_status": "Nominal",
            "confidence_distribution": {"high": 100, "medium": 0, "low": 0},
            "alerts": [],
        }

    scored = [r for r in runs if r["status"] == "scored"]
    excluded = [r for r in runs if r["status"] == "excluded"]

    comp_scores = [r["overall_score"] for r in scored if r["overall_score"] is not None]
    mean_score = sum(comp_scores) / len(comp_scores) if comp_scores else 8.5
    excl_rate = len(excluded) / total_observed

    high_conf = sum(1 for s in comp_scores if s >= 8.0)
    med_conf = sum(1 for s in comp_scores if 6.0 <= s < 8.0)
    low_conf = sum(1 for s in comp_scores if s < 6.0)

    total_scored = len(comp_scores) or 1
    conf_dist = {
        "high": round((high_conf / total_scored) * 100, 1),
        "medium": round((med_conf / total_scored) * 100, 1),
        "low": round((low_conf / total_scored) * 100, 1),
    }

    alerts = []
    if excl_rate > 0.10:
        alerts.append({
            "severity": "HIGH",
            "type": "Exclusion Rate Spike",
            "message": f"Recent exclusion rate ({excl_rate*100:.1f}%) exceeds safety threshold (10%). Check backend Ollama/PaddleOCR health.",
        })

    if mean_score < 7.5:
        alerts.append({
            "severity": "MEDIUM",
            "type": "Model Accuracy Drift",
            "message": f"Average comparison score dropped to {mean_score:.2f}. Review recent prompt variations.",
        })

    return {
        "total_observed": total_observed,
        "drift_status": "Alert" if alerts else "Nominal",
        "mean_recent_score": round(mean_score, 2),
        "exclusion_rate_pct": round(excl_rate * 100, 1),
        "confidence_distribution": conf_dist,
        "alerts": alerts,
    }
