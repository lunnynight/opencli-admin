// Plan IR contract types — mirrors backend.schemas.plan_ir field-for-field.
// Ported from the legacy frontend; lib/plan-canvas-model.ts consumes these.

export type PlanNodeKind = "source" | "transform" | "merge" | "sink"

export interface PlanPort {
  name: string
  type: string
}

export interface PlanNode {
  id: string
  kind: PlanNodeKind
  type: string
  label?: string | null
  params: Record<string, unknown>
  required_params: string[]
  inputs: PlanPort[]
  outputs: PlanPort[]
  source_id?: string | null
  draft: boolean
}

export interface PlanEdge {
  id: string
  source_node: string
  source_port: string
  target_node: string
  target_port: string
}

export interface PlanGraph {
  ir_version: string
  name?: string | null
  draft: boolean
  nodes: PlanNode[]
  edges: PlanEdge[]
}

export interface PlanRead {
  id: string
  name: string
  graph: PlanGraph
  version: number
}

// Mirror of backend PlanValidationError.to_dict() — the 422 `detail` array on
// a failed plan save. node_id/edge_id anchor errors onto canvas elements.
export interface PlanValidationErrorItem {
  code: string
  message: string
  node_id?: string
  edge_id?: string
}

// Mirrors backend.plan_ir.presets.Preset — read-only palette entries.
export interface Preset {
  id: string
  channel_type: string
  node_type: string
  label: string
  description: string
  params: Record<string, unknown>
}

export type PresetsGrouped = Record<string, Preset[]>
