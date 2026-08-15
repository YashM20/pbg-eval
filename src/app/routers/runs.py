"""Router for run inspection, traces, and individual regrading."""

from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException

from pbg_eval.config import get_config
from pbg_eval.db import connect
from pbg_eval.models import compute_overall
from pbg_eval.clients.gemini import GeminiClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.get("/{run_id}")
def get_run(run_id: int):
    """Retrieve full run details including thinking trace and grade breakdown."""
    conn = connect(get_config().db_path)
    row = conn.execute(
        """
        SELECT r.*, g.overall_score, g.deviation_recall, g.deviation_precision,
               g.severity_correctness, g.reasoning_quality, g.schema_integrity,
               g.scope_discipline, g.grader_notes, g.independent_read
        FROM run r
        LEFT JOIN grade g ON g.run_id = r.id
        WHERE r.id = ?
        """,
        (run_id,),
    ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(404, f"Run {run_id} not found")
    return dict(row)


@router.post("/{run_id}/regrade")
def regrade_run(run_id: int):
    """Re-grade an individual run with Gemini judge."""
    config = get_config()
    conn = connect(config.db_path)
    row = conn.execute("SELECT * FROM run WHERE id = ?", (run_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, f"Run {run_id} not found")

    master = row["master_text"] or ""
    vendor = row["vendor_text"] or ""
    raw = row["raw_qwen_output"] or ""

    if not master or not raw:
        conn.close()
        raise HTTPException(400, "Run missing master text or raw output")

    gemini = GeminiClient(config)
    try:
        import json
        derivation = gemini.derive(master, vendor)
        independent_read = json.dumps(derivation, ensure_ascii=False)
        result = gemini.score(master, vendor, independent_read, raw)

        if result.get("exclude"):
            reason = result.get("exclusion_reason") or "semantic_exclusion"
            conn.execute("UPDATE run SET status = 'excluded', exclusion_reason = ? WHERE id = ?", (reason, run_id))
            conn.execute("DELETE FROM grade WHERE run_id = ?", (run_id,))
            conn.commit()
            conn.close()
            return {"status": "excluded", "reason": reason}

        scores = result.get("scores") or {}
        scope = float(scores.get("scope_discipline", 10))
        overall = compute_overall(
            {k: float(scores.get(k, 0)) for k in scores},
            config.score_weights,
            scope,
            config.scope_penalty,
        )

        conn.execute(
            """
            INSERT INTO grade (
                run_id, deviation_recall, deviation_precision, severity_correctness,
                reasoning_quality, schema_integrity, scope_discipline, overall_score,
                independent_read, grader_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                deviation_recall = excluded.deviation_recall,
                deviation_precision = excluded.deviation_precision,
                severity_correctness = excluded.severity_correctness,
                reasoning_quality = excluded.reasoning_quality,
                schema_integrity = excluded.schema_integrity,
                scope_discipline = excluded.scope_discipline,
                overall_score = excluded.overall_score,
                independent_read = excluded.independent_read,
                grader_notes = excluded.grader_notes,
                graded_at = datetime('now')
            """,
            (
                run_id,
                scores.get("deviation_recall", 0),
                scores.get("deviation_precision", 0),
                scores.get("severity_correctness", 0),
                scores.get("reasoning_quality", 0),
                scores.get("schema_integrity", 0),
                scores.get("scope_discipline", 0),
                overall,
                independent_read,
                result.get("grader_notes"),
            ),
        )
        conn.execute("UPDATE run SET status = 'scored' WHERE id = ?", (run_id,))
        conn.commit()
        conn.close()
        return {"status": "scored", "overall_score": overall, "scores": scores}
    except Exception as exc:
        conn.close()
        raise HTTPException(500, f"Regrade failed: {exc}")
