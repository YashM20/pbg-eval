import pytest
import httpx
from app.main import app
from pbg_eval.services.arena import get_available_ollama_models, get_multi_model_benchmarks
from pbg_eval.services.observer import get_production_drift_telemetry


def test_get_available_ollama_models():
    models = get_available_ollama_models()
    assert isinstance(models, list)
    assert len(models) >= 1
    assert "name" in models[0]


def test_get_multi_model_benchmarks():
    benchmarks = get_multi_model_benchmarks()
    assert isinstance(benchmarks, list)


def test_get_production_drift_telemetry():
    telemetry = get_production_drift_telemetry()
    assert "drift_status" in telemetry
    assert "confidence_distribution" in telemetry


@pytest.mark.asyncio
async def test_arena_and_observer_api():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Arena models
        m_resp = await client.get("/api/arena/models")
        assert m_resp.status_code == 200
        assert "models" in m_resp.json()

        # Arena benchmarks
        b_resp = await client.get("/api/arena/benchmarks")
        assert b_resp.status_code == 200
        assert "benchmarks" in b_resp.json()

        # Observer drift
        d_resp = await client.get("/api/observer/drift")
        assert d_resp.status_code == 200
        assert "drift_status" in d_resp.json()
