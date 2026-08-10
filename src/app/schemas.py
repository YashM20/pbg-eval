from pydantic import BaseModel, Field


class BatchRequest(BaseModel):
    version: str
    docs_dir: str
    repeats: int = Field(default=5, ge=1, le=20)
    allow_prod: bool = False
    auto_grade: bool = True
    prompt_hash: str = ""
    model_config_json: str = "{}"


class BatchStartResponse(BaseModel):
    batch_id: int
    status: str = "started"


class BatchDocStatus(BaseModel):
    doc_id: str
    total: int
    completed: int
    pending: int
    excluded: int
    error: str | None = None


class BatchStatusResponse(BaseModel):
    batch_id: int
    version_id: int
    status: str
    total: int
    completed: int
    error: str | None = None
    started_at: str
    docs: list[BatchDocStatus] = []


# Legacy aliases
RunRequest = BatchRequest
RunStartResponse = BatchStartResponse
JobStatusResponse = BatchStatusResponse


class GradeRequest(BaseModel):
    version: str


class GradeResponse(BaseModel):
    version: str
    graded: int
    excluded: int
    errors: list[str]
