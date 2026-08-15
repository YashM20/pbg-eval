"""Fault classification and anomaly detection for pbg-eval pipeline."""

from __future__ import annotations

import logging
import re
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class FaultType(str, Enum):
    AUTH_FAILURE = "auth_failure"
    JOB_STUCK = "job_stuck"
    TRANSIENT_NETWORK = "transient_network"
    BACKEND_ERROR = "backend_error"
    OCR_FAILURE = "ocr_failure"
    POLL_TIMEOUT = "poll_timeout"
    TARGET_EMPTY = "target_empty"
    TARGET_TRUNCATED = "target_truncated"
    TARGET_LOOPING = "target_looping"
    TARGET_INVALID_JSON = "target_invalid_json"
    TARGET_VERBATIM_ECHO = "target_verbatim_echo"
    GRADER_RATE_LIMIT = "grader_rate_limit"
    UNKNOWN = "unknown"


def classify_exception(exc: Exception) -> tuple[FaultType, str]:
    """Classify an arbitrary exception into a standard FaultType and diagnostic message."""
    msg = str(exc)
    lower = msg.lower()

    if "401" in lower or "auth" in lower or "unauthorized" in lower or "session" in lower:
        return FaultType.AUTH_FAILURE, msg
    if "429" in lower or "quota" in lower or "resource_exhausted" in lower:
        return FaultType.GRADER_RATE_LIMIT, msg
    if "poll_timeout" in lower or "timed out" in lower:
        return FaultType.POLL_TIMEOUT, msg
    if "connect" in lower or "read timeout" in lower or "broken pipe" in lower or "network" in lower:
        return FaultType.TRANSIENT_NETWORK, msg
    if "paddleocr" in lower or "ocr" in lower:
        return FaultType.OCR_FAILURE, msg
    if "backend_error" in lower or "500" in lower or "502" in lower or "503" in lower:
        return FaultType.BACKEND_ERROR, msg

    return FaultType.UNKNOWN, msg
