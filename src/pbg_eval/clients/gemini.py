import json
import logging
import re
from pathlib import Path

from google import genai

from pbg_eval.config import Config

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

    def derive(self, master_text: str, vendor_text: str) -> dict:
        logger.info("[GeminiClient] Deriving expected deviations (Call 1) using model %s...", self.config.gemini_model)
        template = self._load_prompt("grader_derive.txt")
        prompt = (
            template.replace("{{RULES}}", self._load_rules())
            .replace("{{MASTER_TEXT}}", master_text)
            .replace("{{VENDOR_TEXT}}", vendor_text)
        )
        raw = self._call(prompt)
        parsed = self._parse_json(raw)
        expected_count = len(parsed.get("expected_deviations", []))
        logger.info("[GeminiClient] Call 1 complete: derived %d expected deviations", expected_count)
        return parsed

    def score(self, master_text: str, vendor_text: str, independent_read: str, qwen_output: str) -> dict:
        logger.info("[GeminiClient] Scoring Qwen comparison output (Call 2) using model %s...", self.config.gemini_model)
        template = self._load_prompt("grader_score.txt")
        prompt = (
            template.replace("{{RULES}}", self._load_rules())
            .replace("{{MASTER_TEXT}}", master_text)
            .replace("{{VENDOR_TEXT}}", vendor_text)
            .replace("{{INDEPENDENT_READ}}", independent_read)
            .replace("{{QWEN_OUTPUT}}", qwen_output)
        )
        raw = self._call(prompt)
        parsed = self._parse_json(raw)
        is_excluded = parsed.get("exclude", False)
        logger.info("[GeminiClient] Call 2 complete: exclude=%s, scores=%s", is_excluded, parsed.get("scores"))
        return parsed

    def _call(self, prompt: str) -> str:
        try:
            response = self.client.models.generate_content(
                model=self.config.gemini_model,
                contents=prompt,
            )
            return response.text or ""
        except Exception as exc:
            logger.error("[GeminiClient] API call failed on model %s: %s", self.config.gemini_model, exc)
            raise

    def _parse_json(self, text: str) -> dict:
        cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()
        fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
        if fence:
            cleaned = fence.group(1).strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.error("[GeminiClient] Failed to parse JSON response from Gemini: %s. Response excerpt: %s", exc, cleaned[:200])
            raise

