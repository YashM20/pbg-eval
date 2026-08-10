# AGENTS.md — pbg-eval

## What this project is

Standalone eval harness for the PBG comparison pipeline. Scores Qwen comparison output using Gemini as an LLM judge, tracked across pipeline/prompt versions. No ground truth corpus — Gemini independently re-derives deviations from master/vendor text, then grades Qwen's output against its own read.

Not part of `pbg-backend`. No shared DB, no shared deploy. Talks to Ollama/Gemini endpoints as an external client only.

## Scope boundaries

- **Comparison stage is the focus.** Full rubric grading, exclusion tracking, run/version ranking.
- **Extraction is a pass/fail presence check only** (bank name, amount, validity, BG number non-empty and plausible). No rubric, no LLM grading, no ranking tab for it. Do not expand this without an explicit decision to do so — it's intentionally minimal.
- **No deterministic rule engine.** Grading logic lives in the Gemini grader prompt, not in Python conditionals. If you're tempted to hardcode a scoring rule in code, put it in the prompt instead.

## Data model

Three tables: `pipeline_version` → `run` → `grade`. A run can be `scored` or `excluded`; excluded runs never get a `grade` row. Check the migration/schema file for current fields — don't duplicate the schema here, it will drift.

## Conventions

- SQLite only. No ORM.
- **API-first (FastAPI)** — REST endpoints at `/api/*`; Vite UI is external/later.
- `uv` for dependencies. `pyproject.toml` is the source of truth for what's installed — don't hand-list dependencies here.
- Every run is tagged with a prompt hash + model config so version comparisons are meaningful. Never score a run without knowing which version it belongs to.

## Grading rules that must not be violated

- Grader must independently derive expected deviations before scoring Qwen's output — never just ask "does this look plausible."
- Fallback/malformed output (truncation, looping, unparseable JSON, verbatim echo of master/vendor text) is **excluded**, not scored low. Don't conflate "bad quality" with "not a real attempt."
- Version ranking must show exclusion rate and score variance alongside the average — never rank on mean score alone.

## UI
- [frontend/DESIGN.md](frontend/DESIGN.md)

## Keeping this file accurate

This file describes principles and boundaries, not current file names, line counts, or exact schemas — those live in the code and will drift if copied here. When scope boundaries or grading rules change, update this file in the same commit. If a section here starts describing something the code no longer does, delete the section rather than leaving it stale.