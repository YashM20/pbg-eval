import uuid
import pytest
import httpx
from app.main import app
from pbg_eval.config import get_config
from pbg_eval.db import connect
from pbg_eval.optimization.diagnostician import diagnose_version_errors


def test_diagnose_version_errors():
    conn = connect(get_config().db_path)
    label = f"diag-test-{uuid.uuid4().hex[:6]}"
    cur = conn.execute("INSERT INTO pipeline_version (label, prompt_hash, model_config) VALUES (?, 'h', '{}')", (label,))
    vid = cur.lastrowid
    cur_run = conn.execute("INSERT INTO run (version_id, doc_id, status) VALUES (?, 'doc-diag', 'scored')", (vid,))
    run_id = cur_run.lastrowid
    conn.execute(
        """
        INSERT INTO grade (
            run_id, deviation_recall, deviation_precision, severity_correctness,
            reasoning_quality, schema_integrity, scope_discipline, overall_score,
            independent_read, grader_notes
        ) VALUES (?, 6.0, 5.5, 9.0, 8.0, 10.0, 10.0, 6.2, '{}', 'Missed Clause 4 and flagged date placeholder')
        """,
        (run_id,)
    )
    conn.commit()
    conn.close()

    res = diagnose_version_errors(label)
    assert res["version"] == label
    assert res["low_score_count"] == 1
    assert len(res["recommendations"]) >= 1


@pytest.mark.asyncio
async def test_studio_api():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Baseline prompt
        resp = await client.get("/api/studio/baseline-prompt")
        assert resp.status_code == 200
        assert "baseline_prompt" in resp.json()
