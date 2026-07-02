// Pure data-mapping seam for the Action History view (issue 07). Framework-
// free so `node --test` can cover verdict/label projection without mounting
// anything — the view itself (ActionHistoryPage) just calls these.
import type { ControlActionRecord } from '../../api/types'

export type ActionHistoryVerdict = 'recovered' | 'persisted' | 'insufficient_data' | 'pending'

/** "pending" is never a stored `outcome` value on the row (see
 * backend/models/control_action.py) — it is the absence of one, signalled by
 * `evaluated_at` still being null. Mirrors the same convention the backend's
 * GET /control/actions?outcome=pending query and the advisory-report's
 * pending tally already use (backend/api/v1/control.py's `_tally`). */
export function actionVerdict(row: ControlActionRecord): ActionHistoryVerdict {
  if (row.outcome) return row.outcome
  return 'pending'
}

export const VERDICT_LABEL: Record<ActionHistoryVerdict, string> = {
  recovered: 'RECOVERED',
  persisted: 'PERSISTED',
  insufficient_data: 'INSUFFICIENT DATA',
  pending: 'PENDING',
}

/** Tone for VerdictBadge — 'pending' must never read as a positive/negative
 * verdict since nothing has been judged yet (neutral, not green/red). */
export function verdictTone(verdict: ActionHistoryVerdict): 'success' | 'danger' | 'neutral' {
  if (verdict === 'recovered') return 'success'
  if (verdict === 'persisted') return 'danger'
  return 'neutral'
}

/** Row projection for the table — one place that decides what's shown for
 * "executed" (advisory rows always show `executed=false` no matter how
 * confident the label reads, matching backend/models/control_action.py:
 * "mode is always advisory and executed is always False" until PR-Control-4
 * ships automatic-mode execution). */
export interface ActionHistoryRowView {
  id: string
  sourceId: string
  state: string
  actionType: string
  reason: string
  mode: string
  executed: boolean
  verdict: ActionHistoryVerdict
  verdictLabel: string
  createdAt: string
}

export function toActionHistoryRowView(row: ControlActionRecord): ActionHistoryRowView {
  const verdict = actionVerdict(row)
  return {
    id: row.id,
    sourceId: row.source_id,
    state: row.state,
    actionType: row.action_type,
    reason: row.reason ?? '—',
    mode: row.mode,
    executed: row.executed,
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    createdAt: row.created_at,
  }
}

export interface ActionHistoryFilters {
  sourceId: string
  mode: string
  outcome: string
}

export const EMPTY_ACTION_HISTORY_FILTERS: ActionHistoryFilters = {
  sourceId: '',
  mode: '',
  outcome: '',
}

/** Build the query params object for listControlActions from UI filter state
 * — empty strings mean "no filter" and must be omitted entirely (an empty
 * string sent as `source_id=` would filter to nothing, not "everything"). */
export function toListControlActionsParams(
  filters: ActionHistoryFilters,
  page: number,
  limit: number,
): { source_id?: string; mode?: string; outcome?: string; page: number; limit: number } {
  const params: { source_id?: string; mode?: string; outcome?: string; page: number; limit: number } = {
    page,
    limit,
  }
  if (filters.sourceId) params.source_id = filters.sourceId
  if (filters.mode) params.mode = filters.mode
  if (filters.outcome) params.outcome = filters.outcome
  return params
}
