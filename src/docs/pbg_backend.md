# PBG (Performance/Bank Guarantee) System — Architecture

## Origin

The project began with a narrow goal: compare vendor-submitted Bank Guarantee (BG) documents against IOCL's Master PBG format and flag legal wording deviations. Early exploration prompted Gemini Vision directly with both PDFs, which worked on clean documents but broke down on scanned/noisy inputs, produced hallucinated deviations, gave no explainable reasoning, and was expensive to run at volume. That experience led to a core architectural split: **extraction and comparison are different problems.** Extraction is a mechanical OCR/layout task. Comparison — deciding whether "shall indemnify" vs. "may indemnify" is a legally meaningful deviation — is a semantic reasoning task. The system is built around that split.

## Pipeline

```
Document Upload
      │
      ▼
Extraction — PaddleOCR + PaddleVL
      │
      ▼
Comparison / Deviation Detection — Qwen3.5 9B (Q4), served via Ollama
      │
      ▼
Structured JSON output (type, severity, reason, confidenceScore)
```

**Extraction** is stable and considered solved. PaddleOCR + PaddleVL produces structured fields directly — bank name, amount, validity, beneficiary, and so on — rather than raw text, while free-form legal clauses are preserved separately for the comparison stage to reason over.

**Comparison** is where the engineering effort concentrates. Qwen3.5 9B (Q4 quantized) runs behind an OpenAI-compatible endpoint via Ollama, called asynchronously through `httpx.AsyncClient`. Deviation judgment is entirely prompt-driven — there's no separate rule engine or deterministic decision logic sitting alongside the model. The system prompt itself carries the rules: no redundant rule repetition, no self-contradictory severity criteria, forced single-pass document traversal, paired positive/negative examples (rather than concrete word pairs the model would just memorize), explicit handling for OCR noise and page-break splits, and a firm distinction between pure document metadata (excluded from comparison) and substantive prose that imposes obligations (always evaluated regardless of position in the document).

Each deviation is classified by type (MISSING / MISMATCH / EXTRA) and severity (CRITICAL / MAJOR / MINOR), and carries a `reason` field (a plain-language legal-consequence explanation) and a calibrated `confidenceScore` (0.0–1.0), both aimed at keeping results auditable rather than opaque.

**90%+ average accuracy across all 6 test documents**, with several individual cases outperforming the Gemini benchmark this was originally built against. This is a fully self-hosted 9B model — no API cost, no external dependency — matching or beating a much larger hosted model on a legal-reasoning task. That gap closed almost entirely through prompt engineering, not model or infra changes.


## Problems Solved, In Order

**1. Generation instability.** Forcing `enable_thinking: true` on a model build that had dropped the expected soft-switch tokens broke generation outright — fixed by aligning the flag with what the actual model variant supports.

**2. Infinite thinking loops.** The model would occasionally loop inside its own reasoning trace, never converging. Fixed by adding `repeat_penalty` — but only after discovering it has to live inside Ollama's `options` object, not as a top-level parameter, or it's silently ignored. Paired with an explicit `max_tokens` ceiling so a stuck generation fails fast instead of running away.

**3. Semantic equivalence.** The hardest recurring failure mode: the model would flag filled placeholders (a real bank name, a real date, a real amount) as deviations, because surface text differs from Master even when legal meaning doesn't. The fix was building out an explicit semantic-equivalence layer in the prompt — naming the dynamic fields that should never trigger a flag, and giving paired positive/negative examples rather than fixed word pairs, so the model generalizes the *pattern* of "meaning preserved" instead of memorizing specific phrasings it then fails to recognize in slightly different wording.

**4. Redundant re-verification per clause.** The original prompt re-stated and re-checked every rule (severity logic, dynamic-field exclusions, extraction format) at each clause independently, which meant 8 clauses meant paying that overhead 8 times — both in prompt length and in how much the model re-derived the same logic in its thinking trace. 
Restructured the entire prompt around a single-pass traversal: rules are stated once, clause order is walked exactly once end to end, and the model is explicitly instructed not to revisit a clause once it has moved past it. This cut both thinking time and thinking-token count noticeably, on top of the accuracy gain from removing repeated, sometimes subtly-inconsistent rule restatements.

