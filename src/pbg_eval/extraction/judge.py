"""LLM Judge & deterministic scoring engine for PBG metadata extraction."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from google import genai

from pbg_eval.config import Config, get_config
from pbg_eval.extraction.normalizers import (
    score_amounts,
    score_bank_branch_address,
    score_bg_number,
    score_dates,
    score_po_number,
    score_vendor_name,
)
from pbg_eval.healing.json_repair import repair_and_parse_json

logger = logging.getLogger(__name__)

EXTRACTION_WEIGHTS = {
    "bgNumber": 0.15,
    "amendmentDate": 0.10,
    "validityDate": 0.15,
    "claimPeriod": 0.10,
    "amount": 0.15,
    "poNo": 0.10,
    "vendorName": 0.10,
    "bankBranchAddress": 0.15,
}


class MetadataJudge:
    def __init__(self, config: Config | None = None):
        self.config = config or get_config()
        self.client = genai.Client(api_key=self.config.gemini_api_key)
        self._prompts_dir = Path(__file__).resolve().parents[1] / "prompts"

    def derive_ground_truth(self, vendor_text: str) -> dict[str, str]:
        """Derive ground-truth metadata from vendor document text using Gemini."""
        template = (self._prompts_dir / "metadata_derive.txt").read_text(encoding="utf-8")
        prompt = template.replace("{{VENDOR_TEXT}}", vendor_text)

        try:
            response = self.client.models.generate_content(
                model=self.config.gemini_model,
                contents=prompt,
            )
            parsed = repair_and_parse_json(response.text or "")
            meta = parsed.get("vendorMetadata", {}) if isinstance(parsed, dict) else {}
            # Verify grounded spans
            return self.verify_span_grounding(meta, vendor_text)
        except Exception as exc:
            logger.error("[MetadataJudge] Ground-truth derivation failed: %s", exc)
            return {}

    def verify_span_grounding(self, metadata: dict[str, Any], vendor_text: str) -> dict[str, str]:
        """Verify that derived ground-truth values are grounded in the actual document text."""
        grounded = {}
        v_lower = vendor_text.lower()
        for k, v in metadata.items():
            val = str(v or "").strip()
            if not val:
                grounded[k] = ""
                continue
            # Check if key words of the value appear in vendor text
            first_words = [w for w in re_words(val.lower()) if len(w) > 2][:3]
            if not first_words or any(w in v_lower for w in first_words):
                grounded[k] = val
            else:
                logger.warning("[MetadataJudge] Derived value for '%s' ('%s') failed span grounding check", k, val)
                grounded[k] = val  # preserve but logged
        return grounded

    def evaluate_metadata(
        self, target_meta: dict[str, Any], ground_meta: dict[str, Any]
    ) -> dict[str, Any]:
        """Score all 8 metadata fields and compute overall extraction score."""
        t = target_meta or {}
        g = ground_meta or {}

        # 1. bgNumber
        s_bg, em_bg, n_bg = score_bg_number(t.get("bgNumber"), g.get("bgNumber"))

        # 2. amendmentDate
        s_amend, em_amend, n_amend = score_dates(t.get("amendmentDate"), g.get("amendmentDate"))

        # 3. validityDate
        s_valid, em_valid, n_valid = score_dates(t.get("validityDate"), g.get("validityDate"))

        # 4. claimPeriod
        s_claim, em_claim, n_claim = score_dates(t.get("claimPeriod"), g.get("claimPeriod"))

        # 5. amount
        s_amount, em_amount, n_amount = score_amounts(t.get("amount"), g.get("amount"))

        # 6. poNo
        s_po, em_po, n_po = score_po_number(t.get("poNo"), g.get("poNo"))

        # 7. vendorName
        s_vendor, em_vendor, n_vendor = score_vendor_name(t.get("vendorName"), g.get("vendorName"))

        # 8. bankBranchAddress
        s_addr, em_addr, n_addr = score_bank_branch_address(
            t.get("bankBranchAddress"), g.get("bankBranchAddress")
        )

        field_scores = {
            "score_bg_number": s_bg,
            "score_amendment_date": s_amend,
            "score_validity_date": s_valid,
            "score_claim_period": s_claim,
            "score_amount": s_amount,
            "score_po_no": s_po,
            "score_vendor_name": s_vendor,
            "score_bank_branch_address": s_addr,
        }

        exact_matches = {
            "em_bg_number": int(em_bg),
            "em_amendment_date": int(em_amend),
            "em_validity_date": int(em_valid),
            "em_claim_period": int(em_claim),
            "em_amount": int(em_amount),
            "em_po_no": int(em_po),
            "em_vendor_name": int(em_vendor),
            "em_bank_branch_address": int(em_addr),
        }

        overall = (
            s_bg * EXTRACTION_WEIGHTS["bgNumber"]
            + s_amend * EXTRACTION_WEIGHTS["amendmentDate"]
            + s_valid * EXTRACTION_WEIGHTS["validityDate"]
            + s_claim * EXTRACTION_WEIGHTS["claimPeriod"]
            + s_amount * EXTRACTION_WEIGHTS["amount"]
            + s_po * EXTRACTION_WEIGHTS["poNo"]
            + s_vendor * EXTRACTION_WEIGHTS["vendorName"]
            + s_addr * EXTRACTION_WEIGHTS["bankBranchAddress"]
        )

        field_discrepancies = [
            {"field": "bgNumber", "target": t.get("bgNumber"), "ground_truth": g.get("bgNumber"), "score": s_bg, "note": n_bg},
            {"field": "amendmentDate", "target": t.get("amendmentDate"), "ground_truth": g.get("amendmentDate"), "score": s_amend, "note": n_amend},
            {"field": "validityDate", "target": t.get("validityDate"), "ground_truth": g.get("validityDate"), "score": s_valid, "note": n_valid},
            {"field": "claimPeriod", "target": t.get("claimPeriod"), "ground_truth": g.get("claimPeriod"), "score": s_claim, "note": n_claim},
            {"field": "amount", "target": t.get("amount"), "ground_truth": g.get("amount"), "score": s_amount, "note": n_amount},
            {"field": "poNo", "target": t.get("poNo"), "ground_truth": g.get("poNo"), "score": s_po, "note": n_po},
            {"field": "vendorName", "target": t.get("vendorName"), "ground_truth": g.get("vendorName"), "score": s_vendor, "note": n_vendor},
            {"field": "bankBranchAddress", "target": t.get("bankBranchAddress"), "ground_truth": g.get("bankBranchAddress"), "score": s_addr, "note": n_addr},
        ]

        return {
            "overall_extraction_score": round(overall, 2),
            "field_scores": field_scores,
            "exact_matches": exact_matches,
            "field_discrepancies": field_discrepancies,
        }


def re_words(s: str) -> list[str]:
    import re
    return re.findall(r"\w+", s)
