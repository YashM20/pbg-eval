"""Clause-by-clause confusion matrix, section breakdown, and accuracy analytics."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from pbg_eval.config import get_config
from pbg_eval.db import connect

logger = logging.getLogger(__name__)

CANONICAL_SECTIONS = [
    "Opening Preamble",
    "Bank Undertaking",
    "Clause 1",
    "Clause 2",
    "Clause 3",
    "Clause 4",
    "Clause 5",
    "Clause 6",
    "Clause 7",
    "Clause 8",
    "Signatory Block / Post-Clause 8",
]


def classify_clause_section(clause_no: str | None, text_snippet: str | None = None) -> str:
    """Classify arbitrary clause reference or snippet into a canonical PBG section."""
    c_str = (clause_no or "").strip().lower()
    t_str = (text_snippet or "").strip().lower()
    combined = f"{c_str} {t_str}"

    # Match explicit numbered clauses first
    if re.search(r"\bclause\s*1\b|\b1\b", c_str) or "clause 1" in c_str:
        return "Clause 1"
    if re.search(r"\bclause\s*2\b|\b2\b", c_str) or "clause 2" in c_str:
        return "Clause 2"
    if re.search(r"\bclause\s*3\b|\b3\b", c_str) or "clause 3" in c_str:
        return "Clause 3"
    if re.search(r"\bclause\s*4\b|\b4\b", c_str) or "clause 4" in c_str or "anywise" in t_str:
        return "Clause 4"
    if re.search(r"\bclause\s*5\b|\b5\b", c_str) or "clause 5" in c_str or "validity" in t_str or "claim period" in t_str:
        return "Clause 5"
    if re.search(r"\bclause\s*6\b|\b6\b", c_str) or "clause 6" in c_str or "jurisdiction" in t_str or "delhi" in t_str:
        return "Clause 6"
    if re.search(r"\bclause\s*7\b|\b7\b", c_str) or "clause 7" in c_str or "invocation" in t_str or "demand notice" in t_str:
        return "Clause 7"
    if re.search(r"\bclause\s*8\b|\b8\b", c_str) or "clause 8" in c_str or "sign" in t_str or "authoris" in t_str:
        return "Clause 8"

    if "preamble" in combined or "in consideration" in combined or "opening" in combined:
        return "Opening Preamble"
    if "undertak" in combined or "we hereby" in combined or "bank undertake" in combined:
        return "Bank Undertaking"

    if "signatory" in combined or "yours faithfully" in combined or "payable at" in combined or "after clause 8" in combined:
        return "Signatory Block / Post-Clause 8"

    return "Other / Unclassified"


def compute_version_clause_matrix(version_label: str) -> dict[str, Any]:
    """Calculate clause-level True Positives, False Positives, False Negatives, Recall & Precision."""
    conn = connect(get_config().db_path)
    version = conn.execute("SELECT id, label FROM pipeline_version WHERE label = ?", (version_label,)).fetchone()
    if not version:
        conn.close()
        raise ValueError(f"Version not found: {version_label}")

    version_id = version["id"]
    runs = conn.execute(
        """
        SELECT r.id, r.doc_id, r.raw_qwen_output, g.independent_read
        FROM run r
        JOIN grade g ON g.run_id = r.id
        WHERE r.version_id = ? AND r.status = 'scored'
        """,
        (version_id,),
    ).fetchall()
    conn.close()

    section_stats: dict[str, dict[str, Any]] = {
        s: {
            "section": s,
            "true_positives": 0,
            "false_positives": 0,
            "false_negatives": 0,
            "critical_count": 0,
            "major_count": 0,
            "minor_count": 0,
            "sample_errors": [],
        }
        for s in CANONICAL_SECTIONS
    }

    for row in runs:
        raw_output_str = row["raw_qwen_output"] or "{}"
        independent_str = row["independent_read"] or "{}"

        try:
            target_json = json.loads(raw_output_str)
            target_devs = target_json.get("deviations", [])
        except Exception:
            target_devs = []

        try:
            ground_json = json.loads(independent_str)
            ground_devs = ground_json.get("expected_deviations", [])
        except Exception:
            ground_devs = []

        # Map ground truth deviations by section
        ground_by_section: dict[str, list[dict]] = {}
        for gd in ground_devs:
            sec = classify_clause_section(gd.get("clauseNo"), gd.get("appearingInBg") or gd.get("reason"))
            if sec in section_stats:
                ground_by_section.setdefault(sec, []).append(gd)

        # Map target deviations by section
        target_by_section: dict[str, list[dict]] = {}
        for td in target_devs:
            sec = classify_clause_section(td.get("clauseNo"), td.get("appearingInBg") or td.get("reason"))
            if sec in section_stats:
                target_by_section.setdefault(sec, []).append(td)
                sev = (td.get("severity") or "MINOR").upper()
                if "CRIT" in sev:
                    section_stats[sec]["critical_count"] += 1
                elif "MAJ" in sev:
                    section_stats[sec]["major_count"] += 1
                else:
                    section_stats[sec]["minor_count"] += 1

        # Calculate TP, FP, FN per section
        for sec in CANONICAL_SECTIONS:
            g_list = ground_by_section.get(sec, [])
            t_list = target_by_section.get(sec, [])

            g_count = len(g_list)
            t_count = len(t_list)

            matched = min(g_count, t_count)
            fp = max(0, t_count - g_count)
            fn = max(0, g_count - t_count)

            section_stats[sec]["true_positives"] += matched
            section_stats[sec]["false_positives"] += fp
            section_stats[sec]["false_negatives"] += fn

            if fp > 0 and len(section_stats[sec]["sample_errors"]) < 3:
                section_stats[sec]["sample_errors"].append({
                    "type": "False Positive",
                    "doc_id": row["doc_id"],
                    "details": t_list[0].get("reason") or t_list[0].get("appearingInBg", ""),
                })
            elif fn > 0 and len(section_stats[sec]["sample_errors"]) < 3:
                section_stats[sec]["sample_errors"].append({
                    "type": "Missed Deviation (False Negative)",
                    "doc_id": row["doc_id"],
                    "details": g_list[0].get("reason") or g_list[0].get("appearingInBg", ""),
                })

    matrix_rows = []
    for s in CANONICAL_SECTIONS:
        st = section_stats[s]
        tp = st["true_positives"]
        fp = st["false_positives"]
        fn = st["false_negatives"]

        recall = round(tp / (tp + fn), 3) if (tp + fn) > 0 else 1.0
        precision = round(tp / (tp + fp), 3) if (tp + fp) > 0 else 1.0
        f1 = round(2 * (precision * recall) / (precision + recall), 3) if (precision + recall) > 0 else 1.0

        matrix_rows.append({
            "section": s,
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "recall": recall,
            "precision": precision,
            "f1_score": f1,
            "critical_count": st["critical_count"],
            "major_count": st["major_count"],
            "minor_count": st["minor_count"],
            "sample_errors": st["sample_errors"],
        })

    return {
        "version": version_label,
        "total_scored_runs": len(runs),
        "sections": matrix_rows,
    }


def get_multi_version_clause_heatmap() -> dict[str, Any]:
    """Matrix of all pipeline versions vs sections for rendering interactive heatmaps."""
    conn = connect(get_config().db_path)
    versions = conn.execute("SELECT label FROM pipeline_version ORDER BY created_at DESC LIMIT 10").fetchall()
    conn.close()

    result = []
    for v in versions:
        try:
            m = compute_version_clause_matrix(v["label"])
            result.append(m)
        except Exception:
            pass

    return {
        "canonical_sections": CANONICAL_SECTIONS,
        "versions": result,
    }
