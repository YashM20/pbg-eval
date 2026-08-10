# AGENTS.md — pbg-eval frontend

## What this is

Internal Vite/React UI for the pbg-eval FastAPI app. Surfaces version ranking, run drill-down, compare views, and batch/grade triggers. Does not talk to pbg-backend or Gemini directly.

## Terminology

- **Batch** — background eval job (`eval_job`): many docs × repeats. API `/api/batches`.
- **Run** — single comparison attempt (`run` row). API `/api/versions/{label}/runs`.

Do not use "run" in UI copy for starting a batch.

## Boundaries

- **Data source:** local FastAPI only (`VITE_API_URL`; dev proxy to `:8003`). Display and trigger only — no duplicated grading or ranking logic.
- **Visual rules:** [DESIGN.md](./DESIGN.md) only. Tokens live in `src/styles/tokens.css`.
- **API shapes:** `../src/app/schemas.py` or FastAPI `/docs` — do not copy field lists here.
- **Ranking:** Never show mean score without exclusion rate and stdev.
- **Grader audit:** Runs page must expose `grader_notes` and `independent_read` (expandable rows). Numbers alone are not diagnostic.

## Conventions

- `pnpm` for scripts. React 19 + TypeScript + react-router-dom + recharts.
- Fonts: Inter (sans) + JetBrains Mono (code) per DESIGN.md.
- Timeline pastels: batch progress UI only — not nav, buttons, or status badges.
- Client-side sort; no pagination (fine for hundreds of runs, not thousands).

## allow_prod (batch form)

When unchecked, API refuses if `PBG_BACKEND_URL` looks non-staging (contains prod/production/live). Checked (or server `PBG_ALLOW_PROD`) bypasses that guard. Does not filter document IDs.

## Do not

- Add auth, shadcn/MUI, or global state libraries for v1.
- Re-implement exclusion, weighting, or ranking in the client.

## Keeping this accurate

Update when boundaries or terminology change — not when adding files or components.