**5. OCR noise vs. real content.** Scanned vendor PDFs interleave page markers, stray digits, and repeated signatory blocks directly inside clause text, sometimes splitting a single legal sentence across a noise block. Solved by giving the model explicit instructions to bridge over noise and read a split sentence once, rather than repeatedly re-scanning for where it "really" continues — which was itself a source of the infinite-loop problem

**6. Stamp paper and cover sheet clutter.** Non-legal metadata, stamps, and letterheads at the beginning of PDFs caused false mismatch flags. Resolved via pre-processing normalization that locates the legal start marker (e.g., `"In consideration"`) and trims all preceding content.

## Stack

*   **Backend:** FastAPI (module-based, `uv`-managed) running asynchronous route handlers. Database access uses raw SQL via `asyncpg` connection pool (no ORM) against PostgreSQL + `JSONB` for flexible OCR extraction/comparison storage. Valkey acts as the caching layer.
*   **Background Jobs:** Coordinated using a lightweight custom polling system using `FOR UPDATE SKIP LOCKED` on a shared `jobs` table to coordinate per-stage worker processes (no Celery/RabbitMQ). Async service uses `aioboto3` for S3, while synchronous background workers use standard `boto3`.
*   **Auth & Security:** JWT auth (24h access tokens, refresh rotation, bcrypt password hashing).
*   **Self-Hosted Inference:** Ollama running `Qwen3.5 9B` (Q4 quantized) for semantic comparison via an OpenAI-compatible API called via `httpx.AsyncClient`. Document text and layout extraction are handled locally using `PaddleOCR` and `PaddleVL`. No external API calls are made, guaranteeing data privacy.
*   **Infrastructure & Deployment:** Currently deployed bare-metal on AWS EC2 (Ubuntu). Multi-stage Dockerization is in progress to support offline/air-gapped deployment at IOCL sites.

## Interface

*   **Technology:** Next.js 14 (App Router), Tailwind CSS, and `shadcn/ui`.
*   **Integration:** Communicates with the FastAPI backend using secure server-side API routing via a backend proxy (`backend-proxy.ts`), keeping the backend endpoint hidden from the browser.
*   **State & Storage:** LocalStorage and Session Storage handle light state and configuration (like the admin-configured Master format), keeping the frontend database-free.
*   **Key Features:** Upload portal for Master/Vendor PBG documents, real-time AI-powered deviation visualization, editable amendment letter generation, and export to HTML/DOC.

## Backend Features

**Auth** — login, token refresh, logout, user registration. JWT-gated across all routes except `/health`.

**Documents** — presigned S3 upload URL → client uploads directly → confirm endpoint records the document and queues it. Status polling endpoint tracks extraction/comparison progress. Comparison result endpoint returns the full structured deviation list once the pipeline completes. Soft delete.

**Master Formats** — admin uploads a new Master PBG via presigned S3 URL → confirms upload → backend stores it and marks it as active. Only one active master at a time; all vendor comparisons run against it.

**Extraction** — dedicated endpoint triggers PaddleOCR/PaddleVL on a document, returns structured field output (bank name, amount, validity, beneficiary, etc.) plus raw clause text. Worker-process based; the route enqueues, the worker polls.

**Comparison** — run against the active master format. Returns deviation list (`MISSING / MISMATCH / EXTRA`, severity `CRITICAL / MAJOR / MINOR`, `reason`, `confidenceScore`). Also listable/retrievable by ID.

**Jobs** — retry endpoint for failed/stuck jobs.

**Users** — CRUD for user accounts, status toggle (activate/deactivate), admin password reset.

**Audit Logs** — paginated log of all system actions for compliance traceability.

## Frontend Flow

```
Login
  │
  ▼
Dashboard — comparison history, status of in-flight jobs
  │
  ├── Upload Vendor PBG
  │     ├── Presigned URL → direct S3 upload
  │     ├── Poll /status until extraction + comparison complete
  │     └── Navigate to results
  │
  ├── Results Page
  │     ├── Deviation list with type, severity, reason, confidence
  │     ├── Editable amendment letter (auto-populated with extracted metadata)
  │     └── Export letter as HTML / DOC
  │
  └── Admin
        ├── Upload / replace Master PBG format
        ├── User management (create, edit, toggle status, reset password)
        └── Audit log viewer
```

Auth state (JWT tokens) is managed client-side via `auth-storage.ts` with silent refresh handled by `use-auto-refresh.ts`. All backend calls go through `backend-proxy.ts` (server-side Next.js route handler) — the backend URL is never exposed to the browser.
