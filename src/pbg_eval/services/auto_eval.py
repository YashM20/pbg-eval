"""Autonomous background evaluation daemon and scheduled sweep orchestrator."""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from pbg_eval.clients.backend import BackendClient
from pbg_eval.config import Config, get_config
from pbg_eval.db import connect
from pbg_eval.services.run import execute_run_batch, start_run

logger = logging.getLogger(__name__)


@dataclass
class DaemonStatus:
    is_running: bool
    interval_seconds: int
    last_sweep_at: str | None
    total_sweeps: int
    active_job_id: int | None
    last_error: str | None


class AutoEvalDaemon:
    """Continuous evaluation runner for unattended testing."""

    _instance: "AutoEvalDaemon | None" = None
    _lock = threading.Lock()
    _sweep_lock = threading.Lock()

    def __init__(self, config: Config | None = None):
        self.config = config or get_config()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._interval: int = 3600  # default 1 hour
        self._docs_dir: Path = Path("sample_docs")
        self._repeats: int = 3
        self._last_sweep_at: str | None = None
        self._total_sweeps: int = 0
        self._active_job_id: int | None = None
        self._last_error: str | None = None

    @classmethod
    def get_instance(cls) -> "AutoEvalDaemon":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def start(
        self,
        interval_seconds: int = 3600,
        docs_dir: str | Path = "sample_docs",
        repeats: int = 3,
    ) -> None:
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                logger.info("[AutoEvalDaemon] Daemon already running")
                return

            self._interval = interval_seconds
            self._docs_dir = Path(docs_dir)
            self._repeats = repeats
            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._run_loop, name="pbg-auto-eval-daemon", daemon=True
            )
            self._thread.start()
            logger.info(
                "[AutoEvalDaemon] Started autonomous eval daemon (interval: %ds, docs: %s, repeats: %d)",
                self._interval, self._docs_dir, self._repeats
            )

    def stop(self) -> None:
        with self._lock:
            self._stop_event.set()
            if self._thread is not None:
                self._thread.join(timeout=10.0)
                self._thread = None
            logger.info("[AutoEvalDaemon] Stopped autonomous eval daemon")

    def get_status(self) -> DaemonStatus:
        return DaemonStatus(
            is_running=self._thread is not None and self._thread.is_alive(),
            interval_seconds=self._interval,
            last_sweep_at=self._last_sweep_at,
            total_sweeps=self._total_sweeps,
            active_job_id=self._active_job_id,
            last_error=self._last_error,
        )

    def trigger_sweep_now(
        self,
        version_label: str | None = None,
        docs_dir: str | Path | None = None,
        repeats: int | None = None,
    ) -> int:
        """Trigger an immediate evaluation sweep synchronously in background task."""
        if not self._sweep_lock.acquire(blocking=False):
            logger.warning("[AutoEvalDaemon] Sweep trigger rejected — another sweep is already actively running")
            raise RuntimeError("An evaluation sweep is already in progress.")

        try:
            docs = Path(docs_dir) if docs_dir else self._docs_dir
            num_repeats = repeats or self._repeats
            label = version_label or f"auto-sweep-{time.strftime('%Y%m%d-%H%M%S')}"

            logger.info("[AutoEvalDaemon] Triggering immediate sweep: %s", label)
            job_id, _ = start_run(
                label,
                docs,
                repeats=num_repeats,
                config=self.config,
            )
            self._active_job_id = job_id

            # Run sweep
            try:
                execute_run_batch(
                    job_id=job_id,
                    version_label=label,
                    docs_dir=docs,
                    repeats=num_repeats,
                    auto_grade=True,
                    config=self.config,
                )
                self._last_sweep_at = time.strftime("%Y-%m-%d %H:%M:%S")
                self._total_sweeps += 1
                self._last_error = None
            except Exception as exc:
                self._last_error = str(exc)
                logger.error("[AutoEvalDaemon] Sweep failed: %s", exc)
            finally:
                self._active_job_id = None

            return job_id
        finally:
            self._sweep_lock.release()

    def _run_loop(self) -> None:
        logger.info("[AutoEvalDaemon] Background loop entered")
        while not self._stop_event.is_set():
            try:
                # 1. Run evaluation sweep
                self.trigger_sweep_now()
            except Exception as exc:
                self._last_error = str(exc)
                logger.error("[AutoEvalDaemon] Error in loop cycle: %s", exc)

            # 2. Wait interval or until stopped
            self._stop_event.wait(float(self._interval))
