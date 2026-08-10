from fastapi import APIRouter, HTTPException

from app.schemas import GradeRequest, GradeResponse
from pbg_eval.services.grade import grade_version

router = APIRouter(prefix="/api/grade", tags=["grade"])


@router.post("", response_model=GradeResponse)
def grade_runs(body: GradeRequest):
    try:
        result = grade_version(body.version)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return GradeResponse(version=body.version, **result)
