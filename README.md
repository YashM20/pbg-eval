# PBG Eval

Standalone eval harness for the PBG comparison pipeline. Runs comparisons via **pbg-backend staging**, grades Qwen output with a two-call Gemini judge, and tracks results across pipeline versions in SQLite.

## Requirements

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) for dependencies
- pbg-backend **staging** instance (writes to prod tables — do not use production)
- Gemini API key

## Setup

```bash
cp .env.sample .env
# Edit .env with staging backend URL, credentials, and GEMINI_API_KEY
uv sync
```

## Run the API

```bash
make dev
# or: uv run fastapi dev src/app/main.py --port 8003
```

API docs: http://localhost:8003/docs

## Runtime cost

Comparisons are serialized (~5+ min each via backend workers). Default **5 repeats × 10 docs ≈ 4+ hours** per version before grading. Poll `GET /api/batches/{batch_id}` for progress.

## Workflow

1. **Batch** — `POST /api/batches` with `{ "version": "v1.0", "docs_dir": "fixtures/example", "repeats": 5 }`
2. **Grade** — `POST /api/grade` with `{ "version": "v1.0" }` after runs complete
3. **Report** — `GET /api/versions`, drill-down via `GET /api/versions/{label}/runs`, compare via `GET /api/report/compare?v1=...&v2=...`

## Fixture format

One JSON file per doc in `docs_dir`:

```json
{
  "doc_id": "local-label",
  "backend_doc_id": "uuid-of-existing-staging-document",
  "master_text": "optional snapshot for grading",
  "vendor_text": "optional snapshot for grading"
}
```

Documents must already exist on staging with at least one completed comparison (for the initial `comparison` job id used by retries).

After each retry, results are fetched via `GET /comparison` (latest by `created_at`) — not `GET /documents/{id}/comparison`, which can return a stale row on pbg-backend.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| POST | `/api/batches` | Start eval batch (background) |
| GET | `/api/batches/{batch_id}` | Batch progress |
| POST | `/api/grade` | Grade pending runs for a version |
| GET | `/api/versions` | Version list + stats |
| GET | `/api/versions/{label}/runs` | Run drill-down + variance per doc |
| GET | `/api/report/compare?v1=&v2=` | Side-by-side version ranking |

## Prod guard

Non-staging backend URLs are refused unless `PBG_ALLOW_PROD=true` in env or `allow_prod: true` in the run request body.

## Architecture

- **Core library** (`src/pbg_eval/`) — run, grade, report logic; no FastAPI imports
- **API layer** (`src/app/`) — thin REST routes
- **Grading** — two-call Gemini: derive deviations from master/vendor only, then score Qwen output
- **Storage** — raw SQLite, no ORM

See [AGENTS.md](AGENTS.md) for scope boundaries and grading rules.
