"""WorkflowProject compile endpoints."""

from fastapi import APIRouter

from backend.schemas.common import ApiResponse
from backend.schemas.workflow import WorkflowCompileRequest, WorkflowCompileResponse
from backend.workflow.compiler import compile_workflow_project

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.post("/compile", response_model=ApiResponse[WorkflowCompileResponse])
async def compile_workflow(body: WorkflowCompileRequest) -> ApiResponse[WorkflowCompileResponse]:
    """Compile a Canvas-authored WorkflowProject into an executable preview.

    This endpoint is stateless: it validates and compiles in memory, but it
    does not create tasks, persist a plan, or dispatch workers.
    """

    return ApiResponse.ok(compile_workflow_project(body.project))
