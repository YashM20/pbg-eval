"""Two-call LLM judge grading service with derivation caching and score weighting."""

from __future__ import annotations

import json
import logging
import sqlite3
from typing import Any

from pbg_eval.clients.gemini import GeminiClient
from pbg_eval.config import Config, get_config
from pbg_eval.db import connect
from pbg_eval.models import compute_overall

logger = logging.getLogger(__name__)


def grade_version(version_label: str, config: Config | None = None) -> dict[str, Any]:
    config = config or get_config()
    conn = connect(config.db_path)
    version = conn.execute("SELECT id FROM pipeline_version WHERE label = ?", (version_label,)).fetchone()
    if not version:
        conn.close()
        logger.error("[GradeService] Version not found: '%s'", version_label)
        raise ValueError(f"Version not found: {version_label}")

    version_id = version[0]
    pending = conn.execute(
        "SELECT * FROM run WHERE version_id = ? AND status = 'pending'",
        (version_id,),
    ).fetchall()

    logger.info("[GradeService] Starting grading for version '%s' (%d runs pending)...", version_label, len(pending))

    gemini = GeminiClient(config)
    graded = 0
    excluded = 0
    errors: list[str] = []

    # Cache derivations across multiple repeats of the exact same document
    derivation_cache: dict[str, str] = {}

    for idx, row in enumerate(pending, 1):
        run_id = row["id"]
        doc_id = row["doc_id"]
        master = row["master_text"] or ""
        vendor = row["vendor_text"] or ""
        raw = row["raw_qwen_output"] or ""

        logger.info("[GradeService] Grading run %d/%d (run_id: %d, doc_id: %s)...", idx, len(pending), run_id, doc_id)

        if not master:
            logger.warning("[GradeService] Run id=%d (doc_id=%s) missing master_text — excluding", run_id, doc_id)
            conn.execute(
                "UPDATE run SET status = 'excluded', exclusion_reason = ? WHERE id = ?",
                ("missing_master_text", run_id),
            )
            excluded += 1
            continue

        try:
            cache_key = f"{doc_id}:{hash(master)}:{hash(vendor)}"
            if cache_key in derivation_cache:
                independent_read = derivation_cache[cache_key]
            else:
                derivation = gemini.derive(master, vendor)
                independent_read = json.dumps(derivation, ensure_ascii=False)
                derivation_cache[cache_key] = independent_read

            result = gemini.score(master, vendor, independent_read, raw)

            if result.get("exclude"):
                reason = result.get("exclusion_reason") or "semantic_exclusion"
                logger.warning("[GradeService] Run id=%d excluded by Gemini judge: %s", run_id, reason)
                conn.execute(
                    "UPDATE run SET status = 'excluded', exclusion_reason = ? WHERE id = ?",
                    (reason, run_id),
                )
                excluded += 1
                continue

            scores = result.get("scores") or {}
            scope = float(scores.get("scope_discipline", 10))
            overall = compute_overall(
                {k: float(scores.get(k, 0)) for k in scores},
                config.score_weights,
                scope,
                config.scope_penalty,
            )
            def _to_float(v: Any, default: float = 0.0) -> float:
                try:
                    return float(v) if v is not None else default
                except (ValueError, TypeError):
                    return default

            conn.execute(
                """
                INSERT INTO grade (
                    run_id, deviation_recall, deviation_precision, severity_correctness,
                    reasoning_quality, schema_integrity, scope_discipline, overall_score,
                    independent_read, grader_notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    _to_float(scores.get("deviation_recall")),
                    _to_float(scores.get("deviation_precision")),
                    _to_float(scores.get("severity_correctness")),
                    _to_float(scores.get("reasoning_quality")),
                    _to_float(scores.get("schema_integrity")),
                    _to_float(scores.get("scope_discipline"), 10.0),
                    overall,
                    independent_read,
                    result.get("grader_notes"),
                ),
            )
            conn.execute("UPDATE run SET status = 'scored' WHERE id = ?", (run_id,))
            graded += 1
            logger.info("[GradeService] Run id=%d scored successfully: %.2f", run_id, overall)
        except Exception as exc:
            err_msg = f"run {run_id}: {exc}"
            logger.error("[GradeService] Error grading run id=%d: %s", run_id, exc)
            errors.append(err_msg)

    conn.commit()
    conn.close()
    logger.info("[GradeService] Grading complete for '%s': %d scored, %d excluded, %d errors", version_label, graded, excluded, len(errors))
    return {"version": version_label, "graded": graded, "excluded": excluded, "errors": errors}
