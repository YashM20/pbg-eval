ifeq ($(OS),Windows_NT)
    PYTHON = .venv/Scripts/python
    export PYTHONPATH = src
else
    PYTHON = .venv/bin/python
    export PYTHONPATH = src
endif

dev:
	uv run --env-file .env uvicorn app.main:app --reload --host 0.0.0.0 --port 8003

run:
	uv run --env-file .env uvicorn app.main:app --host 0.0.0.0 --port 8003

ui:
	cd frontend && pnpm dev

build-ui:
	cd frontend && pnpm build

test:
	uv run pytest tests/ -v
