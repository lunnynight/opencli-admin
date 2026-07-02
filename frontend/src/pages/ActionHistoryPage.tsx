import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatInTimeZone } from 'date-fns-tz'

import { listControlActions } from '../api/endpoints'
import Card from '../components/Card'
import DataTable from '../components/DataTable'
import ErrorAlert from '../components/ErrorAlert'
import { PageLoader } from '../components/LoadingSpinner'
import Pagination from '../components/Pagination'
import PageHeader from '../components/PageHeader'
import { Badge } from '../components/ui/badge'
import {
  EMPTY_ACTION_HISTORY_FILTERS,
  toActionHistoryRowView,
  toListControlActionsParams,
  verdictTone,
  type ActionHistoryFilters,
  type ActionHistoryRowView,
} from '../labs/topology/actionHistory'

const LIMIT = 20

/** The operator's audit surface over everything the controller has ever
 * suggested or done (issue 07) — a read-only listing over the control_actions
 * Evidence Ledger (GET /control/actions). Advisory-only today: `executed`
 * rows do not exist until PR-Control-4 ships, and this view renders that
 * fact honestly rather than assuming a shape that doesn't exist yet. */
export default function ActionHistoryPage() {
  const [filters, setFilters] = useState<ActionHistoryFilters>(EMPTY_ACTION_HISTORY_FILTERS)
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['control-actions', filters, page],
    queryFn: () => listControlActions(toListControlActionsParams(filters, page, LIMIT)),
    refetchInterval: 15_000,
  })

  const rows = (query.data?.data ?? []).map(toActionHistoryRowView)
  const meta = query.data?.meta

  const updateFilter = (key: keyof ActionHistoryFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Action History"
        description="Evidence Ledger — every control suggestion and execution, with its judged outcome."
      />

      <Card padding={false} className="border-white/[0.1] bg-black/20">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] px-4 py-3">
          <input
            type="text"
            placeholder="source_id"
            value={filters.sourceId}
            onChange={(e) => updateFilter('sourceId', e.target.value)}
            className="h-8 w-40 rounded-md border border-white/[0.12] bg-black/40 px-2 text-xs text-zinc-200 outline-none focus:border-sky-500/60"
          />
          <select
            value={filters.mode}
            onChange={(e) => updateFilter('mode', e.target.value)}
            className="h-8 rounded-md border border-white/[0.12] bg-black/40 px-2 text-xs text-zinc-200 outline-none focus:border-sky-500/60"
          >
            <option value="">all modes</option>
            <option value="advisory">advisory</option>
            <option value="automatic">automatic</option>
          </select>
          <select
            value={filters.outcome}
            onChange={(e) => updateFilter('outcome', e.target.value)}
            className="h-8 rounded-md border border-white/[0.12] bg-black/40 px-2 text-xs text-zinc-200 outline-none focus:border-sky-500/60"
          >
            <option value="">all outcomes</option>
            <option value="pending">pending</option>
            <option value="recovered">recovered</option>
            <option value="persisted">persisted</option>
            <option value="insufficient_data">insufficient_data</option>
          </select>
        </div>

        {query.isLoading ? (
          <PageLoader />
        ) : query.error ? (
          <ErrorAlert error={query.error as Error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <DataTable
              data={rows}
              keyFn={(r) => r.id}
              emptyMessage="No ledger rows match these filters."
              columns={[
                {
                  key: 'source_id',
                  header: 'Source',
                  width: '140px',
                  render: (r: ActionHistoryRowView) => (
                    <span className="font-mono text-xs text-zinc-400">{r.sourceId.slice(0, 8)}</span>
                  ),
                },
                {
                  key: 'state',
                  header: 'State',
                  render: (r: ActionHistoryRowView) => <span className="text-sm">{r.state}</span>,
                },
                {
                  key: 'action_type',
                  header: 'Action',
                  render: (r: ActionHistoryRowView) => <span className="text-sm">{r.actionType}</span>,
                },
                {
                  key: 'reason',
                  header: 'Reason',
                  render: (r: ActionHistoryRowView) => (
                    <span className="block truncate text-xs text-zinc-500" title={r.reason}>
                      {r.reason}
                    </span>
                  ),
                },
                {
                  key: 'mode',
                  header: 'Mode',
                  width: '100px',
                  render: (r: ActionHistoryRowView) => (
                    <Badge variant={r.mode === 'automatic' ? 'default' : 'secondary'}>{r.mode}</Badge>
                  ),
                },
                {
                  key: 'executed',
                  header: 'Executed',
                  width: '90px',
                  render: (r: ActionHistoryRowView) => (
                    <span className={r.executed ? 'text-emerald-300' : 'text-zinc-500'}>
                      {r.executed ? 'yes' : 'no'}
                    </span>
                  ),
                },
                {
                  key: 'verdict',
                  header: 'Outcome',
                  width: '140px',
                  render: (r: ActionHistoryRowView) => <VerdictBadge label={r.verdictLabel} tone={verdictTone(r.verdict)} />,
                },
                {
                  key: 'created_at',
                  header: 'Recorded',
                  width: '140px',
                  render: (r: ActionHistoryRowView) => (
                    <span className="text-xs text-zinc-500">
                      {formatInTimeZone(new Date(r.createdAt), 'Asia/Shanghai', 'MM-dd HH:mm:ss')}
                    </span>
                  ),
                },
              ]}
            />
            {meta && meta.total > 0 && (
              <Pagination page={meta.page} pages={meta.pages} total={meta.total} limit={meta.limit} onChange={setPage} />
            )}
          </>
        )}
      </Card>
    </div>
  )
}

function VerdictBadge({ label, tone }: { label: string; tone: 'success' | 'danger' | 'neutral' }) {
  const cls =
    tone === 'success'
      ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100'
      : tone === 'danger'
        ? 'border-red-400/35 bg-red-400/10 text-red-100'
        : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300'
  return <span className={`inline-flex border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{label}</span>
}
