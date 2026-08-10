from fastapi import APIRouter, HTTPException

from pbg_eval.services.report import list_versions, version_runs

router = APIRouter(prefix="/api/versions", tags=["versions"])


@router.get("")
def get_versions():
    return list_versions()


@router.get("/{label}/runs")
def get_version_runs(label: str):
    try:
        return version_runs(label)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
