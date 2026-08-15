"""Single-pass unified metrics engine for version leaderboards, heatmaps, extraction, and AI diagnosis."""

from __future__ import annotations

import json
import math
from collections import defaultdict
from typing import Any

from pbg_eval.analytics.clause_matrix import CANONICAL_SECTIONS, classify_clause_section
from pbg_eval.config import get_config
from pbg_eval.db import connect
from pbg_eval.extraction.analytics import EXTRACTION_FIELDS
from pbg_eval.services.report import _stats


def get_unified_version_payload(version_label: str) -> dict[str, Any]:
    """Single-pass query assembling complete version analytics, runs, clause matrix, extraction, and AI diagnosis."""
    conn = connect(get_config().db_path)
    version = conn.execute("SELECT * FROM pipeline_version WHERE label = ?", (version_label,)).fetchone()
    if not version:
        conn.close()
        raise ValueError(f"Version '{version_label}' not found")

    vid = version["id"]
    rows = conn.execute(
        """
        SELECT r.*,
               g.overall_score, g.deviation_recall, g.deviation_precision,
               g.severity_correctness, g.reasoning_quality, g.schema_integrity,
               g.scope_discipline, g.grader_notes, g.independent_read,
               eg.overall_extraction_score, eg.score_bg_number, eg.score_amendment_date,
               eg.score_validity_date, eg.score_claim_period, eg.score_amount,
               eg.score_po_no, eg.score_vendor_name, eg.score_bank_branch_address,
               eg.em_bg_number, eg.em_amendment_date, eg.em_validity_date, eg.em_claim_period,
               eg.em_amount, eg.em_po_no, eg.em_vendor_name, eg.em_bank_branch_address,
               eg.target_metadata, eg.ground_truth_metadata, eg.field_discrepancies
        FROM run r
        LEFT JOIN grade g ON g.run_id = r.id
        LEFT JOIN extraction_grade eg ON eg.run_id = r.id
        WHERE r.version_id = ?
        ORDER BY r.doc_id, r.timestamp
        """,
        (vid,),
    ).fetchall()
    conn.close()

    total_runs = len(rows)
    scored_runs = [r for r in rows if r["status"] == "scored"]
    excluded_runs = [r for r in rows if r["status"] == "excluded"]
    total_heals = sum(r["heal_count"] or 0 for r in rows)

    scores = [r["overall_score"] for r in scored_runs if r["overall_score"] is not None]
    score_stats = _stats(scores)

    ext_scores = [r["overall_extraction_score"] for r in scored_runs if r["overall_extraction_score"] is not None]
    mean_ext = round(sum(ext_scores) / len(ext_scores), 2) if ext_scores else None

    # 1. Runs & Variance
    runs_list = []
    by_doc = defaultdict(list)

    for r in rows:
        d = dict(r)
        d["has_trace"] = bool(d.get("thinking_trace"))
        if isinstance(d.get("field_discrepancies"), str):
            try:
                d["field_discrepancies"] = json.loads(d["field_discrepancies"])
            except Exception:
                pass
        if isinstance(d.get("target_metadata"), str):
            try:
                d["target_metadata"] = json.loads(d["target_metadata"])
            except Exception:
                pass
        if isinstance(d.get("ground_truth_metadata"), str):
            try:
                d["ground_truth_metadata"] = json.loads(d["ground_truth_metadata"])
            except Exception:
                pass
        runs_list.append(d)

        if r["overall_score"] is not None:
            by_doc[r["doc_id"]].append(r["overall_score"])

    variance_by_doc = {doc_id: _stats(doc_scores) for doc_id, doc_scores in by_doc.items()}

    # 2. Clause Confusion Matrix
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

    for row in scored_runs:
        try:
            target_json = json.loads(row["raw_qwen_output"] or "{}")
            target_devs = target_json.get("deviations", [])
        except Exception:
            target_devs = []

        try:
            ground_json = json.loads(row["independent_read"] or "{}")
            ground_devs = ground_json.get("expected_deviations", [])
        except Exception:
            ground_devs = []

        ground_by_sec: dict[str, list[dict]] = {}
        for gd in ground_devs:
            sec = classify_clause_section(gd.get("clauseNo"), gd.get("appearingInBg") or gd.get("reason"))
            if sec in section_stats:
                ground_by_sec.setdefault(sec, []).append(gd)

        target_by_sec: dict[str, list[dict]] = {}
        for td in target_devs:
            sec = classify_clause_section(td.get("clauseNo"), td.get("appearingInBg") or td.get("reason"))
            if sec in section_stats:
                target_by_sec.setdefault(sec, []).append(td)
                sev = str(td.get("severity") or "MINOR").upper()
                if "CRIT" in sev:
                    section_stats[sec]["critical_count"] += 1
                elif "MAJ" in sev:
                    section_stats[sec]["major_count"] += 1
                else:
                    section_stats[sec]["minor_count"] += 1

        for sec in CANONICAL_SECTIONS:
            g_list = ground_by_sec.get(sec, [])
            t_list = target_by_sec.get(sec, [])
            g_c = len(g_list)
            t_c = len(t_list)
            matched = min(g_c, t_c)
            fp = max(0, t_c - g_c)
            fn = max(0, g_c - t_c)

            section_stats[sec]["true_positives"] += matched
            section_stats[sec]["false_positives"] += fp
            section_stats[sec]["false_negatives"] += fn

            if fp > 0 and len(section_stats[sec]["sample_errors"]) < 2:
                section_stats[sec]["sample_errors"].append({
                    "type": "False Positive",
                    "doc_id": row["doc_id"],
                    "details": t_list[0].get("reason") or t_list[0].get("appearingInBg", ""),
                })
            elif fn > 0 and len(section_stats[sec]["sample_errors"]) < 2:
                section_stats[sec]["sample_errors"].append({
                    "type": "Missed Deviation",
                    "doc_id": row["doc_id"],
                    "details": g_list[0].get("reason") or g_list[0].get("appearingInBg", ""),
                })

    clause_matrix_rows = []
    for s in CANONICAL_SECTIONS:
        st = section_stats[s]
        tp = st["true_positives"]
        fp = st["false_positives"]
        fn = st["false_negatives"]
        recall = round(tp / (tp + fn), 3) if (tp + fn) > 0 else 1.0
        precision = round(tp / (tp + fp), 3) if (tp + fp) > 0 else 1.0
        f1 = round(2 * (precision * recall) / (precision + recall), 3) if (precision + recall) > 0 else 1.0

        clause_matrix_rows.append({
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

    # 3. Metadata Extraction Breakdown
    field_col_map = {
        "bgNumber": ("score_bg_number", "em_bg_number"),
        "amendmentDate": ("score_amendment_date", "em_amendment_date"),
        "validityDate": ("score_validity_date", "em_validity_date"),
        "claimPeriod": ("score_claim_period", "em_claim_period"),
        "amount": ("score_amount", "em_amount"),
        "poNo": ("score_po_no", "em_po_no"),
        "vendorName": ("score_vendor_name", "em_vendor_name"),
        "bankBranchAddress": ("score_bank_branch_address", "em_bank_branch_address"),
    }

    ext_fields_summary = []
    ext_count = len(ext_scores)

    if ext_count > 0:
        for f_name, (score_col, em_col) in field_col_map.items():
            f_scores = [r[score_col] for r in scored_runs if r[score_col] is not None]
            f_em = [r[em_col] for r in scored_runs if r[em_col] is not None]
            mean_s = round(sum(f_scores) / len(f_scores), 2) if f_scores else 0.0
            em_rate = round(sum(f_em) / len(f_em), 3) if f_em else 0.0
            ext_fields_summary.append({
                "field": f_name,
                "mean_score": mean_s,
                "exact_match_rate": em_rate,
            })

    # 4. Proactive AI Diagnosis & Recommendations (Zero-Click)
    recommendations = []
    weaknesses = []

    lowest_clauses = sorted(clause_matrix_rows, key=lambda x: x["f1_score"])
    if lowest_clauses and lowest_clauses[0]["f1_score"] < 0.8:
        top_weak_sec = lowest_clauses[0]
        weaknesses.append(f"Section '{top_weak_sec['section']}' has lower accuracy (F1: {int(top_weak_sec['f1_score']*100)}%).")
        if top_weak_sec["false_negatives"] > top_weak_sec["false_positives"]:
            recommendations.append(f"Strengthen clause traversal instructions for {top_weak_sec['section']} to catch subtle omissions.")
        else:
            recommendations.append(f"Add disambiguation guidance for {top_weak_sec['section']} to prevent false positive flags.")

    if ext_fields_summary:
        weak_ext = [f for f in ext_fields_summary if f["mean_score"] < 7.5]
        for wf in weak_ext:
            weaknesses.append(f"Metadata field '{wf['field']}' has lower score ({wf['mean_score']}/10).")
            if wf["field"] == "bankBranchAddress":
                recommendations.append("Ensure stop-marker instructions in extraction prompt are enforced to prevent legal text bleed.")
            elif wf["field"] in ("amendmentDate", "validityDate"):
                recommendations.append("Check date alias normalization (Issue Date vs Amendment Date).")

    if not recommendations:
        recommendations.append("Model execution is well-balanced across all comparison clauses and metadata fields.")

    return {
        "version": dict(version),
        "summary": {
            "total_runs": total_runs,
            "scored_runs": len(scored_runs),
            "excluded_runs": len(excluded_runs),
            "heal_count": total_heals,
            "exclusion_rate": round(len(excluded_runs) / total_runs, 3) if total_runs else 0.0,
            "score_stats": score_stats,
            "overall_extraction_score": mean_ext,
        },
        "health_insights": {
            "status": "Healthy" if (score_stats.get("mean") or 0) >= 8.0 and (mean_ext is None or mean_ext >= 8.0) else "Needs Attention",
            "weaknesses": weaknesses,
            "recommendations": recommendations,
        },
        "runs": runs_list,
        "variance_by_doc": variance_by_doc,
        "clause_matrix": clause_matrix_rows,
        "extraction_breakdown": ext_fields_summary,
    }


def compare_versions_normalized(v1_label: str, v2_label: str) -> dict[str, Any]:
    """Compare two versions with both raw metrics and common-corpus normalized metrics."""
    v1_payload = get_unified_version_payload(v1_label)
    v2_payload = get_unified_version_payload(v2_label)

    # Document sets
    docs_1 = set(r["doc_id"] for r in v1_payload["runs"] if r["status"] == "scored")
    docs_2 = set(r["doc_id"] for r in v2_payload["runs"] if r["status"] == "scored")
    common_docs = sorted(docs_1 & docs_2)
    is_identical_corpus = (docs_1 == docs_2)

    # Raw metrics
    s1 = v1_payload["summary"]["score_stats"]
    s2 = v2_payload["summary"]["score_stats"]
    raw_mean_1 = s1.get("mean") or 0.0
    raw_mean_2 = s2.get("mean") or 0.0
    raw_score_delta = round(raw_mean_2 - raw_mean_1, 2)

    raw_ext_1 = v1_payload["summary"]["overall_extraction_score"] or 0.0
    raw_ext_2 = v2_payload["summary"]["overall_extraction_score"] or 0.0
    raw_ext_delta = round(raw_ext_2 - raw_ext_1, 2)

    excl_1 = v1_payload["summary"]["exclusion_rate"] or 0.0
    excl_2 = v2_payload["summary"]["exclusion_rate"] or 0.0
    excl_delta = round((excl_2 - excl_1) * 100, 1)

    # Common-corpus normalized metrics
    if common_docs:
        c_scores_1 = [r["overall_score"] for r in v1_payload["runs"] if r["status"] == "scored" and r["doc_id"] in common_docs and r["overall_score"] is not None]
        c_scores_2 = [r["overall_score"] for r in v2_payload["runs"] if r["status"] == "scored" and r["doc_id"] in common_docs and r["overall_score"] is not None]
        norm_mean_1 = round(sum(c_scores_1) / len(c_scores_1), 2) if c_scores_1 else raw_mean_1
        norm_mean_2 = round(sum(c_scores_2) / len(c_scores_2), 2) if c_scores_2 else raw_mean_2
        normalized_score_delta = round(norm_mean_2 - norm_mean_1, 2)
    else:
        norm_mean_1 = raw_mean_1
        norm_mean_2 = raw_mean_2
        normalized_score_delta = raw_score_delta

    # Clause heatmap diffs
    clause_diffs = []
    v1_sec_map = {s["section"]: s for s in v1_payload["clause_matrix"]}
    v2_sec_map = {s["section"]: s for s in v2_payload["clause_matrix"]}

    for sec in CANONICAL_SECTIONS:
        f1_1 = v1_sec_map.get(sec, {}).get("f1_score", 1.0)
        f1_2 = v2_sec_map.get(sec, {}).get("f1_score", 1.0)
        clause_diffs.append({
            "section": sec,
            "v1_f1": f1_1,
            "v2_f1": f1_2,
            "f1_delta": round(f1_2 - f1_1, 2),
        })

    # Ranking
    ranked = sorted([v1_payload, v2_payload], key=lambda x: (x["summary"]["score_stats"]["mean"] or 0), reverse=True)

    return {
        "v1": {
            "label": v1_label,
            "summary": v1_payload["summary"],
            "version": v1_payload["version"],
            "score_stats": v1_payload["summary"]["score_stats"],
            "extraction_score": v1_payload["summary"]["overall_extraction_score"],
            "run_count": v1_payload["summary"]["total_runs"],
            "exclusion_rate": v1_payload["summary"]["exclusion_rate"],
        },
        "v2": {
            "label": v2_label,
            "summary": v2_payload["summary"],
            "version": v2_payload["version"],
            "score_stats": v2_payload["summary"]["score_stats"],
            "extraction_score": v2_payload["summary"]["overall_extraction_score"],
            "run_count": v2_payload["summary"]["total_runs"],
            "exclusion_rate": v2_payload["summary"]["exclusion_rate"],
        },
        "corpus": {
            "is_identical": is_identical_corpus,
            "common_doc_count": len(common_docs),
            "common_docs": common_docs,
        },
        "deltas": {
            "raw_score_delta": raw_score_delta,
            "normalized_score_delta": normalized_score_delta,
            "extraction_score_delta": raw_ext_delta,
            "exclusion_rate_delta_pct": excl_delta,
            "v1_normalized_mean": norm_mean_1,
            "v2_normalized_mean": norm_mean_2,
        },
        "clause_diffs": clause_diffs,
        "ranking": [
            {
                "label": r["version"]["label"],
                "mean": r["summary"]["score_stats"]["mean"],
                "exclusion_rate": r["summary"]["exclusion_rate"],
                "extraction_score": r["summary"]["overall_extraction_score"],
            }
            for r in ranked
        ],
    }
