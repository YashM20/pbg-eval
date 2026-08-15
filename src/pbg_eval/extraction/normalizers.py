"""Field normalizers, semantic matchers, and scoring algorithms for PBG metadata."""

from __future__ import annotations

import datetime
import re
from typing import Any

STOP_MARKERS = [
    r"\bhereinafter\b",
    r"\bguarantor\b",
    r"\bunless\s+repugnant\b",
    r"\bwith\s+the\s+intent\s+to\s+bind\b",
    r"\bhereby\s+undertake\b",
    r"\bpay\s+the\s+corporation\b",
    r"\bon\s+first\s+demand\b",
    r"\bwithout\s+protest\b",
    r"\bthis\s+guarantee/undertaking\b",
    r"\bnotwithstanding\s+anything\b",
    r"\bemp\s+code\b",
    r"\bbranch\s+code\b",
    r"\bsign\s+code\b",
]

MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def parse_date_to_iso(date_str: str | None) -> str | None:
    """Parse arbitrary date string into ISO YYYY-MM-DD format."""
    if not date_str:
        return None

    raw = str(date_str).strip()
    if not raw:
        return None

    # Remove ordinal suffixes (1st, 2nd, 3rd, 15th)
    cleaned = re.sub(r"(\d+)(st|nd|rd|th)\b", r"\1", raw, flags=re.IGNORECASE)
    cleaned = re.sub(r"[,\.]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    # Try ISO YYYY-MM-DD (or YYYY/MM/DD or YYYY.MM.DD)
    iso_match = re.search(r"\b(\d{4})[-/\s\.]+(\d{1,2})[-/\s\.]+(\d{1,2})\b", cleaned)
    if iso_match:
        try:
            y, m, d = int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3))
            return datetime.date(y, m, d).isoformat()
        except ValueError:
            pass

    # Try DD-MMM-YYYY or DD/MMM/YYYY or DD MMM YYYY (e.g. 15-JAN-2026, 31 Dec 2029)
    alpha_match = re.search(r"\b(\d{1,2})[-/\s\.]+(\a-zA-Z]{3,10})[-/\s\.]+(\d{2,4})\b", cleaned)
    if not alpha_match:
        alpha_match = re.search(r"\b(\d{1,2})[-/\s\.]+([a-zA-Z]{3,10})[-/\s\.]+(\d{2,4})\b", cleaned)
    if alpha_match:
        d_str, m_str, y_str = alpha_match.group(1), alpha_match.group(2).lower(), alpha_match.group(3)
        m_num = MONTH_MAP.get(m_str)
        if m_num:
            try:
                d = int(d_str)
                y = int(y_str)
                if y < 100:
                    y += 2000
                return datetime.date(y, m_num, d).isoformat()
            except ValueError:
                pass

    # Try MMM-DD-YYYY or MMM DD YYYY (e.g. May 13 2026, January 15 2026)
    month_first_match = re.search(r"\b([a-zA-Z]{3,10})[-/\s\.]+(\d{1,2})[-/\s\.]+(\d{2,4})\b", cleaned)
    if month_first_match:
        m_str, d_str, y_str = month_first_match.group(1).lower(), month_first_match.group(2), month_first_match.group(3)
        m_num = MONTH_MAP.get(m_str)
        if m_num:
            try:
                d = int(d_str)
                y = int(y_str)
                if y < 100:
                    y += 2000
                return datetime.date(y, m_num, d).isoformat()
            except ValueError:
                pass

    # Try DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    num_match = re.search(r"\b(\d{1,2})[-/\s\.]+(\d{1,2})[-/\s\.]+(\d{2,4})\b", cleaned)
    if num_match:
        try:
            d = int(num_match.group(1))
            m = int(num_match.group(2))
            y = int(num_match.group(3))
            if y < 100:
                y += 2000
            return datetime.date(y, m, d).isoformat()
        except ValueError:
            pass

    return None


def score_dates(target_val: str | None, ground_val: str | None) -> tuple[float, bool, str]:
    """Score date field by semantic calendar equality."""
    t_iso = parse_date_to_iso(target_val)
    g_iso = parse_date_to_iso(ground_val)

    if not t_iso and not g_iso:
        return 10.0, True, "Both Empty / Not Present"
    if not t_iso or not g_iso:
        return 0.0, False, "Missing or Unparseable Date"

    if t_iso == g_iso:
        return 10.0, True, f"Exact Date Match ({t_iso})"

    t_y, t_m, t_d = [int(x) for x in t_iso.split("-")]
    g_y, g_m, g_d = [int(x) for x in g_iso.split("-")]

    if t_y == g_y and t_m == g_m:
        if abs(t_d - g_d) <= 1:
            return 7.0, False, f"Near Date Match ({t_iso} vs {g_iso})"
        return 5.0, False, f"Month/Year Match ({t_iso} vs {g_iso})"

    return 0.0, False, f"Date Mismatch ({t_iso} vs {g_iso})"


