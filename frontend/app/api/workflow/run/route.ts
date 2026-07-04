import workflowFixture from "../../../../lib/workflow/fixtures/workflow-intelligence.json"
import { compileWorkflowProject } from "../../../../lib/workflow/backend-compile"
import { createWorkflowRunArtifact } from "../../../../lib/workflow/run-artifacts"
import { parseWorkflowProject } from "../../../../lib/workflow/schema"

export const dynamic = "force-dynamic"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8031"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => workflowFixture)
    const project = parseWorkflowProject(body ?? workflowFixture)
    const compile = await compileWorkflowProject(project, {
      baseUrl: BACKEND_URL,
      authorization: req.headers.get("authorization"),
    })

    if (!compile.valid || !compile.plan) {
      return Response.json(
        {
          error: "WORKFLOW_COMPILE_FAILED",
          message: compile.errors[0]?.message ?? "Backend workflow compile failed",
          errors: compile.errors,
        },
        { status: 422 },
      )
    }

    const artifact = await createWorkflowRunArtifact(project, { backendCompile: compile.plan })

    return Response.json(artifact, {
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return Response.json(
      {
        error: "WORKFLOW_RUN_FAILED",
        message: error instanceof Error ? error.message : "Unknown workflow run error",
      },
      { status: 400 },
    )
  }
}
