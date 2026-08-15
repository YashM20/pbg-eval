"""Error pattern clustering and prompt failure diagnosis engine."""

from __future__ import annotations

import json
import logging
from typing import Any

from pbg_eval.config import get_config
from pbg_eval.db import connect

logger = logging.getLogger(__name__)


def diagnose_version_errors(version_label: str) -> dict[str, Any]:
    """Diagnose weak areas and root causes across runs for a pipeline version."""
    conn = connect(get_config().db_path)
    version = conn.execute("SELECT id, label FROM pipeline_version WHERE label = ?", (version_label,)).fetchone()
    if not version:
        conn.close()
        raise ValueError(f"Version '{version_label}' not found")

    version_id = version["id"]
    runs = conn.execute(
        """
        SELECT r.id, r.doc_id, r.status, r.exclusion_reason, r.raw_qwen_output,
               g.overall_score, g.deviation_recall, g.deviation_precision,
               g.severity_correctness, g.reasoning_quality, g.schema_integrity,
               g.scope_discipline, g.grader_notes, g.independent_read
        FROM run r
        LEFT JOIN grade g ON g.run_id = r.id
        WHERE r.version_id = ?
        ORDER BY g.overall_score ASC, r.id ASC
        """,
        (version_id,),
    ).fetchall()
    conn.close()

    total_runs = len(runs)
    excluded_runs = [r for r in runs if r["status"] == "excluded"]
    low_score_runs = [r for r in runs if r["status"] == "scored" and (r["overall_score"] or 0) < 7.5]

    # Cluster diagnostic issues
    recall_issues = []
    precision_issues = []
    severity_issues = []
    scope_issues = []

    for r in low_score_runs:
        notes = r["grader_notes"] or ""
        doc_id = r["doc_id"]

        if (r["deviation_recall"] or 10) < 7.0:
            recall_issues.append({
                "doc_id": doc_id,
                "score": r["deviation_recall"],
                "grader_note": notes,
            })
        if (r["deviation_precision"] or 10) < 7.0:
            precision_issues.append({
                "doc_id": doc_id,
                "score": r["deviation_precision"],
                "grader_note": notes,
            })
        if (r["severity_correctness"] or 10) < 7.0:
            severity_issues.append({
                "doc_id": doc_id,
                "score": r["severity_correctness"],
                "grader_note": notes,
            })
        if (r["scope_discipline"] or 10) < 7.0:
            scope_issues.append({
                "doc_id": doc_id,
                "score": r["scope_discipline"],
                "grader_note": notes,
            })

    # Summary recommendations
    recommendations = []
    if len(precision_issues) > len(recall_issues):
        recommendations.append("Strengthen Dynamic Field & Semantic Equivalence rules to reduce false alarms.")
    if len(recall_issues) > len(precision_issues):
        recommendations.append("Emphasize exhaustive clause-by-clause traversal and subtle dropped negations.")
    if len(scope_issues) > 0:
        recommendations.append("Clarify scope boundaries (ignore pure dates/metadata; evaluate substantive post-Clause-8 prose).")
    if len(excluded_runs) > 0:
        recommendations.append("Add strict JSON schema pre-validation instructions to eliminate formatting/truncation exclusions.")

    if not recommendations:
        recommendations.append("Performance is well-balanced across all parameters.")

    return {
        "version": version_label,
        "total_runs": total_runs,
        "excluded_count": len(excluded_runs),
        "low_score_count": len(low_score_runs),
        "diagnostics": {
            "recall_weaknesses": recall_issues[:5],
            "precision_weaknesses": precision_issues[:5],
            "severity_weaknesses": severity_issues[:5],
            "scope_weaknesses": scope_issues[:5],
        },
        "recommendations": recommendations,
    }