def parse_numeric_amount(amount_str: str | None) -> float | None:
    """Extract numeric amount from string, immune to currency period artifacts (e.g. 'Rs.')."""
    if not amount_str:
        return None
    raw = str(amount_str).strip()
    if not raw:
        return None

    # Isolate the currency digit sequence (handles 50,00,000 or 12500000.50 or 5000000)
    match = re.search(r"(?:rs\.?|inr|usd|\$)?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)", raw, flags=re.IGNORECASE)
    if match:
        digit_str = match.group(1).replace(",", "")
        try:
            val = float(digit_str)
            return val if val > 0 else None
        except ValueError:
            pass

    # Fallback to general digit regex
    cleaned = re.sub(r"[^\d\.]", "", raw.replace(",", ""))
    # Strip any leading dots caused by 'Rs.'
    cleaned = cleaned.lstrip(".")
    try:
        val = float(cleaned)
        return val if val > 0 else None
    except ValueError:
        return None


def score_amounts(target_val: str | None, ground_val: str | None) -> tuple[float, bool, str]:
    """Score guarantee limit amount."""
    t_num = parse_numeric_amount(target_val)
    g_num = parse_numeric_amount(ground_val)

    if t_num is None and g_num is None:
        return 10.0, True, "Both Empty"
    if t_num is None or g_num is None:
        return 0.0, False, "Amount Not Found / Unparseable"

    if t_num == g_num:
        # Check if words representation is also present in target
        t_str = str(target_val or "").lower()
        if any(w in t_str for w in ["rupee", "lakh", "crore", "thousand", "only"]):
            return 10.0, True, f"Exact Amount with Words (Rs. {t_num:,.2f})"
        return 8.5, True, f"Exact Numeric Amount Match (Rs. {t_num:,.2f})"

    # Check for factor-of-100 decimal error (paisa / cents)
    if abs(t_num - g_num * 100) < 0.01 or abs(t_num * 100 - g_num) < 0.01:
        return 4.0, False, "Decimal / Cents Scaling Error"

    return 0.0, False, f"Amount Mismatch ({t_num} vs {g_num})"


def normalize_identifier(val: str | None) -> str:
    """Normalize PO number or BG number."""
    if not val:
        return ""
    # Strip brackets, common labels, whitespace
    cleaned = re.sub(r"\[|\]", "", str(val))
    cleaned = re.sub(r"\b(?:bg|no|ref|loa|po|contract|number)\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[^\w]", "", cleaned).upper()
    return cleaned


def score_bg_number(target_val: str | None, ground_val: str | None) -> tuple[float, bool, str]:
    """Score BG number with Levenshtein tolerance."""
    t_norm = normalize_identifier(target_val)
    g_norm = normalize_identifier(ground_val)

    if not t_norm and not g_norm:
        return 10.0, True, "Both Empty"
    if not t_norm or not g_norm:
        return 0.0, False, "BG Number Missing"

    if t_norm == g_norm:
        return 10.0, True, f"Exact BG Number Match ({t_norm})"

    # Character similarity
    overlap = len(set(t_norm) & set(g_norm))
    if t_norm in g_norm or g_norm in t_norm:
        return 7.5, False, f"Partial BG Number Match ({t_norm} in {g_norm})"

    return 0.0, False, f"BG Number Mismatch ({t_norm} vs {g_norm})"


def score_po_number(target_val: str | None, ground_val: str | None) -> tuple[float, bool, str]:
    """Score PO number."""
    t_norm = normalize_identifier(target_val)
    g_norm = normalize_identifier(ground_val)

    if not t_norm and not g_norm:
        return 10.0, True, "Both Empty"
    if not t_norm or not g_norm:
        return 0.0, False, "PO Number Missing"

    if t_norm == g_norm:
        return 10.0, True, f"Exact PO Match ({t_norm})"
    if t_norm in g_norm or g_norm in t_norm:
        return 6.0, False, f"Partial PO Match ({t_norm} vs {g_norm})"

    return 0.0, False, f"PO Mismatch ({t_norm} vs {g_norm})"


