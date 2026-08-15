"""Raw sqlite3 access with WAL mode and resilient concurrency — no ORM."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

_SCHEMA = Path(__file__).parent / "schema.sql"


def connect(db_path: Path | str) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    init_db(conn)
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA.read_text(encoding="utf-8"))
    _migrate(conn)
    conn.commit()


def _migrate(conn: sqlite3.Connection) -> None:
    """Idempotent ALTER-TABLE migrations for pre-existing databases."""
    run_cols = {row["name"] for row in conn.execute("PRAGMA table_info(run)")}
    if "job_id" not in run_cols:
        conn.execute("ALTER TABLE run ADD COLUMN job_id INTEGER REFERENCES eval_job(id)")
    if "thinking_trace" not in run_cols:
        conn.execute("ALTER TABLE run ADD COLUMN thinking_trace TEXT")
    if "heal_count" not in run_cols:
        conn.execute("ALTER TABLE run ADD COLUMN heal_count INTEGER NOT NULL DEFAULT 0")

    eval_cols = {row["name"] for row in conn.execute("PRAGMA table_info(eval_job)")}
    if "stopped" not in eval_cols:
        conn.execute("ALTER TABLE eval_job ADD COLUMN stopped INTEGER NOT NULL DEFAULT 0")
    if "finished_at" not in eval_cols:
        conn.execute("ALTER TABLE eval_job ADD COLUMN finished_at TEXT")

    grade_cols = {row["name"] for row in conn.execute("PRAGMA table_info(grade)")}
    if "graded_at" not in grade_cols:
        conn.execute("ALTER TABLE grade ADD COLUMN graded_at TEXT")


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)
