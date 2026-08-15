import sqlite3
import tempfile
from pathlib import Path
from pbg_eval.db import connect


def test_db_init_and_wal_mode():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        conn = connect(db_path)

        # Verify PRAGMAs
        journal_mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
        assert journal_mode.lower() == "wal"

        foreign_keys = conn.execute("PRAGMA foreign_keys;").fetchone()[0]
        assert foreign_keys == 1

        # Verify tables exist
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()}
        assert "pipeline_version" in tables
        assert "eval_job" in tables
        assert "run" in tables
        assert "grade" in tables
        assert "fault_log" in tables

        conn.close()
