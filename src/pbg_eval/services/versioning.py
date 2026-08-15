"""Automatic version label generator and benchmark document discovery service."""

from __future__ import annotations

import re
import sqlite3
import time
from pathlib import Path
from typing import Any

from pbg_eval.config import get_config
from pbg_eval.db import connect


def get_next_version_label() -> str:
    """Compute the next sequential version label based on existing database records."""
    conn = connect(get_config().db_path)
    rows = conn.execute("SELECT label FROM pipeline_version").fetchall()
    conn.close()

    if not rows:
        return "v1.0"

    labels = set(r["label"] for r in rows)
    max_major = 1
    max_minor = -1

    for label in labels:
        match = re.match(r"^v?(\d+)\.(\d+)$", label.strip(), flags=re.IGNORECASE)
        if match:
            major, minor = int(match.group(1)), int(match.group(2))
            if major > max_major:
                max_major = major
                max_minor = minor
            elif major == max_major:
                if minor > max_minor:
                    max_minor = minor

    if max_minor >= 0:
        candidate = f"v{max_major}.{max_minor + 1}"
        while candidate in labels:
            max_minor += 1
            candidate = f"v{max_major}.{max_minor + 1}"
        return candidate

    # Fallback to collision-resistant timestamped label
    base = f"eval-{time.strftime('%Y%m%d-%H%M')}"
    if base not in labels:
        return base
    return f"eval-{time.strftime('%Y%m%d-%H%M%S')}"


def discover_benchmark_documents() -> list[dict[str, Any]]:
    """Auto-discover benchmark test documents in sample_docs, data/uploads, and project root."""
    discovered: list[dict[str, Any]] = []
    seen_stems = set()

    search_dirs = [
        Path("sample_docs"),
        Path("fixtures/example"),
        Path("data/uploads"),
        Path("."),
        Path(".."),
    ]

    for d in search_dirs:
        if not d.exists() or not d.is_dir():
            continue
        # Scan for PDFs (shallow for root/sample_docs, recursive for data/uploads)
        pattern = "**/*.pdf" if "uploads" in str(d).lower() else "*.pdf"
        for p in sorted(d.glob(pattern)):
            name = p.name
            stem = p.stem
            # Ignore master format templates or docs folder
            if "format" in stem.lower() or "analysis" in stem.lower() or "tasks" in stem.lower() or "template" in stem.lower():
                continue
            if stem not in seen_stems:
                seen_stems.add(stem)
                discovered.append({
                    "filename": name,
                    "doc_id": stem,
                    "path": str(p.resolve()),
                    "size_bytes": p.stat().st_size,
                    "location": str(d),
                })

    return discovered
