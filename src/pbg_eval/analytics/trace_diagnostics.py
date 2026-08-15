"""Deep analysis of LLM thinking chains, reasoning loops, and token efficiency."""

from __future__ import annotations

import json
import re
from typing import Any


def analyze_thinking_trace(trace_text: str | None, raw_output: str | None) -> dict[str, Any]:
    """Analyze model reasoning steps, efficiency, repetition, and decision alignment."""
    trace = (trace_text or "").strip()
    raw = (raw_output or "").strip()

    if not trace and not raw:
        return {
            "has_trace": False,
            "thinking_chars": 0,
            "content_chars": 0,
            "ratio": 0.0,
            "steps": [],
            "repetition_score": 0.0,
            "discrepancies": [],
        }

    # If trace was embedded in <think> tags in raw output
    if not trace and "<think>" in raw:
        think_match = re.search(r"<think>([\s\S]*?)</think>", raw, flags=re.IGNORECASE)
        if think_match:
            trace = think_match.group(1).strip()

    # Content without think tags
    content_clean = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE).strip()

    thinking_chars = len(trace)
    content_chars = len(content_clean)
    total_chars = thinking_chars + content_chars

    ratio = round(thinking_chars / total_chars, 2) if total_chars > 0 else 0.0

    # Extract traversal milestones
    milestones = []
    milestone_patterns = [
        ("Opening Preamble", r"in consideration|preamble|opening"),
        ("Clause 1", r"clause\s*1\b"),
        ("Clause 2", r"clause\s*2\b"),
        ("Clause 3", r"clause\s*3\b"),
        ("Clause 4", r"clause\s*4\b|anywise|continuing guarantee"),
        ("Clause 5", r"clause\s*5\b|liability|validity|claim period"),
        ("Clause 6", r"clause\s*6\b|jurisdiction|delhi"),
        ("Clause 7", r"clause\s*7\b|invocation"),
        ("Clause 8", r"clause\s*8\b|sign|authoris"),
    ]

    for name, pattern in milestone_patterns:
        if re.search(pattern, trace, re.IGNORECASE):
            milestones.append(name)

    # Detect reasoning loops
    sentences = [s.strip() for s in re.split(r"[.\n]+", trace) if len(s.strip()) > 20]
    seen_sentences: dict[str, int] = {}
    loop_sentences = []
    for s in sentences:
        norm = s.lower()[:80]
        seen_sentences[norm] = seen_sentences.get(norm, 0) + 1
        if seen_sentences[norm] >= 2 and norm not in [x[:80] for x in loop_sentences]:
            loop_sentences.append(s)

    repetition_score = round(len(loop_sentences) / max(len(sentences), 1), 2)

    # Check for discrepancies between reasoning thoughts and final JSON
    discrepancies = []
    try:
        parsed_json = json.loads(content_clean)
        reported_clauses = [
            str(d.get("clauseNo", "")).lower() for d in parsed_json.get("deviations", [])
        ]
    except Exception:
        reported_clauses = []

    # Check if a clause was found deviating in reasoning but dropped in JSON
    for c_num in range(1, 9):
        c_str = f"clause {c_num}"
        if re.search(rf"\b{c_str}\b.*?(is a deviation|mismatch|missing)", trace, re.IGNORECASE):
            if not any(c_str in rc or str(c_num) in rc for rc in reported_clauses):
                discrepancies.append(
                    f"Reasoning noted a discrepancy in Clause {c_num}, but it was omitted in final JSON."
                )

    return {
        "has_trace": bool(trace),
        "thinking_chars": thinking_chars,
        "content_chars": content_chars,
        "thinking_tokens_est": round(thinking_chars / 4),
        "content_tokens_est": round(content_chars / 4),
        "ratio": ratio,
        "milestones_evaluated": milestones,
        "repetition_score": repetition_score,
        "repeated_phrases": loop_sentences[:3],
        "discrepancies": discrepancies,
    }
