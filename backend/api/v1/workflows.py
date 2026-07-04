"""WorkflowProject compile endpoints."""

from fastapi import APIRouter

from backend.schemas.common import ApiResponse
from backend.schemas.workflow import (
    WorkflowCompileRequest,
    WorkflowCompileResponse,
    WorkflowOpenCLIHDATraceRequest,
    WorkflowOpenCLIHDATraceResponse,
    WorkflowPatchRequest,
    WorkflowPatchResponse,
)
from backend.workflow.compiler import compile_workflow_project
from backend.workflow.opencli_hda_tracer import build_opencli_hda_trace
from backend.workflow.patcher import preview_workflow_patch

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.post("/compile", response_model=ApiResponse[WorkflowCompileResponse])
async def compile_workflow(body: WorkflowCompileRequest) -> ApiResponse[WorkflowCompileResponse]:
    """Compile a Canvas-authored WorkflowProject into an executable preview.

    This endpoint is stateless: it validates and compiles in memory, but it
    does not create tasks, persist a plan, or dispatch workers.
    """

    return ApiResponse.ok(compile_workflow_project(body.project))


@router.post("/opencli-hda/trace", response_model=ApiResponse[WorkflowOpenCLIHDATraceResponse])
async def trace_opencli_hda(
    body: WorkflowOpenCLIHDATraceRequest,
) -> ApiResponse[WorkflowOpenCLIHDATraceResponse]:
    """Build III trigger envelopes for a Multi Source OpenCLI HDA workflow run."""

    return ApiResponse.ok(
        build_opencli_hda_trace(
            body.project,
            package_node_id=body.packageNodeId,
            run_id=body.runId,
            trace_id=body.traceId,
        )
    )


@router.post("/patch", response_model=ApiResponse[WorkflowPatchResponse])
async def patch_workflow(body: WorkflowPatchRequest) -> ApiResponse[WorkflowPatchResponse]:
    """Preview structured AI-authored WorkflowProject patch operations."""

    return ApiResponse.ok(preview_workflow_patch(body.project, body.operations))
