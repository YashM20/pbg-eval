import json
import re
from typing import Any


def check_output(raw: str, master_text: str | None, vendor_text: str | None) -> str | None:
    """Return exclusion reason or None if output looks like a real attempt."""
    if not raw or not raw.strip():
        return "empty"

    text = raw.strip()

    if _is_truncated(text):
        return "truncated"

    if _is_looping(text):
        return "loop"

    try:
        parsed = _parse_json(text)
    except (json.JSONDecodeError, ValueError):
        return "invalid_json"

    if _is_verbatim_echo(parsed, master_text, vendor_text):
        return "verbatim_echo"

    return None


def _parse_json(text: str) -> Any:
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    cleaned = cleaned.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fence:
        cleaned = fence.group(1).strip()
    return json.loads(cleaned)


def _is_truncated(text: str) -> bool:
    if not text.endswith(("}", "]", '"')):
        return True
    try:
        _parse_json(text)
        return False
    except (json.JSONDecodeError, ValueError):
        return True


def _is_looping(text: str) -> bool:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if len(lines) < 6:
        return False
    seen: dict[str, int] = {}
    for ln in lines:
        seen[ln] = seen.get(ln, 0) + 1
        if seen[ln] >= 4:
            return True
    return False


def _is_verbatim_echo(parsed: Any, master_text: str | None, vendor_text: str | None) -> bool:
    if not isinstance(parsed, dict):
        return False
    raw_str = json.dumps(parsed)
    for src in (master_text, vendor_text):
        if src and len(src) > 200 and src[:500] in raw_str:
            return True
    return False
