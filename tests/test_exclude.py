from pbg_eval.exclude import check_output


def test_exclude_empty():
    assert check_output("", "master", "vendor") == "empty"
    assert check_output("   ", "master", "vendor") == "empty"


def test_exclude_invalid_json():
    assert check_output('{"key": value_without_quotes}', "master", "vendor") == "invalid_json"


def test_exclude_truncated():
    assert check_output('{"deviations": [{"clauseNo": "1"', "master", "vendor") == "truncated"


def test_exclude_looping():
    looping_text = "\n".join(["clause 1 is here", "clause 1 is here", "clause 1 is here", "clause 1 is here", "done."])
    assert check_output(looping_text, "master", "vendor") == "loop"


def test_exclude_verbatim_echo():
    long_vendor = "In consideration of the Indian Oil Corporation Ltd having awarded to M/s Vendor ... " * 5
    echo_json = f'{{"vendorMetadata": {{"vendorName": "{long_vendor}"}}}}'
    assert check_output(echo_json, "master", long_vendor) == "verbatim_echo"


def test_valid_output_not_excluded():
    valid = '{"deviations": [{"clauseNo": "6", "appearingInBg": "Mumbai", "shouldBeCorrectedAs": "New Delhi", "severity": "CRITICAL"}]}'
    assert check_output(valid, "master text", "vendor text") is None