def normalize_entity_name(name: str | None) -> str:
    """Normalize vendor or contractor name."""
    if not name:
        return ""
    cleaned = re.sub(r"\$|M/s\.?|M/S\.?", "", str(name), flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(pvt|private|ltd|limited|llp|inc|corp|co)\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[^\w\s]", "", cleaned)
    return " ".join(cleaned.lower().split())


def score_vendor_name(target_val: str | None, ground_val: str | None) -> tuple[float, bool, str]:
    """Score vendor entity name."""
    t_norm = normalize_entity_name(target_val)
    g_norm = normalize_entity_name(ground_val)

    if not t_norm and not g_norm:
        return 10.0, True, "Both Empty"
    if not t_norm or not g_norm:
        return 0.0, False, "Vendor Name Missing"

    if t_norm == g_norm:
        return 10.0, True, f"Exact Vendor Match ({t_norm})"

    t_tokens = set(t_norm.split())
    g_tokens = set(g_norm.split())

    if not t_tokens or not g_tokens:
        return 0.0, False, "Vendor Mismatch"

    jaccard = len(t_tokens & g_tokens) / len(t_tokens | g_tokens)
    if jaccard >= 0.75:
        return 8.5, False, f"High Token Overlap (Jaccard {jaccard:.2f})"
    if jaccard >= 0.4:
        return 5.0, False, f"Partial Token Overlap (Jaccard {jaccard:.2f})"

    # Disallow IOCL or Bank names as vendor
    if "indian oil" in t_norm or "bank" in t_norm:
        return 0.0, False, "Disallowed Entity as Vendor (Bank or IOCL)"

    return 0.0, False, f"Vendor Mismatch ({t_norm} vs {g_norm})"


def score_bank_branch_address(target_val: str | None, ground_val: str | None) -> tuple[float, bool, str]:
    """Score bank name and branch address block with stop-marker penalty."""
    t_raw = str(target_val or "").strip()
    g_raw = str(ground_val or "").strip()

    if not t_raw and not g_raw:
        return 10.0, True, "Both Empty"
    if not t_raw or not g_raw:
        return 0.0, False, "Bank Address Missing"

    # 1. Check for Stop-Marker Legal Bleed
    has_bleed = False
    for marker in STOP_MARKERS:
        if re.search(marker, t_raw, re.IGNORECASE):
            has_bleed = True
            break

    # 2. Bank Name Component (35%)
    t_first_line = t_raw.splitlines()[0] if "\n" in t_raw else t_raw
    g_first_line = g_raw.splitlines()[0] if "\n" in g_raw else g_raw

    bank_name_score = 0.0
    for bank in ["hdfc", "icici", "sbi", "state bank", "axis", "kotak", "indusind", "canara", "punjab national"]:
        if bank in t_first_line.lower() and bank in g_first_line.lower():
            bank_name_score = 3.5
            break
    if bank_name_score == 0.0:
        if normalize_entity_name(t_first_line) == normalize_entity_name(g_first_line):
            bank_name_score = 3.5
        elif set(normalize_entity_name(t_first_line).split()) & set(normalize_entity_name(g_first_line).split()):
            bank_name_score = 2.0

    # 3. PIN Code & City Component (35%)
    city_pin_score = 0.0
    t_pin = re.search(r"\b\d{6}\b", t_raw)
    g_pin = re.search(r"\b\d{6}\b", g_raw)
    if t_pin and g_pin and t_pin.group(0) == g_pin.group(0):
        city_pin_score += 2.0
    elif not g_pin:
        city_pin_score += 1.0

    # City overlap
    for city in ["delhi", "mumbai", "pune", "kolkata", "chennai", "ahmedabad", "bengaluru", "hyderabad", "vashi", "chakan", "mahad", "vadodara"]:
        if city in t_raw.lower() and city in g_raw.lower():
            city_pin_score += 1.5
            break

    # 4. Street / Building Token Overlap (30%)
    t_words = set(re.findall(r"\w{3,}", t_raw.lower()))
    g_words = set(re.findall(r"\w{3,}", g_raw.lower()))
    overlap = len(t_words & g_words) / max(len(g_words), 1)
    street_score = min(3.0, round(overlap * 3.0, 1))

    total_score = round(bank_name_score + city_pin_score + street_score, 1)

    # Apply penalty for legal bleed
    if has_bleed:
        total_score = max(0.0, total_score - 5.0)
        return total_score, False, "Legal Bleed / Stop-Marker Violation (-5.0 penalty)"

    is_em = total_score >= 9.0
    return total_score, is_em, f"Address Score: {total_score}/10"
