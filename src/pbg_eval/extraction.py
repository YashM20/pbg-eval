import re
from typing import Any


FIELDS = ("bank_name", "amount", "validity", "bg_number")
_FIELD_MAP = {
    "bank_name": ("vendorName", "bankBranchAddress", "bank_name"),
    "amount": ("amount",),
    "validity": ("validityDate", "validity"),
    "bg_number": ("bgNumber", "bg_number"),
}


def check_extraction(vendor_metadata: dict[str, Any] | None) -> tuple[bool, dict[str, bool]]:
    """Binary pass/fail per extraction field."""
    meta = vendor_metadata or {}
    results: dict[str, bool] = {}
    for field, keys in _FIELD_MAP.items():
        val = next((meta.get(k) for k in keys if meta.get(k) is not None), None)
        results[field] = _plausible(field, val)
    return all(results.values()), results


def _plausible(field: str, val: Any) -> bool:
    if val is None:
        return False
    text = str(val).strip()
    if not text:
        return False
    if field == "amount":
        return bool(re.search(r"\d", text))
    if field == "validity":
        return bool(re.search(r"\d{4}|\d{2}[/-]\d{2}", text))
    if field == "bg_number":
        return len(text) >= 3
    return len(text) >= 2
