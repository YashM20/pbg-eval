"""OCR vs. LLM Root-Cause Disambiguation & Attribution Engine."""

from __future__ import annotations

import json
import logging
import re
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class AttributionTag(str, Enum):
    REAL_DEVIATION = "REAL_DEVIATION"
    OCR_ARTIFACT = "OCR_ARTIFACT"
    LLM_HALLUCINATION = "LLM_HALLUCINATION"


def disambiguate_run_deviations(
    master_text: str | None,
    vendor_text: str | None,
    raw_ocr_data: list[dict[str, Any]] | str | None,
    target_deviations: list[dict[str, Any]],
) -> dict[str, Any]:
    """Attribute each deviation to True Vendor Deviation, OCR Artifact, or LLM Hallucination."""
    m_text = (master_text or "").lower()
    v_text = (vendor_text or "").lower()

    # Parse raw_ocr_data if passed as JSON string
    ocr_lines: list[dict[str, Any]] = []
    if isinstance(raw_ocr_data, str) and raw_ocr_data.strip():
        try:
            parsed = json.loads(raw_ocr_data)
            if isinstance(parsed, list):
                ocr_lines = parsed
            elif isinstance(parsed, dict) and "results" in parsed:
                ocr_lines = parsed["results"]
        except Exception:
            pass
    elif isinstance(raw_ocr_data, list):
        ocr_lines = raw_ocr_data

    # Calculate overall OCR confidence
    confidences = []
    for item in ocr_lines:
        if isinstance(item, dict):
            c = item.get("confidence") or item.get("score")
            if isinstance(c, (int, float)):
                confidences.append(float(c))
            elif isinstance(item.get("text"), str):
                confidences.append(0.95)

    overall_ocr_conf = round(sum(confidences) / len(confidences), 2) if confidences else 0.95

    attributed_deviations = []
    real_count = 0
    ocr_count = 0
    hallucination_count = 0

    for dev in target_deviations:
        appearing = str(dev.get("appearingInBg") or "").strip()
        should_be = str(dev.get("shouldBeCorrectedAs") or "").strip()
        clause_no = str(dev.get("clauseNo") or "").strip()

        app_lower = appearing.lower()
        should_lower = should_be.lower()

        # Check line OCR confidence for the appearing snippet
        matching_conf = overall_ocr_conf
        if appearing and appearing != "Missing":
            for item in ocr_lines:
                if isinstance(item, dict):
                    line_text = str(item.get("text") or "").lower()
                    if app_lower in line_text or line_text in app_lower:
                        matching_conf = float(item.get("confidence") or item.get("score") or matching_conf)
                        break

        # Attribution Logic:
        # 1. OCR Artifact: Low OCR confidence or OCR digit/character substitution
        if matching_conf < 0.70 or (appearing and bool(re.search(r"[\$#%]{2,}|[|]{2,}", appearing))):
            tag = AttributionTag.OCR_ARTIFACT
            reason = f"Low OCR extraction confidence ({matching_conf:.2f}) or character distortion in document bounding box."
            ocr_count += 1
        # 2. LLM Hallucination: The appearing snippet already matches master text, but LLM flagged it
        elif app_lower and should_lower and app_lower == should_lower:
            tag = AttributionTag.LLM_HALLUCINATION
            reason = "Model flagged text that is already identical to the approved master format."
            hallucination_count += 1
        # 3. LLM Hallucination: Snippet does not appear anywhere in vendor text at all
        elif appearing and appearing != "Missing" and app_lower not in v_text and len(app_lower) > 15:
            tag = AttributionTag.LLM_HALLUCINATION
            reason = "Model hallucinated a snippet not found in the vendor document."
            hallucination_count += 1
        # 4. Real Vendor Deviation
        else:
            tag = AttributionTag.REAL_DEVIATION
            reason = "Verified discrepancy between master requirements and vendor document text."
            real_count += 1

        attributed_deviations.append({
            "deviation": dev,
            "clause_no": clause_no,
            "attribution": tag.value,
            "attribution_reason": reason,
            "ocr_confidence": matching_conf,
        })

    return {
        "overall_ocr_confidence": overall_ocr_conf,
        "total_deviations": len(target_deviations),
        "real_deviations_count": real_count,
        "ocr_artifacts_count": ocr_count,
        "llm_hallucinations_count": hallucination_count,
        "attributed_deviations": attributed_deviations,
    }
