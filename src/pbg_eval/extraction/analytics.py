"""Analytics, leaderboard, and batch grading service for metadata extraction."""

from __future__ import annotations

import json
import logging
from typing import Any

from pbg_eval.config import get_config
from pbg_eval.db import connect
from pbg_eval.extraction.judge import MetadataJudge

logger = logging.getLogger(__name__)

EXTRACTION_FIELDS = [
    "bgNumber",
    "amendmentDate",
    "validityDate",
    "claimPeriod",
    "amount",
    "poNo",
    "vendorName",
    "bankBranchAddress",
]


def grade_version_metadata(version_label: str) -> dict[str, Any]:
    """Grade metadata extraction for all scored runs of a pipeline version."""
    config = get_config()
    conn = connect(config.db_path)
    version = conn.execute("SELECT id, label FROM pipeline_version WHERE label = ?", (version_label,)).fetchone()
    if not version:
        conn.close()
        raise ValueError(f"Version '{version_label}' not found")

    version_id = version["id"]
    runs = conn.execute(
        """
        SELECT r.id, r.doc_id, r.vendor_text, r.raw_qwen_output, g.independent_read
        FROM run r
        LEFT JOIN grade g ON g.run_id = r.id
        WHERE r.version_id = ? AND r.status = 'scored'
        """,
        (version_id,),
    ).fetchall()

    judge = MetadataJudge(config)
    graded_count = 0
    errors = []

    for row in runs:
        run_id = row["id"]
        vendor_text = row["vendor_text"] or ""
        raw_output = row["raw_qwen_output"] or "{}"
        independent_read = row["independent_read"] or "{}"

        try:
            target_data = json.loads(raw_output)
            target_meta = target_data.get("vendorMetadata", {})
        except Exception:
            target_meta = {}

        # Ground truth metadata: check independent read ground truth or derive
        ground_meta = {}
        try:
            indep_data = json.loads(independent_read)
            if "vendorMetadata" in indep_data and any(indep_data["vendorMetadata"].values()):
                ground_meta = indep_data["vendorMetadata"]
        except Exception:
            pass

        if not ground_meta and vendor_text:
            ground_meta = judge.derive_ground_truth(vendor_text)

        eval_result = judge.evaluate_metadata(target_meta, ground_meta)
        fs = eval_result["field_scores"]
        em = eval_result["exact_matches"]
        overall = eval_result["overall_extraction_score"]

        conn.execute(
            """
            INSERT INTO extraction_grade (
                run_id, score_bg_number, score_amendment_date, score_validity_date,
                score_claim_period, score_amount, score_po_no, score_vendor_name,
                score_bank_branch_address, overall_extraction_score,
                em_bg_number, em_amendment_date, em_validity_date, em_claim_period,
                em_amount, em_po_no, em_vendor_name, em_bank_branch_address,
                target_metadata, ground_truth_metadata, field_discrepancies
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                score_bg_number = excluded.score_bg_number,
                score_amendment_date = excluded.score_amendment_date,
                score_validity_date = excluded.score_validity_date,
                score_claim_period = excluded.score_claim_period,
                score_amount = excluded.score_amount,
                score_po_no = excluded.score_po_no,
                score_vendor_name = excluded.score_vendor_name,
                score_bank_branch_address = excluded.score_bank_branch_address,
                overall_extraction_score = excluded.overall_extraction_score,
                em_bg_number = excluded.em_bg_number,
                em_amendment_date = excluded.em_amendment_date,
                em_validity_date = excluded.em_validity_date,
                em_claim_period = excluded.em_claim_period,
                em_amount = excluded.em_amount,
                em_po_no = excluded.em_po_no,
                em_vendor_name = excluded.em_vendor_name,
                em_bank_branch_address = excluded.em_bank_branch_address,
                target_metadata = excluded.target_metadata,
                ground_truth_metadata = excluded.ground_truth_metadata,
                field_discrepancies = excluded.field_discrepancies,
                graded_at = datetime('now')
            """,
            (
                run_id,
                fs["score_bg_number"],
                fs["score_amendment_date"],
                fs["score_validity_date"],
                fs["score_claim_period"],
                fs["score_amount"],
                fs["score_po_no"],
                fs["score_vendor_name"],
                fs["score_bank_branch_address"],
                overall,
                em["em_bg_number"],
                em["em_amendment_date"],
                em["em_validity_date"],
                em["em_claim_period"],
                em["em_amount"],
                em["em_po_no"],
                em["em_vendor_name"],
                em["em_bank_branch_address"],
                json.dumps(target_meta),
                json.dumps(ground_meta),
                json.dumps(eval_result["field_discrepancies"]),
            ),
        )
        graded_count += 1

    conn.commit()
    conn.close()
    return {"version": version_label, "graded_runs": graded_count, "errors": errors}


