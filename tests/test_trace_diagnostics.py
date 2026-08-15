import json
from pbg_eval.analytics.trace_diagnostics import analyze_thinking_trace


def test_analyze_trace_milestones_and_ratio():
    trace = """
    We will evaluate opening preamble. Then Clause 1, Clause 2, Clause 3, Clause 4 continuing liability.
    Clause 6 jurisdiction looks like Kolkata instead of New Delhi.
    Therefore Clause 6 is a deviation.
    """
    raw_output = json.dumps({
        "deviations": [
            {"clauseNo": "Clause 6", "appearingInBg": "Kolkata", "severity": "CRITICAL"}
        ]
    })

    res = analyze_thinking_trace(trace, raw_output)
    assert res["has_trace"] is True
    assert "Clause 4" in res["milestones_evaluated"]
    assert "Clause 6" in res["milestones_evaluated"]
    assert res["ratio"] > 0.0
    assert len(res["discrepancies"]) == 0


def test_analyze_trace_discrepancy():
    trace = """
    Clause 4 is a deviation because 'not' was dropped from the text.
    """
    raw_output = json.dumps({"deviations": []})  # Omitted from output!

    res = analyze_thinking_trace(trace, raw_output)
    assert len(res["discrepancies"]) >= 1
    assert "Clause 4" in res["discrepancies"][0]
