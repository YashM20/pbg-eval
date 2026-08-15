# PBG Eval

Autonomous evaluation and self-healing platform for IOCL's PBG semantic comparison engine. Operates as a standalone system with a FastAPI backend and a modern React/Vite web interface.

## Architecture

- **Web Dashboard** (`frontend/`) — Vite + React 19 web interface for version leaderboards, batch management, run inspection with LLM thinking traces, grader audit notes, side-by-side version comparison, and real-time auto-healing telemetry.
- **REST API** (`src/app/`) — FastAPI server managing evaluation jobs, grading, reporting, and autonomous background evaluation sweeps.
- **Auto-Healing Engine** (`src/pbg_eval/healing/`) — Detects and resolves backend queue stalls, token expirations, transient network drops, and grader rate limits.
- **LLM Judge** (`src/pbg_eval/clients/gemini.py`) — Two-call independent evaluation using Gemini (independent ground-truth derivation $\rightarrow$ deviation scoring).
- **Storage** (`src/pbg_eval/db.py`) — SQLite with WAL mode, foreign keys, and telemetry logging.

## Quick Start

### 1. Backend Setup
```bash
cp .env.sample .env
# Configure backend URL, credentials, and GEMINI_API_KEY
uv sync
make dev
```
FastAPI runs on `http://localhost:8003` (docs at `http://localhost:8003/docs`).

### 2. Frontend Dashboard Setup
```bash
make ui
```
Vite dashboard runs on `http://localhost:5173`.

## Core Capabilities

1. **Multi-PDF Evaluation:** Upload PDFs directly or point to server fixture directories.
2. **Autonomous Background Daemon:** Schedules periodic evaluation sweeps and tracks performance drift over time.
3. **Proactive Self-Healing:**
   - Auto-recovers from expired JWT sessions using token rotation and credential re-authentication.
   - Cleanses stuck backend GPU tasks before re-queuing.
   - Handles Gemini 429 rate limits via exponential backoff and model fallback.
4. **LLM Thinking Trace & Grader Audit:** Inspect full chain-of-thought traces and Gemini independent derivations per run.
