"""5-Stage JSON recovery engine for LLM grader outputs."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


def repair_and_parse_json(text: str) -> dict[str, Any] | list[Any]:
    """Parse JSON from an LLM response using a 5-stage progressive repair strategy.

    NOTE: This is strictly applied to LLM Judge (Gemini) outputs to prevent eval crashes,
    NOT to target model outputs (which are strictly evaluated for schema integrity).
    """
    if not text or not text.strip():
        raise ValueError("Empty response text")

    raw = text.strip()

    # Stage 1: Strip thinking tags and markdown code fences
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.DOTALL | re.IGNORECASE).strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, flags=re.DOTALL | re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    # Direct parse attempt
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # Stage 2: Locate outermost JSON structure ({ ... } or [ ... ])
    start_brace = cleaned.find("{")
    end_brace = cleaned.rfind("}")
    start_bracket = cleaned.find("[")
    end_bracket = cleaned.rfind("]")

    candidate = ""
    if start_brace != -1 and end_brace != -1 and end_brace > start_brace:
        candidate = cleaned[start_brace : end_brace + 1]
    elif start_bracket != -1 and end_bracket != -1 and end_bracket > start_bracket:
        candidate = cleaned[start_bracket : end_bracket + 1]

    if candidate:
        try:
            return json.loads(candidate)
        except Exception:
            cleaned = candidate

    # Stage 3: Remove trailing commas before closing braces/brackets
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # Stage 4: Fix unescaped control characters/newlines inside string literals
    # Replace raw literal newlines within quotes
    def _fix_newlines_in_strings(s: str) -> str:
        in_string = False
        chars = []
        i = 0
        while i < len(s):
            c = s[i]
            if c == "\\" and i + 1 < len(s):
                chars.append(c)
                chars.append(s[i + 1])
                i += 2
                continue
            if c == '"':
                in_string = not in_string
            elif in_string and c == "\n":
                chars.append("\\n")
                i += 1
                continue
            elif in_string and c == "\r":
                chars.append("\\r")
                i += 1
                continue
            elif in_string and c == "\t":
                chars.append("\\t")
                i += 1
                continue
            chars.append(c)
            i += 1
        return "".join(chars)

    cleaned = _fix_newlines_in_strings(cleaned)
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # Stage 5: Raw decode fallback to salvage partial/first JSON object
    decoder = json.JSONDecoder()
    idx = 0
    while idx < len(cleaned):
        while idx < len(cleaned) and cleaned[idx].isspace():
            idx += 1
        if idx >= len(cleaned):
            break
        if cleaned[idx] in ("{", "["):
            try:
                parsed, _ = decoder.raw_decode(cleaned[idx:])
                if isinstance(parsed, (dict, list)):
                    return parsed
            except Exception:
                pass
        idx += 1

    logger.error("[JsonRepair] All 5 repair stages failed on text snippet: %s", raw[:300])
    raise ValueError(f"Could not parse valid JSON from LLM output: {raw[:200]}")
