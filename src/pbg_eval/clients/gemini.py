"""Gemini LLM Judge client with rate-limit backoff and model fallback."""

from __future__ import annotations

import logging
import random
import time
from pathlib import Path
from typing import Any

from google import genai

from pbg_eval.config import Config
from pbg_eval.healing.json_repair import repair_and_parse_json

logger = logging.getLogger(__name__)


class GeminiClient:
    def __init__(self, config: Config):
        self.config = config
        self.client = genai.Client(api_key=config.gemini_api_key)
        self._prompts_dir = Path(__file__).parent.parent / "prompts"

    def _load_prompt(self, name: str) -> str:
        return (self._prompts_dir / name).read_text(encoding="utf-8")

    def _load_rules(self) -> str:
        return self._load_prompt("pbg_rules.txt")

    def derive(self, master_text: str, vendor_text: str) -> dict[str, Any]:
        logger.info("[GeminiClient] Deriving expected deviations (Call 1)...")
        template = self._load_prompt("grader_derive.txt")
        prompt = (
            template.replace("{{RULES}}", self._load_rules())
            .replace("{{MASTER_TEXT}}", master_text)
            .replace("{{VENDOR_TEXT}}", vendor_text)
        )
        raw = self._call_with_fallback(prompt)
        parsed = repair_and_parse_json(raw)
        if not isinstance(parsed, dict):
            raise ValueError("Expected JSON object from Gemini derive call")
        expected_count = len(parsed.get("expected_deviations", []))
        logger.info("[GeminiClient] Call 1 complete: derived %d expected deviations", expected_count)
        return parsed

    def score(
        self, master_text: str, vendor_text: str, independent_read: str, qwen_output: str
    ) -> dict[str, Any]:
        logger.info("[GeminiClient] Scoring target comparison output (Call 2)...")
        template = self._load_prompt("grader_score.txt")
        prompt = (
            template.replace("{{RULES}}", self._load_rules())
            .replace("{{MASTER_TEXT}}", master_text)
            .replace("{{VENDOR_TEXT}}", vendor_text)
            .replace("{{INDEPENDENT_READ}}", independent_read)
            .replace("{{QWEN_OUTPUT}}", qwen_output)
        )
        raw = self._call_with_fallback(prompt)
        parsed = repair_and_parse_json(raw)
        if not isinstance(parsed, dict):
            raise ValueError("Expected JSON object from Gemini score call")
        is_excluded = parsed.get("exclude", False)
        logger.info("[GeminiClient] Call 2 complete: exclude=%s, scores=%s", is_excluded, parsed.get("scores"))
        return parsed

    def _call_with_fallback(self, prompt: str) -> str:
        """Execute Gemini API call with exponential backoff on 429 and fallback to secondary model."""
        models_to_try = [self.config.gemini_model]
        if self.config.gemini_fallback_model and self.config.gemini_fallback_model != self.config.gemini_model:
            models_to_try.append(self.config.gemini_fallback_model)

        last_exc: Exception | None = None
        for model in models_to_try:
            for attempt in range(1, 4):
                try:
                    logger.debug("[GeminiClient] Calling model %s (attempt %d)...", model, attempt)
                    response = self.client.models.generate_content(
                        model=model,
                        contents=prompt,
                    )
                    return response.text or ""
                except Exception as exc:
                    last_exc = exc
                    err_str = str(exc).lower()
                    is_rate_limit = "429" in err_str or "quota" in err_str or "resource_exhausted" in err_str
                    if is_rate_limit and attempt < 3:
                        delay = (2 ** attempt) + random.uniform(0.5, 2.0)
                        logger.warning(
                            "[GeminiClient] Rate limit hit on %s. Backing off for %.2fs...",
                            model, delay
                        )
                        time.sleep(delay)
                    elif not is_rate_limit and attempt < 2:
                        time.sleep(2.0)
                    else:
                        break

            logger.warning("[GeminiClient] Model %s failed. Trying fallback if available...", model)

        if last_exc:
            logger.error("[GeminiClient] All model attempts failed: %s", last_exc)
            raise last_exc
        raise RuntimeError("Failed to generate content from Gemini")
