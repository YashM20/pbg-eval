from fastapi import APIRouter, HTTPException, Query

from pbg_eval.services.report import compare_versions

router = APIRouter(prefix="/api/report", tags=["report"])


@router.get("/compare")
def compare(v1: str = Query(...), v2: str = Query(...)):
    try:
        return compare_versions(v1, v2)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
