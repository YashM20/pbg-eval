"""FastAPI application — Streamlined REST API for PBG Evaluation & Auto-Healing."""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

_src = Path(__file__).resolve().parents[1]
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import automation, evaluations, studio, synthetic
from pbg_eval.config import get_config
from pbg_eval.db import connect
from pbg_eval.services.auto_eval import AutoEvalDaemon


@asynccontextmanager
async def lifespan(_app: FastAPI):
    conn = connect(get_config().db_path)
    conn.close()
    yield
    AutoEvalDaemon.get_instance().stop()


app = FastAPI(
    title="PBG Eval",
    description="Autonomous evaluation platform for PBG semantic comparison with auto fault detection, prompt studio, and healing.",
    version="0.4.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(evaluations.router)
app.include_router(studio.router)
app.include_router(synthetic.router)
app.include_router(automation.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "pbg-eval", "version": "0.4.0"}
