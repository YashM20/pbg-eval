import json
from pbg_eval.synthetic.generator import generate_synthetic_suite
from pbg_eval.synthetic.runner import evaluate_synthetic_output


def test_generate_synthetic_suite():
    suite = generate_synthetic_suite()
    assert len(suite) >= 3
    for doc in suite:
        assert doc.doc_id.startswith("syn-")
        assert len(doc.injected_anomalies) >= 1
        assert "PERFORMANCE BANK GUARANTEE" in doc.master_text
        assert len(doc.vendor_text) > 100


def test_evaluate_synthetic_output_perfect_match():
    suite = generate_synthetic_suite()
    doc = suite[0]  # syn-dropped-negation-cl4

    perfect_output = json.dumps({
        "deviations": [
            {
                "clauseNo": "Clause 4",
                "appearingInBg": "shall be anywise affected",
                "shouldBeCorrectedAs": "shall not be anywise affected",
                "severity": "CRITICAL",
            }
        ]
    })

    res = evaluate_synthetic_output(doc, perfect_output)
    assert res["passed"] is True
    assert res["recall"] == 1.0
    assert len(res["missed"]) == 0


def test_evaluate_synthetic_output_missed():
    suite = generate_synthetic_suite()
    doc = suite[0]

    empty_output = json.dumps({"deviations": []})
    res = evaluate_synthetic_output(doc, empty_output)
    assert res["passed"] is False
    assert res["recall"] == 0.0
    assert len(res["missed"]) == 1
