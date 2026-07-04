import { readWorkflowRunArtifact } from "../../../../../lib/workflow/run-artifacts"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params
  const artifact = await readWorkflowRunArtifact(runId)
  if (!artifact) {
    return Response.json(
      {
        error: "WORKFLOW_RUN_NOT_FOUND",
        message: `Run artifact "${runId}" was not found.`,
      },
      { status: 404 },
    )
  }

  return Response.json(artifact, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