def get_extraction_leaderboard() -> list[dict[str, Any]]:
    """Leaderboard ranking versions by overall metadata extraction accuracy."""
    conn = connect(get_config().db_path)
    versions = conn.execute("SELECT id, label, created_at FROM pipeline_version ORDER BY created_at DESC").fetchall()
    result = []

    for v in versions:
        vid = v["id"]
        grades = conn.execute(
            """
            SELECT eg.* FROM extraction_grade eg
            JOIN run r ON r.id = eg.run_id
            WHERE r.version_id = ?
            """,
            (vid,),
        ).fetchall()

        if not grades:
            continue

        n = len(grades)
        overall_mean = sum(g["overall_extraction_score"] for g in grades) / n

        field_averages = {
            "bgNumber": round(sum(g["score_bg_number"] for g in grades) / n, 2),
            "amendmentDate": round(sum(g["score_amendment_date"] for g in grades) / n, 2),
            "validityDate": round(sum(g["score_validity_date"] for g in grades) / n, 2),
            "claimPeriod": round(sum(g["score_claim_period"] for g in grades) / n, 2),
            "amount": round(sum(g["score_amount"] for g in grades) / n, 2),
            "poNo": round(sum(g["score_po_no"] for g in grades) / n, 2),
            "vendorName": round(sum(g["score_vendor_name"] for g in grades) / n, 2),
            "bankBranchAddress": round(sum(g["score_bank_branch_address"] for g in grades) / n, 2),
        }

        exact_match_rates = {
            "bgNumber": round(sum(g["em_bg_number"] for g in grades) / n, 3),
            "amendmentDate": round(sum(g["em_amendment_date"] for g in grades) / n, 3),
            "validityDate": round(sum(g["em_validity_date"] for g in grades) / n, 3),
            "claimPeriod": round(sum(g["em_claim_period"] for g in grades) / n, 3),
            "amount": round(sum(g["em_amount"] for g in grades) / n, 3),
            "poNo": round(sum(g["em_po_no"] for g in grades) / n, 3),
            "vendorName": round(sum(g["em_vendor_name"] for g in grades) / n, 3),
            "bankBranchAddress": round(sum(g["em_bank_branch_address"] for g in grades) / n, 3),
        }

        result.append({
            "version_id": vid,
            "label": v["label"],
            "created_at": v["created_at"],
            "evaluated_runs": n,
            "overall_extraction_score": round(overall_mean, 2),
            "field_averages": field_averages,
            "exact_match_rates": exact_match_rates,
        })

    conn.close()
    return sorted(result, key=lambda x: x["overall_extraction_score"], reverse=True)


def get_version_extraction_matrix(version_label: str) -> dict[str, Any]:
    """Granular field-by-field breakdown for a version."""
    conn = connect(get_config().db_path)
    version = conn.execute("SELECT id, label FROM pipeline_version WHERE label = ?", (version_label,)).fetchone()
    if not version:
        conn.close()
        raise ValueError(f"Version '{version_label}' not found")

    vid = version["id"]
    grades = conn.execute(
        """
        SELECT r.doc_id, r.timestamp, eg.*
        FROM extraction_grade eg
        JOIN run r ON r.id = eg.run_id
        WHERE r.version_id = ?
        ORDER BY eg.overall_extraction_score ASC
        """,
        (vid,),
    ).fetchall()
    conn.close()

    if not grades:
        return {"version": version_label, "evaluated_runs": 0, "fields": [], "runs": []}

    n = len(grades)
    overall_mean = sum(g["overall_extraction_score"] for g in grades) / n

    fields_breakdown = []
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

    for f_name, (score_col, em_col) in field_col_map.items():
        mean_s = sum(g[score_col] for g in grades) / n
        em_rate = sum(g[em_col] for g in grades) / n
        fields_breakdown.append({
            "field": f_name,
            "mean_score": round(mean_s, 2),
            "exact_match_rate": round(em_rate, 3),
        })

    runs_data = []
    for g in grades:
        runs_data.append({
            "run_id": g["run_id"],
            "doc_id": g["doc_id"],
            "timestamp": g["timestamp"],
            "overall_score": g["overall_extraction_score"],
            "target_metadata": json.loads(g["target_metadata"]),
            "ground_truth_metadata": json.loads(g["ground_truth_metadata"]),
            "field_discrepancies": json.loads(g["field_discrepancies"] or "[]"),
        })

    return {
        "version": version_label,
        "evaluated_runs": n,
        "overall_extraction_score": round(overall_mean, 2),
        "fields": fields_breakdown,
        "runs": runs_data,
    }


def get_run_extraction_grade(run_id: int) -> dict[str, Any] | None:
    """Retrieve metadata extraction evaluation grade for a specific run."""
    conn = connect(get_config().db_path)
    row = conn.execute("SELECT * FROM extraction_grade WHERE run_id = ?", (run_id,)).fetchone()
    conn.close()

    if not row:
        return None

    return {
        "run_id": row["run_id"],
        "overall_extraction_score": row["overall_extraction_score"],
        "field_scores": {
            "bgNumber": row["score_bg_number"],
            "amendmentDate": row["score_amendment_date"],
            "validityDate": row["score_validity_date"],
            "claimPeriod": row["score_claim_period"],
            "amount": row["score_amount"],
            "poNo": row["score_po_no"],
            "vendorName": row["score_vendor_name"],
            "bankBranchAddress": row["score_bank_branch_address"],
        },
        "exact_matches": {
            "bgNumber": bool(row["em_bg_number"]),
            "amendmentDate": bool(row["em_amendment_date"]),
            "validityDate": bool(row["em_validity_date"]),
            "claimPeriod": bool(row["em_claim_period"]),
            "amount": bool(row["em_amount"]),
            "poNo": bool(row["em_po_no"]),
            "vendorName": bool(row["em_vendor_name"]),
            "bankBranchAddress": bool(row["em_bank_branch_address"]),
        },
        "target_metadata": json.loads(row["target_metadata"]),
        "ground_truth_metadata": json.loads(row["ground_truth_metadata"]),
        "field_discrepancies": json.loads(row["field_discrepancies"] or "[]"),
        "graded_at": row["graded_at"],
    }
