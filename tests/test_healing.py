import tempfile
from pathlib import Path
from pbg_eval.db import connect
from pbg_eval.healing.detector import FaultType, classify_exception
from pbg_eval.healing.healer import log_fault_event


def test_classify_exception():
    f_type, _ = classify_exception(Exception("401 Unauthorized token expired"))
    assert f_type == FaultType.AUTH_FAILURE

    f_type, _ = classify_exception(Exception("429 ResourceExhausted quota exceeded"))
    assert f_type == FaultType.GRADER_RATE_LIMIT

    f_type, _ = classify_exception(Exception("Timed out polling doc 12345"))
    assert f_type == FaultType.POLL_TIMEOUT


def test_log_fault_event():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        conn = connect(db_path)
        try:
            event_id = log_fault_event(
                conn=conn,
                fault_type=FaultType.AUTH_FAILURE,
                error_message="Access token expired",
                remedy_applied="refreshed_auth_token",
                success=True,
            )
            assert event_id is not None

            row = conn.execute("SELECT * FROM fault_log WHERE id = ?", (event_id,)).fetchone()
            assert row["fault_type"] == "auth_failure"
            assert row["success"] == 1
        finally:
            conn.close()
