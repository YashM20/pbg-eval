import pytest
from pbg_eval.healing.json_repair import repair_and_parse_json


def test_repair_clean_json():
    data = repair_and_parse_json('{"key": "value", "num": 42}')
    assert data == {"key": "value", "num": 42}


def test_repair_with_think_and_markdown_fences():
    text = """
    <think>
    Thinking through the evaluation...
    Expected 2 deviations.
    </think>
    ```json
    {
      "exclude": false,
      "scores": {
        "deviation_recall": 8,
        "deviation_precision": 9
      }
    }
    ```
    """
    data = repair_and_parse_json(text)
    assert data["exclude"] is False
    assert data["scores"]["deviation_recall"] == 8


def test_repair_with_trailing_commas():
    text = '{"expected_deviations": [{"clauseNo": "1", "severity": "CRITICAL",},],}'
    data = repair_and_parse_json(text)
    assert len(data["expected_deviations"]) == 1
    assert data["expected_deviations"][0]["clauseNo"] == "1"


def test_repair_with_newlines_in_string():
    text = '{\n  "reason": "This is a line\nwith an unescaped newline\ninside a string",\n  "score": 10\n}'
    data = repair_and_parse_json(text)
    assert "unescaped newline" in data["reason"]
    assert data["score"] == 10


def test_repair_empty_fails():
    with pytest.raises(ValueError):
        repair_and_parse_json("")
