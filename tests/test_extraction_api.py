import json
import uuid
import pytest
import httpx
from app.main import app
from pbg_eval.config import get_config
from pbg_eval.db import connect


@pytest.mark.asyncio
async def test_extraction_api_endpoints():
    conn = connect(get_config().db_path)
    label = f"extract-ver-{uuid.uuid4().hex[:6]}"
    cur = conn.execute("INSERT INTO pipeline_version (label, prompt_hash, model_config) VALUES (?, 'hash', '{}')", (label,))
    vid = cur.lastrowid

    target_meta = {
        "bgNumber": "0504726IBGP0012",
        "amendmentDate": "15-JAN-2026",
        "validityDate": "31-DEC-2028",
        "claimPeriod": "31-MAR-2029",
        "amount": "Rs. 50,00,000/-",
        "poNo": "12038273",
        "vendorName": "Sterling Auxiliaries",
        "bankBranchAddress": "HDFC Bank Ltd, New Delhi",
    }
    raw_output = json.dumps({"deviations": [], "vendorMetadata": target_meta})

    cur_run = conn.execute(
        "INSERT INTO run (version_id, doc_id, status, raw_qwen_output, vendor_text) VALUES (?, 'doc-extract-1', 'scored', ?, 'vendor text')",
        (vid, raw_output)
    )
    run_id = cur_run.lastrowid

    # Insert extraction grade
    conn.execute(
        """
        INSERT INTO extraction_grade (
            run_id, score_bg_number, score_amendment_date, score_validity_date,
            score_claim_period, score_amount, score_po_no, score_vendor_name,
            score_bank_branch_address, overall_extraction_score,
            em_bg_number, em_amendment_date, em_validity_date, em_claim_period,
            em_amount, em_po_no, em_vendor_name, em_bank_branch_address,
            target_metadata, ground_truth_metadata, field_discrepancies
        ) VALUES (?, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 9.0, 9.85, 1, 1, 1, 1, 1, 1, 1, 1, ?, ?, '[]')
        """,
        (run_id, json.dumps(target_meta), json.dumps(target_meta))
    )
    conn.commit()
    conn.close()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Leaderboard
        lb_resp = await client.get("/api/extraction/leaderboard")
        assert lb_resp.status_code == 200
        lb_data = lb_resp.json()
        assert len(lb_data) >= 1

        # Version Matrix
        matrix_resp = await client.get(f"/api/extraction/versions/{label}/matrix")
        assert matrix_resp.status_code == 200
        m_data = matrix_resp.json()
        assert m_data["version"] == label
        assert len(m_data["fields"]) == 8
        assert len(m_data["runs"]) >= 1

        # Run Grade Details
        run_resp = await client.get(f"/api/extraction/runs/{run_id}")
        assert run_resp.status_code == 200
        r_data = run_resp.json()
        assert r_data["overall_extraction_score"] == 9.85
        assert r_data["exact_matches"]["bgNumber"] is True
