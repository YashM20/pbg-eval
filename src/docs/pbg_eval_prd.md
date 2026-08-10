# PBG Eval — Design Document

## 1. Purpose

Standalone project to track and score PBG comparison output quality across pipeline/prompt versions over time. Built because comparison results vary run-to-run (same doc, different outcome quality) with no way currently to tell if a prompt change made things better, worse, or just moved the noise around.

Not part of `pbg-backend`. No shared DB, no shared deploy. Talks to the same Ollama/Gemini endpoints from the outside, like any other client.

## 2. Scope

- **Comparison stage — primary focus.** This is where variance shows up and where grading effort goes.
- **Extraction stage — light touch only.** Base fields (bank name, amount, validity, BG number) get a cheap presence/plausibility check, not a full rubric. Extraction is stable; it doesn't need the same machinery.
- **No ground truth required.** Grading is done by an LLM judge (Gemini), not by diffing against labeled expected output.

## 3. Grading Approach — LLM-as-Judge

Since there's no ground truth corpus, Gemini acts as an independent grader:

**Input to grader:** master PBG clause text + vendor doc text + Qwen's comparison output (deviations list, severities, reasons) for that run.

**Grader task:** re-derive what deviations *should* look like from the raw master/vendor text (independently, not by trusting Qwen's framing), then score Qwen's actual output against that independent read.

This makes Gemini a second opinion, not a rubber stamp — it's not just asked "does this look right," it's asked to do the comparison itself first, then grade.

**Grader output:** structured JSON — per-parameter scores (1–10), an overall score, and an exclusion flag with reason if applicable.

## 4. Grading Parameters (score 1–10 each)

| Parameter | What it measures |
|---|---|
| **Deviation Recall** | Did it catch the deviations that actually exist in the text (per Gemini's independent read)? |
| **Deviation Precision** | Did it avoid inventing deviations that aren't there (hallucination control)? |
| **Severity Correctness** | Are CRITICAL/MAJOR/MINOR labels appropriate to the actual legal/financial impact? |
| **Reasoning Quality** | Does the `reason` field actually justify the finding, or is it generic/circular? |
| **Schema Integrity** | Valid JSON, no empty `shouldBeCorrectedAs`, no hybrid master/vendor text bleeding into fields |
| **Scope Discipline** | Did it correctly exclude pure metadata (dates, signature blocks) while still evaluating substantive prose in those same regions? |

**Overall score** = weighted average (weights configurable; default: Recall 30%, Precision 25%, Severity 20%, Schema 15%, Reasoning 10%, Scope Discipline handled as a modifier/penalty rather than a straight weight, since scope violations are usually binary and severe).

## 5. Exclusion / Fallback Detection

A run is **excluded from scoring** (not scored as a 1–10, tracked separately) when it's not really a comparison failure but a plumbing/fallback failure:

- Empty or truncated output (hit `max_tokens`, timeout)
- Looping/repetition generation (the repeat_penalty-class failure)
- Malformed JSON that can't be parsed at all
- Model fell back to echoing master or vendor text verbatim instead of comparing
- Any known fallback signature already documented in past learnings

Excluded runs are counted and reported as a **failure rate** per version — this is itself an important signal (a version with 95% average score but 30% exclusion rate is worse than 85% average with 2% exclusion), so it's surfaced next to the score, not hidden inside it.

## 6. Data Model

```
pipeline_version
 ├── id, label (e.g. "v1.3 - single-pass rewrite"), prompt_hash, model_config, created_at, notes
 │
 └── run (many per version)
      ├── id, version_id, doc_id, timestamp, latency_seconds
      ├── raw_qwen_output (full JSON)
      ├── status: scored | excluded
      ├── exclusion_reason (nullable)
      │
      └── grade (one per non-excluded run)
           ├── deviation_recall, deviation_precision, severity_correctness,
           │   reasoning_quality, schema_integrity, scope_discipline
           ├── overall_score
           └── grader_notes (Gemini's independent read, for audit/debugging)
```

SQLite. No dependency on the production Postgres schema — this can run from a laptop against any Ollama/Gemini endpoint pointed at test docs.

## 7. Tabs / Views

**Tab: Deployment / Pipeline Version**
- List of versions (prompt hash, model config, date, short label)
- Per version: run count, exclusion rate, average overall score, score distribution (min/max/median across runs — this is where the "sometimes great, sometimes worse" variance becomes visible)
- **Version ranking**: versions ranked by average overall score among non-excluded runs, with exclusion rate shown alongside as a tiebreaker/red flag, not folded into the number

**Tab: Runs (drill-down under a version)**
- Every run for that version: doc, timestamp, status, overall score, per-parameter breakdown
- **Run ranking within version**: sorted by overall score, so best/worst runs on the *same doc* under the *same version* are directly visible — this is the direct answer to "results vary each time"

## 8. Ranking Logic

- **Run ranking**: simple sort by overall_score desc within a version, excluded runs pinned at the bottom (or a separate section) rather than mixed in
- **Version ranking**: sort by mean overall_score of scored runs desc; exclusion rate and score variance (stdev) displayed as secondary columns so a version can't look good purely by having fewer, cherry-picked runs
- Repeat-run variance for the *same doc* under the *same version* is the key diagnostic number — this is what directly measures the volatility you're seeing, separate from whether the average is good

## 9. Extraction Check (lightweight)

Per doc, per run: does extracted `bank_name`, `amount`, `validity`, `bg_number` exist and look plausible (non-empty, right format/pattern)? Binary pass/fail per field, no LLM grading, no separate ranking tab. Rolled into the run record as a small `extraction_ok: true/false` flag — not a rubric, not a priority.

## 10. Tech Stack

- **uv** for project/dependency management (matches existing project conventions)
- **SQLite** for storage — zero setup, portable, diffable
- **Gemini API** as grader (already have key)
- **CLI-first** (`pbg-eval run`, `pbg-eval grade`, `pbg-eval report`) — a web UI for the tabs above can come later once the data model is proven; the tabs described above map directly to CLI report views to start (markdown/HTML output), not necessarily a live app

## 11. Workflow

1. `pbg-eval run --version v1.3 --docs ./sample_docs/ --repeats 5` → hits Ollama/Qwen comparison endpoint N times per doc, stores raw output
2. `pbg-eval grade --version v1.3` → sends each stored run + master/vendor text to Gemini, stores structured grade, flags exclusions
3. `pbg-eval report --version v1.3` → per-run table, ranked
4. `pbg-eval report --compare v1.2 v1.3` → version-level ranking, exclusion rates, variance side by side

## 12. Open Questions

- Repeat count per doc for variance tracking — default 5, tune once first results come in
- Weighting for overall score — defaults above are a starting point, not fixed
- Whether Gemini grading itself should occasionally be spot-checked by a human, given it's the sole arbiter with no ground truth