from pbg_eval.config import Config


def test_config_staging_guard():
    cfg_staging = Config(backend_url="http://localhost:8000")
    assert cfg_staging.is_staging() is True

    cfg_prod = Config(backend_url="https://api.pbg.iocl.live")
    assert cfg_prod.is_staging() is False

    cfg_custom = Config(backend_url="https://staging.internal.iocl.in")
    assert cfg_custom.is_staging() is True


def test_config_weights():
    cfg = Config()
    w = cfg.score_weights
    total = (
        w.deviation_recall
        + w.deviation_precision
        + w.severity_correctness
        + w.schema_integrity
        + w.reasoning_quality
    )
    assert round(total, 2) == 1.00
