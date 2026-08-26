"""FastAPI router for Live Interactive Prompt & Clause Playground."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from pbg_eval.analytics.disambiguation import disambiguate_run_deviations
from pbg_eval.clients.gemini import GeminiClient
from pbg_eval.config import get_config
from pbg_eval.healing.json_repair import repair_and_parse_json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/playground", tags=["playground"])


class PlaygroundExecuteRequest(BaseModel):
    master_text: str = Field(..., max_length=50000)
    vendor_text: str = Field(..., max_length=50000)
    prompt_template: str = Field(..., max_length=50000)
    model_name: str = "qwen3.5:9b"
    temperature: float = Field(default=0.1, ge=0.0, le=1.0)
    auto_judge: bool = True


@router.post("/execute")
def execute_playground(body: PlaygroundExecuteRequest):
    """Execute live prompt inference and real-time Gemini LLM judge scoring."""
    config = get_config()
    start_time = time.time()

    # Formulate prompt
    populated_prompt = (
        body.prompt_template.replace("{{MASTER_TEXT}}", body.master_text)
        .replace("{{VENDOR_TEXT}}", body.vendor_text)
        .replace("<master_pbg>\n</master_pbg>", f"<master_pbg>\n{body.master_text}\n</master_pbg>")
        .replace("<vendor_pbg>\n</vendor_pbg>", f"<vendor_pbg>\n{body.vendor_text}\n</vendor_pbg>")
    )

    # 1. Execute Inference via Gemini (for instant playground evaluation) or fallback
    gemini = GeminiClient(config)
    try:
        raw_output = gemini._call_with_fallback(populated_prompt)
        parsed = repair_and_parse_json(raw_output)
    except Exception as exc:
        logger.error("[PlaygroundRouter] Inference failed: %s", exc)
        raise HTTPException(500, f"Inference failed: {exc}")

    latency = round(time.time() - start_time, 2)

    # 2. Live LLM-as-Judge Evaluation (if enabled)
    judge_result = None
    if body.auto_judge:
        try:
            derivation = gemini.derive(body.master_text, body.vendor_text)
            indep_read = json.dumps(derivation, ensure_ascii=False)
            judge_result = gemini.score(
                body.master_text, body.vendor_text, indep_read, json.dumps(parsed)
            )
        except Exception as judge_exc:
            logger.warning("[PlaygroundRouter] Live judge scoring failed: %s", judge_exc)

    # 3. Disambiguation
    target_devs = parsed.get("deviations", []) if isinstance(parsed, dict) else []
    disambiguation = disambiguate_run_deviations(
        body.master_text, body.vendor_text, None, target_devs
    )

    return {
        "latency_seconds": latency,
        "model": body.model_name,
        "raw_output": raw_output,
        "parsed_output": parsed,
        "judge_evaluation": judge_result,
        "disambiguation": disambiguation,
    }
