from pbg_eval.analytics.disambiguation import AttributionTag, disambiguate_run_deviations


def test_disambiguate_real_deviation():
    master = "4. The Guarantee shall not be anywise affected by change in constitution."
    vendor = "4. The Guarantee shall be anywise affected by change in constitution."
    ocr_lines = [{"text": "4. The Guarantee shall be anywise affected", "confidence": 0.96}]
    deviations = [{"clauseNo": "4", "appearingInBg": "shall be anywise affected", "shouldBeCorrectedAs": "shall not be anywise affected"}]

    res = disambiguate_run_deviations(master, vendor, ocr_lines, deviations)
    assert res["total_deviations"] == 1
    assert res["real_deviations_count"] == 1
    assert res["attributed_deviations"][0]["attribution"] == AttributionTag.REAL_DEVIATION.value


def test_disambiguate_ocr_artifact():
    master = "6. Exclusive jurisdiction of Courts at New Delhi."
    vendor = "6. Exclusive jurisdiction of Courts at New Delhi."
    # Low confidence OCR line
    ocr_lines = [{"text": "6. Exclusive jurisdiction of Courts at New Delhi", "confidence": 0.55}]
    deviations = [{"clauseNo": "6", "appearingInBg": "Courts at New De|hi", "shouldBeCorrectedAs": "Courts at New Delhi"}]

    res = disambiguate_run_deviations(master, vendor, ocr_lines, deviations)
    assert res["ocr_artifacts_count"] == 1
    assert res["attributed_deviations"][0]["attribution"] == AttributionTag.OCR_ARTIFACT.value


def test_disambiguate_llm_hallucination():
    master = "1. Undertake to pay on first demand without protest."
    vendor = "1. Undertake to pay on first demand without protest."
    ocr_lines = [{"text": "1. Undertake to pay on first demand without protest.", "confidence": 0.98}]
    # LLM flagged identical text
    deviations = [{"clauseNo": "1", "appearingInBg": "without protest", "shouldBeCorrectedAs": "without protest"}]

    res = disambiguate_run_deviations(master, vendor, ocr_lines, deviations)
    assert res["llm_hallucinations_count"] == 1
    assert res["attributed_deviations"][0]["attribution"] == AttributionTag.LLM_HALLUCINATION.value
