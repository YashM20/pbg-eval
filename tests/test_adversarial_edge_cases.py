import json
import uuid
import pytest
from pbg_eval.analytics.unified_metrics import compare_versions_normalized, get_unified_version_payload
from pbg_eval.config import get_config
from pbg_eval.db import connect
from pbg_eval.services.run import replay_run
from pbg_eval.services.versioning import discover_benchmark_documents, get_next_version_label


def test_auto_version_label_sequential_and_collision_resistance():
    conn = connect(get_config().db_path)
    # Insert v1.0, v1.1
    conn.execute("INSERT OR IGNORE INTO pipeline_version (label, prompt_hash, model_config) VALUES ('v1.0', 'h', '{}')")
    conn.execute("INSERT OR IGNORE INTO pipeline_version (label, prompt_hash, model_config) VALUES ('v1.1', 'h', '{}')")
    conn.commit()
    conn.close()

    suggested = get_next_version_label()
    assert suggested.startswith("v1.")
    minor = int(suggested.split(".")[1])
    assert minor >= 2


def test_compare_versions_normalized_asymmetric_datasets():
    conn = connect(get_config().db_path)
    v1_label = f"ver-a-{uuid.uuid4().hex[:6]}"
    v2_label = f"ver-b-{uuid.uuid4().hex[:6]}"

    cur1 = conn.execute("INSERT INTO pipeline_version (label, prompt_hash, model_config) VALUES (?, 'h', '{}')", (v1_label,))
    v1_id = cur1.lastrowid
    cur2 = conn.execute("INSERT INTO pipeline_version (label, prompt_hash, model_config) VALUES (?, 'h', '{}')", (v2_label,))
    v2_id = cur2.lastrowid

    # V1 tested on doc-common and doc-unique-1
    cur_r1 = conn.execute("INSERT INTO run (version_id, doc_id, status) VALUES (?, 'doc-common', 'scored')", (v1_id,))
    conn.execute("INSERT INTO grade (run_id, deviation_recall, deviation_precision, severity_correctness, reasoning_quality, schema_integrity, scope_discipline, overall_score, independent_read) VALUES (?, 8.0, 8.0, 8.0, 8.0, 8.0, 10.0, 8.0, '{}')", (cur_r1.lastrowid,))

    cur_r2 = conn.execute("INSERT INTO run (version_id, doc_id, status) VALUES (?, 'doc-unique-1', 'scored')", (v1_id,))
    conn.execute("INSERT INTO grade (run_id, deviation_recall, deviation_precision, severity_correctness, reasoning_quality, schema_integrity, scope_discipline, overall_score, independent_read) VALUES (?, 6.0, 6.0, 6.0, 6.0, 6.0, 10.0, 6.0, '{}')", (cur_r2.lastrowid,))

    # V2 tested on doc-common and doc-unique-2
    cur_r3 = conn.execute("INSERT INTO run (version_id, doc_id, status) VALUES (?, 'doc-common', 'scored')", (v2_id,))
    conn.execute("INSERT INTO grade (run_id, deviation_recall, deviation_precision, severity_correctness, reasoning_quality, schema_integrity, scope_discipline, overall_score, independent_read) VALUES (?, 9.0, 9.0, 9.0, 9.0, 9.0, 10.0, 9.0, '{}')", (cur_r3.lastrowid,))

    cur_r4 = conn.execute("INSERT INTO run (version_id, doc_id, status) VALUES (?, 'doc-unique-2', 'scored')", (v2_id,))
    conn.execute("INSERT INTO grade (run_id, deviation_recall, deviation_precision, severity_correctness, reasoning_quality, schema_integrity, scope_discipline, overall_score, independent_read) VALUES (?, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, '{}')", (cur_r4.lastrowid,))

    conn.commit()
    conn.close()

    res = compare_versions_normalized(v1_label, v2_label)
    assert res["corpus"]["is_identical"] is False
    assert res["corpus"]["common_doc_count"] == 1
    assert "doc-common" in res["corpus"]["common_docs"]

    # Common doc scores: V1 had 8.0 on doc-common, V2 had 9.0 on doc-common -> Normalized delta is +1.0
    assert res["deltas"]["normalized_score_delta"] == 1.0


def test_replay_run_missing_backend_ids_fails_gracefully():
    conn = connect(get_config().db_path)
    label = f"ver-err-{uuid.uuid4().hex[:6]}"
    cur = conn.execute("INSERT INTO pipeline_version (label, prompt_hash, model_config) VALUES (?, 'h', '{}')", (label,))
    vid = cur.lastrowid
    cur_run = conn.execute("INSERT INTO run (version_id, doc_id, status) VALUES (?, 'doc-err', 'excluded')", (vid,))
    run_id = cur_run.lastrowid
    conn.commit()
    conn.close()

    with pytest.raises(ValueError, match="does not have valid backend"):
        replay_run(run_id)


def test_discover_benchmark_documents_resilience():
    docs = discover_benchmark_documents()
    assert isinstance(docs, list)
    # Ensure master templates and task docs are excluded
    for d in docs:
        assert "format" not in d["doc_id"].lower()
        assert "analysis" not in d["doc_id"].lower()
