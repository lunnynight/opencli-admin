'use client'

import { Activity, ArrowDownToLine, CheckCircle2, Send, Server } from 'lucide-react'

import { useDashboardActivity, useDashboardStats, useWorkers } from '@/lib/api/hooks'
import type { WorkerNode } from '@/lib/api/types'
import {
  useMonitorFeed,
  type FailureItem,
  type StreamTask,
  type ThroughputPoint,
  type WorkerView,
} from '@/lib/demo/monitor'
import { formatNumber } from '@/lib/format'
import { FailureFeed, TaskStream } from '@/components/monitor/task-stream'
import { ThroughputChart } from '@/components/monitor/throughput-chart'
import { WorkerAllocation } from '@/components/monitor/worker-allocation'
import { LoadingState } from '@/components/shell/data-states'
import { PageContainer } from '@/components/shell/page-container'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
}: {
  title: string
  value: string
  sub?: string
  icon: typeof Activity
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl tabular-nums">{value}</div>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  )
}

/** Map backend recent runs into the shared stream shape. */
function runsToStream(
  runs: Array<{
    id: string
    source_name: string
    task_trigger_type: string
    status: string
    records_collected: number
    duration_ms?: number | null
    created_at?: string
  }>,
): StreamTask[] {
  return runs.map((r) => ({
    id: r.id,
    lane: 'collect' as const,
    title: `${r.source_name} 采集`,
    endpoint: r.source_name,
    workerId: '',
    workerName: r.task_trigger_type,
    phase:
      r.status === 'success' || r.status === 'completed'
        ? ('success' as const)
        : r.status === 'failed'
          ? ('failed' as const)
          : r.status === 'running'
            ? ('running' as const)
            : ('queued' as const),
    records: r.records_collected,
    retries: 0,
    startedAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    durationMs: r.duration_ms ?? null,
  }))
}

export default function DashboardPage() {
  const stats = useDashboardStats()
  const activity = useDashboardActivity()
  const workersQuery = useWorkers()

  const demoMode = stats.isError
  const demo = useMonitorFeed(demoMode)

  if (stats.isLoading || (demoMode && !demo)) {
    return (
      <PageContainer eyebrow="Monitor" title="监控台" description="采集 → 发送全链路任务分配态势">
        <LoadingState rows={3} />
      </PageContainer>
    )
  }

  // ── Resolve view models: real backend data first, demo feed as fallback ──
  let kpis: Array<{ title: string; value: string; sub?: string; icon: typeof Activity }>
  let throughput: ThroughputPoint[]
  let workers: WorkerView[]
  let stream: StreamTask[]
  let failures: FailureItem[]
  let daily = false

  if (!demoMode && stats.data) {
    const s = stats.data
    kpis = [
      {
        title: '采集记录',
        value: formatNumber(s.records.total),
        sub: `AI 处理 ${formatNumber(s.records.ai_processed)}`,
        icon: ArrowDownToLine,
      },
      {
        title: '任务',
        value: formatNumber(s.tasks.total),
        sub: `运行中 ${s.tasks.running} · 失败 ${s.tasks.failed}`,
        icon: Send,
      },
      {
        title: '运行成功率',
        value: `${Math.round((s.runs.success_rate ?? 0) * 100)}%`,
        sub: `成功 ${s.runs.success} · 失败 ${s.runs.failed}`,
        icon: CheckCircle2,
      },
      {
        title: '数据源',
        value: formatNumber(s.sources.total),
        sub: `启用 ${s.sources.enabled} · 停用 ${s.sources.disabled}`,
        icon: Server,
      },
    ]
    daily = true
    throughput = (activity.data?.daily ?? []).map((d) => ({
      time: d.date.slice(5),
      collected: d.success_runs,
      dispatched: d.new_records,
      failed: d.failed_runs,
    }))
    workers = (workersQuery.data?.data ?? []).map((w: WorkerNode) => ({
      id: w.id,
      name: w.hostname,
      lane: 'collect' as const,
      region: w.worker_id.slice(0, 8),
      online: w.status === 'online',
      load: Math.min(96, w.active_tasks * 18),
      queue: w.active_tasks,
      current: w.active_tasks > 0 ? `${w.active_tasks} 个任务执行中` : null,
      doneToday: 0,
      failedToday: 0,
    }))
    stream = runsToStream(s.recent_runs ?? [])
    failures = stream
      .filter((t) => t.phase === 'failed')
      .map((t) => ({
        id: `f-${t.id}`,
        lane: t.lane,
        title: t.title,
        workerName: t.workerName,
        error: '查看任务详情获取错误信息',
        retries: t.retries,
        at: t.startedAt,
      }))
  } else {
    const d = demo!
    kpis = [
      {
        title: '采集吞吐',
        value: `${d.kpi.collectPerMin}/min`,
        sub: `今日记录 ${formatNumber(d.kpi.recordsToday)}`,
        icon: ArrowDownToLine,
      },
      {
        title: '发送吞吐',
        value: `${d.kpi.dispatchPerMin}/min`,
        sub: `今日已发送 ${formatNumber(d.kpi.dispatchedToday)}`,
        icon: Send,
      },
      {
        title: '成功率',
        value: `${(d.kpi.successRate * 100).toFixed(1)}%`,
        sub: '近 30 分钟滚动窗口',
        icon: CheckCircle2,
      },
      {
        title: '队列 / Worker',
        value: `${d.kpi.queueDepth}`,
        sub: `在线 Worker ${d.kpi.onlineWorkers}/${d.kpi.totalWorkers}`,
        icon: Server,
      },
    ]
    throughput = d.throughput
    workers = d.workers
    stream = d.stream
    failures = d.failures
  }

  return (
    <PageContainer
      eyebrow="Monitor"
      title="监控台"
      description="采集 → 发送全链路任务分配态势"
      actions={
        demoMode ? (
          <Badge variant="outline" className="gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-warning" aria-hidden />
            演示数据 · 未连接后端
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden />
            实时
          </Badge>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.title} {...k} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ThroughputChart data={throughput} daily={daily} />
        </div>
        <FailureFeed failures={failures} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TaskStream tasks={stream} />
        </div>
        <WorkerAllocation workers={workers} />
      </div>
    </PageContainer>
  )
}
