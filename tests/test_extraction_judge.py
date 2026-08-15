from pbg_eval.extraction.judge import MetadataJudge


def test_evaluate_metadata_perfect_match():
    judge = MetadataJudge()

    meta = {
        "bgNumber": "0504726IBGP0012",
        "amendmentDate": "15-JAN-2026",
        "validityDate": "31-DEC-2028",
        "claimPeriod": "31-MAR-2029",
        "amount": "Rs. 50,00,000/- (Fifty Lakhs Only)",
        "poNo": "PO/2026/8821",
        "vendorName": "Sterling Auxiliaries Pvt Ltd",
        "bankBranchAddress": "HDFC Bank Ltd\nConnaught Place\nNew Delhi 110001",
    }

    res = judge.evaluate_metadata(meta, meta)
    assert res["overall_extraction_score"] >= 9.5
    assert len(res["field_discrepancies"]) == 8
    assert res["exact_matches"]["em_bg_number"] == 1
    assert res["exact_matches"]["em_validity_date"] == 1
    assert res["exact_matches"]["em_vendor_name"] == 1


def test_evaluate_metadata_partial_mismatch():
    judge = MetadataJudge()

    target = {
        "bgNumber": "0504726IBGP0012",
        "amendmentDate": "15-JAN-2026",
        "validityDate": "31-DEC-2028",
        "claimPeriod": "31-MAR-2029",
        "amount": "100000",  # Mismatch
        "poNo": "PO/2026/8821",
        "vendorName": "Sterling Auxiliaries Pvt Ltd",
        "bankBranchAddress": "HDFC Bank Ltd\nNew Delhi\nhereinafter called the Bank",  # Bleed
    }

    ground = {
        "bgNumber": "0504726IBGP0012",
        "amendmentDate": "15-JAN-2026",
        "validityDate": "31-DEC-2028",
        "claimPeriod": "31-MAR-2029",
        "amount": "5000000",
        "poNo": "PO/2026/8821",
        "vendorName": "Sterling Auxiliaries Pvt Ltd",
        "bankBranchAddress": "HDFC Bank Ltd\nConnaught Place\nNew Delhi 110001",
    }

    res = judge.evaluate_metadata(target, ground)
    assert res["field_scores"]["score_amount"] == 0.0
    assert res["field_scores"]["score_bg_number"] == 10.0
    assert res["overall_extraction_score"] < 9.0
