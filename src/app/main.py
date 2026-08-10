"""FastAPI application — thin REST layer over pbg_eval library."""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

_src = Path(__file__).resolve().parents[1]
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import batches, grade, report, versions
from pbg_eval.config import get_config
from pbg_eval.db import connect

@asynccontextmanager
async def lifespan(_app: FastAPI):
    connect(get_config().db_path).close()
    yield


app = FastAPI(
    title="PBG Eval",
    description="Eval harness for PBG comparison pipeline",
    version="0.1.0",
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
app.include_router(grade.router)
app.include_router(versions.router)
app.include_router(report.router)


@app.get("/health")
def health():
    return {"status": "ok"}
