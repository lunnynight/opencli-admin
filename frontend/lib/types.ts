// API contract types for the OpenCLI Admin backend (/api/v1).
// Ported from the legacy frontend's api/types.ts — keep field names in sync
// with backend/schemas/*; batch-1 pages only need this subset.

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  pages: number
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
  meta?: PaginationMeta
}

export type ChannelType =
  | "opencli"
  | "web_scraper"
  | "api"
  | "rss"
  | "cli"
  | "skill"
  | "crawl4ai"

export interface DataSource {
  id: string
  name: string
  description?: string
  channel_type: ChannelType
  channel_config: Record<string, unknown>
  ai_config?: Record<string, unknown>
  enabled: boolean
  tags: string[]
  review_required?: boolean
  paused_until?: string | null
  created_at: string
  updated_at: string
}

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface CollectionTask {
  id: string
  source_id: string
  source_name?: string
  agent_id?: string
  trigger_type: string
  parameters: Record<string, unknown>
  priority: number
  status: TaskStatus
  error_message?: string
  created_at: string
  updated_at: string
}

export interface CollectedRecord {
  id: string
  task_id: string
  source_id: string
  raw_data: Record<string, unknown>
  normalized_data: Record<string, unknown>
  ai_enrichment?: Record<string, unknown>
  content_hash: string
  status: string
  error_message?: string
  created_at: string
  updated_at: string
}

export interface CronSchedule {
  id: string
  source_id: string
  agent_id?: string
  name: string
  cron_expression: string
  timezone: string
  parameters: Record<string, unknown>
  enabled: boolean
  is_one_time: boolean
  last_run_at?: string
  next_run_at?: string
  created_at: string
  updated_at: string
}

export interface DashboardStats {
  sources: { total: number; enabled: number; disabled: number }
  tasks: { total: number; running: number; failed: number }
  runs: { total: number; success: number; failed: number; success_rate: number }
  records: { total: number; ai_processed: number }
  recent_runs: Array<{
    id: string
    task_id: string
    task_trigger_type: string
    source_name: string
    status: string
    records_collected: number
    duration_ms?: number
    created_at: string
  }>
}

export interface DailyActivity {
  date: string
  total_runs: number
  success_runs: number
  failed_runs: number
  new_records: number
}

export interface DashboardActivity {
  daily: DailyActivity[]
}

// ── Plan IR (canvas workflow graph) ─────────────────────────────────────────
// Mirrors backend.plan_ir schemas — the canvas is a projection of this graph.

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

// PlanValidationError.to_dict() — returned as the 422 `detail` array on a
// failed plan save. node_id/edge_id are the anchors the canvas renders on.
export interface PlanValidationErrorItem {
  code: string
  message: string
  node_id?: string
  edge_id?: string
}

// Mirrors backend.plan_ir.presets.Preset. Read-only, grouped by channel_type.
export interface Preset {
  id: string
  channel_type: string
  node_type: string
  label: string
  description: string
  params: Record<string, unknown>
}

export type PresetsGrouped = Record<string, Preset[]>

export interface PlanRead {
  id: string
  name: string
  graph: PlanGraph
  version: number
  draft: boolean
  runnable: boolean
  created_at: string
  updated_at: string
}
