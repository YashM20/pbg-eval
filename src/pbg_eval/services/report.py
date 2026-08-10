import math
from collections import defaultdict

from pbg_eval.db import connect
from pbg_eval.config import get_config


def _stats(scores: list[float]) -> dict:
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


def list_versions() -> list[dict]:
    conn = connect(get_config().db_path)
    versions = conn.execute("SELECT * FROM pipeline_version ORDER BY created_at DESC").fetchall()
    result = []
    for v in versions:
        vid = v["id"]
        runs = conn.execute("SELECT status FROM run WHERE version_id = ?", (vid,)).fetchall()
        total = len(runs)
        excluded = sum(1 for r in runs if r["status"] == "excluded")
        scored_count = sum(1 for r in runs if r["status"] == "scored")
        scored = conn.execute(
            """
            SELECT g.overall_score FROM grade g
            JOIN run r ON r.id = g.run_id
            WHERE r.version_id = ?
            """,
            (vid,),
        ).fetchall()
        scores = [r["overall_score"] for r in scored if r["overall_score"] is not None]
        result.append({
            "id": vid,
            "label": v["label"],
            "prompt_hash": v["prompt_hash"],
            "model_config": v["model_config"],
            "created_at": v["created_at"],
            "notes": v["notes"],
            "run_count": total,
            "scored_count": scored_count,
            "exclusion_rate": round(excluded / total, 3) if total else 0,
            "score_stats": _stats(scores),
        })
    conn.close()
    return result


def version_runs(label: str) -> dict:
    conn = connect(get_config().db_path)
    version = conn.execute("SELECT * FROM pipeline_version WHERE label = ?", (label,)).fetchone()
    if not version:
        conn.close()
        raise ValueError(f"Version not found: {label}")

    rows = conn.execute(
        """
        SELECT r.*, g.overall_score, g.deviation_recall, g.deviation_precision,
               g.severity_correctness, g.reasoning_quality, g.schema_integrity,
               g.scope_discipline, g.grader_notes, g.independent_read
        FROM run r
        LEFT JOIN grade g ON g.run_id = r.id
        WHERE r.version_id = ?
        ORDER BY r.doc_id, r.timestamp
        """,
        (version["id"],),
    ).fetchall()

    runs = [dict(r) for r in rows]
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


def compare_versions(v1: str, v2: str) -> dict:
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
        "ranking": [{"label": v["label"], "mean": v["score_stats"]["mean"], "exclusion_rate": v["exclusion_rate"]} for v in ranked],
    }
