"""Proactive fault healing and remediation orchestrator for pbg-eval."""

from __future__ import annotations

import logging
import sqlite3
import time
from typing import Any, Callable, TypeVar

from pbg_eval.clients.backend import BackendClient, BackendError
from pbg_eval.healing.detector import FaultType, classify_exception

logger = logging.getLogger(__name__)

T = TypeVar("T")


class RemediationResult:
    def __init__(self, healed: bool, action_taken: str, details: Any = None):
        self.healed = healed
        self.action_taken = action_taken
        self.details = details


def log_fault_event(
    conn: sqlite3.Connection,
    fault_type: FaultType | str,
    error_message: str,
    remedy_applied: str,
    success: bool,
    run_id: int | None = None,
    job_id: int | None = None,
) -> int:
    """Record an entry into the fault_log table."""
    cur = conn.execute(
        """
        INSERT INTO fault_log (run_id, job_id, fault_type, error_message, remedy_applied, success)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            job_id,
            fault_type.value if hasattr(fault_type, "value") else str(fault_type),
            error_message[:500] if error_message else None,
            remedy_applied,
            1 if success else 0,
        ),
    )
    conn.commit()
    return cur.lastrowid  # type: ignore[return-value]


class FaultHealer:
    def __init__(self, client: BackendClient, conn: sqlite3.Connection):
        self.client = client
        self.conn = conn

    def handle_backend_failure(
        self,
        exc: Exception,
        doc_id: str,
        backend_job_id: str | None = None,
        job_id: int | None = None,
        run_id: int | None = None,
    ) -> RemediationResult:
        """Attempt to remediate a backend error and record telemetry."""
        fault_type, msg = classify_exception(exc)
        logger.warning(
            "[FaultHealer] Detected fault %s for doc %s (backend_job: %s): %s",
            fault_type.value, doc_id, backend_job_id, msg
        )

        if fault_type == FaultType.AUTH_FAILURE:
            try:
                self.client.refresh_access_token()
                log_fault_event(self.conn, fault_type, msg, "refreshed_auth_token", True, run_id, job_id)
                return RemediationResult(True, "refreshed_auth_token")
            except Exception as auth_err:
                try:
                    self.client.login()
                    log_fault_event(self.conn, fault_type, msg, "re_authenticated_credentials", True, run_id, job_id)
                    return RemediationResult(True, "re_authenticated_credentials")
                except Exception as login_err:
                    log_fault_event(self.conn, fault_type, str(login_err), "auth_remedy_failed", False, run_id, job_id)
                    return RemediationResult(False, "auth_remedy_failed", str(login_err))

        if fault_type in (FaultType.POLL_TIMEOUT, FaultType.JOB_STUCK):
            if backend_job_id:
                try:
                    logger.info("[FaultHealer] Evicting stuck job from GPU VRAM: %s", backend_job_id)
                    self.client.cancel_job(backend_job_id)
                    time.sleep(2.0)
                    self.client.retry_job(backend_job_id)
                    log_fault_event(self.conn, fault_type, msg, "cancelled_and_requeued_backend_job", True, run_id, job_id)
                    return RemediationResult(True, "cancelled_and_requeued_backend_job")
                except Exception as retry_err:
                    log_fault_event(self.conn, fault_type, str(retry_err), "retry_remedy_failed", False, run_id, job_id)
                    return RemediationResult(False, "retry_remedy_failed", str(retry_err))

        if fault_type == FaultType.TRANSIENT_NETWORK:
            time.sleep(5.0)
            log_fault_event(self.conn, fault_type, msg, "network_backoff_applied", True, run_id, job_id)
            return RemediationResult(True, "network_backoff_applied")

        # Unknown or unrecoverable error
        log_fault_event(self.conn, fault_type, msg, "no_remediation_available", False, run_id, job_id)
        return RemediationResult(False, "no_remediation_available")
