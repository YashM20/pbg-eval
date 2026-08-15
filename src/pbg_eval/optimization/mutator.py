"""Prompt mutation synthesizer using Gemini LLM."""

from __future__ import annotations

import json
import logging
from typing import Any

from google import genai

from pbg_eval.config import get_config
from pbg_eval.healing.json_repair import repair_and_parse_json

logger = logging.getLogger(__name__)


def mutate_prompt_candidates(
    baseline_prompt: str,
    diagnostic_report: dict[str, Any],
    focus_objective: str = "balanced",
) -> list[dict[str, str]]:
    """Synthesize improved prompt mutation variations using Gemini LLM."""
    config = get_config()
    client = genai.Client(api_key=config.gemini_api_key)

    system_instruction = """You are an elite LLM Prompt Engineer specialized in legal document comparison contracts.
Your task is to take a baseline PBG comparison prompt and a diagnostic evaluation report of its failure modes, then synthesize 3 distinct, improved prompt candidate variations.

Each candidate must adhere to:
1. Candidate A (Precision Focus): Hardens dynamic field exemptions, semantic equivalence, and prevents hallucinated false alarms on addresses and dates.
2. Candidate B (Recall & Negation Focus): Deepens focus on catching subtle dropped words (e.g. 'not' missing from Clause 4) and rights-affecting omissions.
3. Candidate C (Structural Discipline): Optimizes traversal order, concise JSON schema formatting, and eliminates loop/truncation vulnerabilities.

Return JSON with a list of candidate objects:
{
  "candidates": [
    {
      "name": "Candidate A - Precision Focus",
      "strategy": "...",
      "mutated_prompt": "..."
    },
    ...
  ]
}
"""

    user_prompt = f"""## Baseline Prompt:
{baseline_prompt}

## Diagnostic Report of Failure Modes:
{json.dumps(diagnostic_report, indent=2)}

## Focus Objective:
{focus_objective}

Generate 3 mutated prompt variations addressing these specific failure modes. Return JSON only."""

    try:
        response = client.models.generate_content(
            model=config.gemini_model,
            contents=user_prompt,
            config={"system_instruction": system_instruction},
        )
        parsed = repair_and_parse_json(response.text or "")
        if isinstance(parsed, dict) and "candidates" in parsed:
            return parsed["candidates"]
        if isinstance(parsed, list):
            return parsed
        return []
    except Exception as exc:
        logger.error("[PromptMutator] Failed to generate prompt mutations: %s", exc)
        # Return fallback heuristic variations
        return [
            {
                "name": "Candidate A (Precision Refinement)",
                "strategy": "Explicitly emphasizes placeholder fill exemption and address normalization rules.",
                "mutated_prompt": baseline_prompt + "\n\nCRITICAL: Double check that filled placeholders (amounts, dates, branch names) are NEVER reported as deviations.",
            },
            {
                "name": "Candidate B (Recall Hardening)",
                "strategy": "Enforces word-by-word comparison for Clause 4 continuing liability and Clause 6 jurisdiction.",
                "mutated_prompt": baseline_prompt + "\n\nCRITICAL: You must verify that Clause 4 contains 'shall not be anywise affected' without missing 'not'.",
            },
        ]
