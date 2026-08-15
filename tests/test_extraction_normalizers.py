from pbg_eval.extraction.normalizers import (
    parse_date_to_iso,
    parse_numeric_amount,
    score_amounts,
    score_bank_branch_address,
    score_bg_number,
    score_dates,
    score_po_number,
    score_vendor_name,
)


def test_parse_date_to_iso():
    assert parse_date_to_iso("15-JAN-2026") == "2026-01-15"
    assert parse_date_to_iso("31/12/2028") == "2028-12-31"
    assert parse_date_to_iso("15.01.2026") == "2026-01-15"
    assert parse_date_to_iso("2026-01-15") == "2026-01-15"
    assert parse_date_to_iso("15th January 2026") == "2026-01-15"
    assert parse_date_to_iso("May 13, 2026") == "2026-05-13"
    assert parse_date_to_iso("31-DEC-2029") == "2029-12-31"


def test_parse_numeric_amount_immunity_to_rs_dot():
    assert parse_numeric_amount("Rs. 50,00,000/-") == 5000000.0
    assert parse_numeric_amount("INR 1,25,00,000.00") == 12500000.0
    assert parse_numeric_amount("U.S. $ 75,000.00") == 75000.0
    assert parse_numeric_amount("5000000") == 5000000.0


def test_score_dates():
    score, em, note = score_dates("15-JAN-2026", "15/01/2026")
    assert score == 10.0
    assert em is True

    score_m, em_m, _ = score_dates("May 13, 2026", "13-MAY-2026")
    assert score_m == 10.0
    assert em_m is True

    score_diff, em_diff, _ = score_dates("15-JAN-2026", "20-FEB-2026")
    assert score_diff == 0.0
    assert em_diff is False


def test_score_amounts():
    score, em, _ = score_amounts("Rs. 50,00,000/- (Rupees Fifty Lakhs Only)", "Rs. 50,00,000")
    assert score == 10.0
    assert em is True

    score_mismatch, _, _ = score_amounts("100000", "5000000")
    assert score_mismatch == 0.0


def test_score_po_number():
    score, em, _ = score_po_number("[12038273]", "PO No. 12038273")
    assert score == 10.0
    assert em is True


def test_score_vendor_name():
    score, em, _ = score_vendor_name("$M/S$. Sterling Auxiliaries Pvt Ltd", "Sterling Auxiliaries Private Limited")
    assert score == 10.0
    assert em is True


def test_score_bank_branch_address_stop_marker_penalty():
    clean_addr = "HDFC Bank Ltd\nTrade Finance Operations\nConnaught Place\nNew Delhi 110001"
    score_clean, em_clean, _ = score_bank_branch_address(clean_addr, clean_addr)
    assert score_clean >= 9.0

    bleed_addr = "HDFC Bank Ltd\nConnaught Place\nNew Delhi 110001\nhereinafter called the Bank with the intent to bind"
    score_bleed, em_bleed, note = score_bank_branch_address(bleed_addr, clean_addr)
    assert "Legal Bleed" in note
    assert score_bleed <= 5.0
