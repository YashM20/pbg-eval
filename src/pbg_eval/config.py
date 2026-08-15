"""Environment-backed configuration for pbg-eval using Pydantic Settings."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ScoreWeights(BaseModel):
    deviation_recall: float = 0.30
    deviation_precision: float = 0.25
    severity_correctness: float = 0.20
    schema_integrity: float = 0.15
    reasoning_quality: float = 0.10


class ScopePenalty(BaseModel):
    threshold: float = 5.0
    factor: float = 0.85


class Config(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PBG_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Backend configuration
    backend_url: str = Field(default="http://localhost:8000")
    backend_email: str = Field(default="")
    backend_password: str = Field(default="")
    allow_prod: bool = Field(default=False)

    # Gemini configuration
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.0-flash", alias="GEMINI_MODEL")
    gemini_fallback_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_FALLBACK_MODEL")

    # Storage
    db_path: Path = Field(default=Path("data/pbg_eval.db"))

    # Polling and intervals
    poll_interval: float = Field(default=5.0)
    poll_timeout: float = Field(default=3600.0)
    upload_poll_timeout: float = Field(default=3600.0)

    # HTTP timeouts
    request_timeout: float = Field(default=60.0)
    comparison_timeout: float = Field(default=300.0)
    s3_upload_timeout: float = Field(default=300.0)
    sse_timeout: float = Field(default=2400.0)

    # Trace & retries
    capture_trace: bool = Field(default=True)
    transport_retries: int = Field(default=3)
    transport_retry_delay: float = Field(default=5.0)

    # Scoring configuration
    score_weights: ScoreWeights = Field(default_factory=ScoreWeights)
    scope_penalty: ScopePenalty = Field(default_factory=ScopePenalty)

    @field_validator("scope_penalty", mode="before")
    @classmethod
    def _parse_scope_penalty(cls, v: Any) -> Any:
        if isinstance(v, (int, float)):
            return ScopePenalty(factor=float(v))
        if isinstance(v, str):
            try:
                val = float(v)
                return ScopePenalty(factor=val)
            except ValueError:
                pass
        return v

    def is_staging(self) -> bool:
        """Return True if backend URL does not match a production pattern."""
        url = self.backend_url.lower()
        blocked = ("prod", "production", "live", "api.pbg.iocl")
        return not any(b in url for b in blocked)

    def dump(self) -> str:
        return json.dumps(self.model_dump(), indent=2, default=str)


_config: Config | None = None


def get_config() -> Config:
    global _config
    if _config is None:
        _config = Config()
    return _config


def reload_config() -> Config:
    global _config
    _config = Config()
    return _config
