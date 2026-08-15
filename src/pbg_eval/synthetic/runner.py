"""Synthetic test evaluation runner against known injected anomalies."""

from __future__ import annotations

import json
from typing import Any

from pbg_eval.synthetic.generator import SyntheticDocument, generate_synthetic_suite


def evaluate_synthetic_output(
    doc: SyntheticDocument,
    raw_output: str,
) -> dict[str, Any]:
    """Verify target comparison output against known ground-truth injected anomalies."""
    try:
        parsed = json.loads(raw_output)
        deviations = parsed.get("deviations", [])
    except Exception:
        deviations = []

    injected = doc.injected_anomalies
    matched_anomalies = []
    missed_anomalies = []

    for anomaly in injected:
        found = False
        exp_snippet = anomaly.get("appearing_in_bg", "").lower()
        exp_clause = anomaly.get("clause_no", "").lower()

        for dev in deviations:
            app_bg = str(dev.get("appearingInBg", "")).lower()
            cl_no = str(dev.get("clauseNo", "")).lower()

            if (exp_snippet and exp_snippet in app_bg) or (exp_clause and exp_clause in cl_no):
                found = True
                matched_anomalies.append({
                    "anomaly_id": anomaly["id"],
                    "anomaly_name": anomaly["name"],
                    "matched_deviation": dev,
                })
                break

        if not found:
            missed_anomalies.append(anomaly)

    total_injected = len(injected)
    caught_count = len(matched_anomalies)
    recall = round(caught_count / total_injected, 3) if total_injected > 0 else 1.0

    return {
        "doc_id": doc.doc_id,
        "title": doc.title,
        "total_injected": total_injected,
        "caught_count": caught_count,
        "recall": recall,
        "matched": matched_anomalies,
        "missed": missed_anomalies,
        "total_reported_deviations": len(deviations),
        "passed": caught_count == total_injected,
    }
