from pbg_eval.analytics.clause_matrix import (
    CANONICAL_SECTIONS,
    classify_clause_section,
    compute_version_clause_matrix,
)
from pbg_eval.config import get_config
from pbg_eval.db import connect
import uuid
import json


def test_classify_clause_section():
    assert classify_clause_section("Clause 1", "undertake to pay") == "Clause 1"
    assert classify_clause_section("4", "continuing guarantee shall not be anywise affected") == "Clause 4"
    assert classify_clause_section("Clause 6", "exclusive jurisdiction of Courts at New Delhi") == "Clause 6"
    assert classify_clause_section("Preamble", "In consideration of Indian Oil") == "Opening Preamble"
    assert classify_clause_section("Signatory", "all claims payable at Mumbai branch") == "Signatory Block / Post-Clause 8"


def test_compute_clause_matrix():
    conn = connect(get_config().db_path)
    label = f"test-matrix-ver-{uuid.uuid4().hex[:6]}"
    cur = conn.execute("INSERT INTO pipeline_version (label, prompt_hash, model_config) VALUES (?, 'h', '{}')", (label,))
    vid = cur.lastrowid

    target_out = json.dumps({
        "deviations": [
            {"clauseNo": "Clause 4", "appearingInBg": "shall be anywise", "severity": "CRITICAL"},
            {"clauseNo": "Clause 6", "appearingInBg": "Kolkata", "severity": "CRITICAL"},
        ]
    })
    ground_truth = json.dumps({
        "expected_deviations": [
            {"clauseNo": "Clause 4", "appearingInBg": "shall be anywise", "severity": "CRITICAL"},
            {"clauseNo": "Clause 6", "appearingInBg": "Kolkata", "severity": "CRITICAL"},
        ]
    })

    cur_run = conn.execute(
        "INSERT INTO run (version_id, doc_id, status, raw_qwen_output) VALUES (?, 'doc-syn', 'scored', ?)",
        (vid, target_out)
    )
    run_id = cur_run.lastrowid
    conn.execute(
        """
        INSERT INTO grade (
            run_id, deviation_recall, deviation_precision, severity_correctness,
            reasoning_quality, schema_integrity, scope_discipline, overall_score,
            independent_read
        ) VALUES (?, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, ?)
        """,
        (run_id, ground_truth)
    )
    conn.commit()
    conn.close()

    matrix = compute_version_clause_matrix(label)
    assert matrix["version"] == label
    assert matrix["total_scored_runs"] == 1
    assert len(matrix["sections"]) == len(CANONICAL_SECTIONS)

    cl4 = next(s for s in matrix["sections"] if s["section"] == "Clause 4")
    assert cl4["true_positives"] == 1
    assert cl4["false_positives"] == 0
    assert cl4["recall"] == 1.0
