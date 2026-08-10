"""Environment-backed configuration."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path


def _env_bool(key: str, default: bool = False) -> bool:
    val = os.getenv(key, "").strip().lower()
    if not val:
        return default
    return val in ("1", "true", "yes", "on")


@dataclass
class ScoreWeights:
    deviation_recall: float = 0.30
    deviation_precision: float = 0.25
    severity_correctness: float = 0.20
    schema_integrity: float = 0.15
    reasoning_quality: float = 0.10


@dataclass
class ScopePenalty:
    threshold: float = 5.0
    factor: float = 0.85


@dataclass
class Config:
    backend_url: str = field(default_factory=lambda: os.getenv("PBG_BACKEND_URL", "http://localhost:8000"))
    backend_email: str = field(default_factory=lambda: os.getenv("PBG_BACKEND_EMAIL", ""))
    backend_password: str = field(default_factory=lambda: os.getenv("PBG_BACKEND_PASSWORD", ""))
    allow_prod: bool = field(default_factory=lambda: _env_bool("PBG_ALLOW_PROD"))
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    gemini_model: str = field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-2.0-flash"))
    db_path: Path = field(default_factory=lambda: Path(os.getenv("PBG_DB_PATH", "data/pbg_eval.db")))
    poll_interval: float = field(default_factory=lambda: float(os.getenv("PBG_POLL_INTERVAL", "10")))
    poll_timeout: float = field(default_factory=lambda: float(os.getenv("PBG_POLL_TIMEOUT", "3600")))
    upload_poll_timeout: float = field(default_factory=lambda: float(os.getenv("PBG_UPLOAD_POLL_TIMEOUT", "3600")))
    request_timeout: float = field(default_factory=lambda: float(os.getenv("PBG_REQUEST_TIMEOUT", "60")))
    comparison_timeout: float = field(default_factory=lambda: float(os.getenv("PBG_COMPARISON_TIMEOUT", "300")))
    s3_upload_timeout: float = field(default_factory=lambda: float(os.getenv("PBG_S3_UPLOAD_TIMEOUT", "300")))
    sse_timeout: float = field(default_factory=lambda: float(os.getenv("PBG_SSE_TIMEOUT", "2400")))
    capture_trace: bool = field(default_factory=lambda: _env_bool("PBG_CAPTURE_TRACE", True))
    transport_retries: int = field(default_factory=lambda: int(os.getenv("PBG_TRANSPORT_RETRIES", "3")))
    transport_retry_delay: float = field(default_factory=lambda: float(os.getenv("PBG_TRANSPORT_RETRY_DELAY", "10")))
    score_weights: ScoreWeights = field(default_factory=ScoreWeights)
    scope_penalty: ScopePenalty = field(
        default_factory=lambda: ScopePenalty(
            factor=float(os.getenv("PBG_SCOPE_PENALTY", "0.85")),
        )
    )

    def is_staging(self) -> bool:
        url = self.backend_url.lower()
        blocked = ("prod", "production", "live")
        return not any(b in url for b in blocked)


_config: Config | None = None


def get_config() -> Config:
    global _config
    if _config is None:
        _config = Config()
    return _config
