import uuid
import pytest
import httpx
from app.main import app
from pbg_eval.config import get_config
from pbg_eval.db import connect
from pbg_eval.services.export_report import generate_html_compliance_report


def test_generate_html_compliance_report():
    html = generate_html_compliance_report()
    assert "<!DOCTYPE html>" in html
    assert "IOCL PBG Evaluation & Audit Report" in html
    assert "Clause-by-Clause Accuracy Matrix" in html


@pytest.mark.asyncio
async def test_quality_gate_api():
    conn = connect(get_config().db_path)
    label = f"gate-test-{uuid.uuid4().hex[:6]}"
    cur = conn.execute("INSERT INTO pipeline_version (label, prompt_hash, model_config) VALUES (?, 'h', '{}')", (label,))
    vid = cur.lastrowid
    cur_run = conn.execute("INSERT INTO run (version_id, doc_id, status) VALUES (?, 'doc-gate', 'scored')", (vid,))
    run_id = cur_run.lastrowid
    conn.execute(
        """
        INSERT INTO grade (
            run_id, deviation_recall, deviation_precision, severity_correctness,
            reasoning_quality, schema_integrity, scope_discipline, overall_score,
            independent_read
        ) VALUES (?, 9.0, 9.0, 9.0, 9.0, 9.0, 10.0, 9.0, '{}')
        """,
        (run_id,)
    )
    conn.commit()
    conn.close()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Evaluate Gate
        resp = await client.post(
            "/api/gates/evaluate",
            json={"version_label": label, "min_overall_score": 8.0, "max_exclusion_rate": 0.1},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["verdict"] == "PASSED"
        assert data["checks"]["mean_score"]["passed"] is True

        # Export HTML
        html_resp = await client.get(f"/api/gates/export/html?version={label}")
        assert html_resp.status_code == 200
        assert "text/html" in html_resp.headers["content-type"]
