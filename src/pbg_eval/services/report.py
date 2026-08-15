"""Statistical reporting, ranking, variance analysis, and telemetry queries."""

from __future__ import annotations

import json
import math
from collections import defaultdict
from typing import Any

from pbg_eval.config import get_config
from pbg_eval.db import connect


def _stats(scores: list[float]) -> dict[str, Any]:
    if not scores:
        return {"count": 0, "mean": None, "min": None, "max": None, "median": None, "stdev": None}
    scores_sorted = sorted(scores)
    n = len(scores)
    mean = sum(scores) / n
    mid = n // 2
    median = scores_sorted[mid] if n % 2 else (scores_sorted[mid - 1] + scores_sorted[mid]) / 2
    variance = sum((s - mean) ** 2 for s in scores) / n if n > 1 else 0
    return {
        "count": n,
        "mean": round(mean, 2),
        "min": round(min(scores), 2),
        "max": round(max(scores), 2),
        "median": round(median, 2),
        "stdev": round(math.sqrt(variance), 2),
    }


def list_versions() -> list[dict[str, Any]]:
    conn = connect(get_config().db_path)
    versions = conn.execute("SELECT * FROM pipeline_version ORDER BY created_at DESC").fetchall()
    result = []
    for v in versions:
        vid = v["id"]
        runs = conn.execute("SELECT status, heal_count FROM run WHERE version_id = ?", (vid,)).fetchall()
        total = len(runs)
        excluded = sum(1 for r in runs if r["status"] == "excluded")
        scored_count = sum(1 for r in runs if r["status"] == "scored")
        total_heals = sum(r["heal_count"] or 0 for r in runs)
        scored = conn.execute(
            """
            SELECT g.overall_score FROM grade g
            JOIN run r ON r.id = g.run_id
            WHERE r.version_id = ?
            """,
            (vid,),
        ).fetchall()
        scores = [r["overall_score"] for r in scored if r["overall_score"] is not None]

        # Fetch average extraction score
        ext_row = conn.execute(
            """
            SELECT AVG(eg.overall_extraction_score) as mean_ext
            FROM extraction_grade eg
            JOIN run r ON r.id = eg.run_id
            WHERE r.version_id = ?
            """,
            (vid,),
        ).fetchone()
        mean_ext = round(ext_row["mean_ext"], 2) if ext_row and ext_row["mean_ext"] is not None else None

        result.append({
            "id": vid,
            "label": v["label"],
            "prompt_hash": v["prompt_hash"],
            "model_config": v["model_config"],
            "created_at": v["created_at"],
            "notes": v["notes"],
            "run_count": total,
            "scored_count": scored_count,
            "heal_count": total_heals,
            "exclusion_rate": round(excluded / total, 3) if total else 0,
            "score_stats": _stats(scores),
            "extraction_score": mean_ext,
        })
    conn.close()
    return result


def version_runs(label: str) -> dict[str, Any]:
    conn = connect(get_config().db_path)
    version = conn.execute("SELECT * FROM pipeline_version WHERE label = ?", (label,)).fetchone()
    if not version:
        conn.close()
        raise ValueError(f"Version not found: {label}")

    rows = conn.execute(
        """
        SELECT r.*, g.overall_score, g.deviation_recall, g.deviation_precision,
               g.severity_correctness, g.reasoning_quality, g.schema_integrity,
               g.scope_discipline, g.grader_notes, g.independent_read,
               eg.overall_extraction_score, eg.target_metadata, eg.ground_truth_metadata, eg.field_discrepancies
        FROM run r
        LEFT JOIN grade g ON g.run_id = r.id
        LEFT JOIN extraction_grade eg ON eg.run_id = r.id
        WHERE r.version_id = ?
        ORDER BY r.doc_id, r.timestamp
        """,
        (version["id"],),
    ).fetchall()

    runs = []
    for r in rows:
        d = dict(r)
        if d.get("field_discrepancies"):
            try:
                d["field_discrepancies"] = json.loads(d["field_discrepancies"])
            except Exception:
                pass
        runs.append(d)

    by_doc: dict[str, list[float]] = defaultdict(list)
    for r in rows:
        if r["overall_score"] is not None:
            by_doc[r["doc_id"]].append(r["overall_score"])

    variance = {
        doc_id: _stats(scores)
        for doc_id, scores in by_doc.items()
    }

    conn.close()
    return {
        "version": dict(version),
        "runs": runs,
        "variance_by_doc": variance,
    }


def compare_versions(v1: str, v2: str) -> dict[str, Any]:
    versions = {v["label"]: v for v in list_versions()}
    if v1 not in versions:
        raise ValueError(f"Version not found: {v1}")
    if v2 not in versions:
        raise ValueError(f"Version not found: {v2}")

    a, b = versions[v1], versions[v2]
    ranked = sorted([a, b], key=lambda v: (v["score_stats"]["mean"] or 0), reverse=True)
    return {
        "v1": a,
        "v2": b,
        "ranking": [
            {
                "label": v["label"],
                "mean": v["score_stats"]["mean"],
                "exclusion_rate": v["exclusion_rate"],
                "extraction_score": v.get("extraction_score"),
            }
            for v in ranked
        ],
    }


def get_fault_summary() -> dict[str, Any]:
    """Summary of all recorded fault detections and remedy actions."""
    conn = connect(get_config().db_path)
    rows = conn.execute(
        """
        SELECT fault_type, COUNT(*) as count, SUM(success) as healed
        FROM fault_log
        GROUP BY fault_type
        ORDER BY count DESC
        """
    ).fetchall()

    recent = conn.execute(
        """
        SELECT f.*, r.doc_id
        FROM fault_log f
        LEFT JOIN run r ON r.id = f.run_id
        ORDER BY f.detected_at DESC
        LIMIT 50
        """
    ).fetchall()

    conn.close()
    return {
        "summary": [dict(r) for r in rows],
        "recent_events": [dict(r) for r in recent],
    }
