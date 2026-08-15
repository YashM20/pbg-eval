import uuid
import pytest
import httpx
from app.main import app
from pbg_eval.config import get_config
from pbg_eval.db import connect


@pytest.mark.asyncio
async def test_api_health():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "pbg-eval"


@pytest.mark.asyncio
async def test_api_versions():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/versions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_api_faults():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/faults/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "summary" in data
        assert "recent_events" in data


@pytest.mark.asyncio
async def test_api_auto_status_and_control():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Status
        resp = await client.get("/api/auto/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "is_running" in data

        # Start daemon
        start_resp = await client.post("/api/auto/start", json={"interval_seconds": 7200, "repeats": 2})
        assert start_resp.status_code == 200
        assert start_resp.json()["is_running"] is True

        # Stop daemon
        stop_resp = await client.post("/api/auto/stop")
        assert stop_resp.status_code == 200
        assert stop_resp.json()["is_running"] is False


@pytest.mark.asyncio
async def test_api_batch_lifecycle():
    conn = connect(get_config().db_path)
    label = f"test-batch-{uuid.uuid4().hex[:8]}"
    cur = conn.execute("INSERT INTO pipeline_version (label, prompt_hash, model_config) VALUES (?, 'hash123', '{}')", (label,))
    v_id = cur.lastrowid
    cur_run = conn.execute(
        "INSERT INTO run (version_id, doc_id, status) VALUES (?, 'doc-001', 'scored')",
        (v_id,)
    )
    run_id = cur_run.lastrowid
    conn.execute(
        """
        INSERT INTO grade (
            run_id, deviation_recall, deviation_precision, severity_correctness,
            reasoning_quality, schema_integrity, scope_discipline, overall_score,
            independent_read
        ) VALUES (?, 9.0, 8.5, 9.0, 8.0, 10.0, 10.0, 8.9, '{}')
        """,
        (run_id,)
    )
    conn.commit()
    conn.close()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Get run details
        run_resp = await client.get(f"/api/runs/{run_id}")
        assert run_resp.status_code == 200
        assert run_resp.json()["doc_id"] == "doc-001"
        assert run_resp.json()["overall_score"] == 8.9

        # Get version runs
        ver_runs_resp = await client.get(f"/api/versions/{label}/runs")
        assert ver_runs_resp.status_code == 200
        assert len(ver_runs_resp.json()["runs"]) >= 1
