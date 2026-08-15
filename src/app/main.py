"""FastAPI application — REST API for PBG Evaluation & Auto-Healing."""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

_src = Path(__file__).resolve().parents[1]
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auto, batches, faults, grade, report, runs, versions
from pbg_eval.config import get_config
from pbg_eval.db import connect
from pbg_eval.services.auto_eval import AutoEvalDaemon


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Initialize database
    conn = connect(get_config().db_path)
    conn.close()
    yield
    # Stop background daemon on shutdown if running
    AutoEvalDaemon.get_instance().stop()


app = FastAPI(
    title="PBG Eval",
    description="Autonomous evaluation platform for PBG semantic comparison with auto fault detection and healing.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(batches.router)
app.include_router(runs.router)
app.include_router(grade.router)
app.include_router(versions.router)
app.include_router(report.router)
app.include_router(faults.router)
app.include_router(auto.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "pbg-eval", "version": "0.2.0"}
