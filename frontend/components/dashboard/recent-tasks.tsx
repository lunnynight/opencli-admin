import Link from "next/link"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { TaskStatusBadge } from "@/components/status-badge"
import type { DashboardStats } from "@/lib/types"

type RecentRun = DashboardStats["recent_runs"][number]

export function RecentTasks({ runs }: { runs: RecentRun[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>最近执行</CardTitle>
        <CardDescription>
          <Link href="/tasks" className="hover:text-foreground hover:underline">
            查看全部 →
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>暂无执行记录</EmptyTitle>
              <EmptyDescription>触发采集后执行记录会出现在这里</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col">
            {runs.map((run) => (
              <li
                key={run.id}
                className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{run.source_name || `任务 #${run.task_id.slice(0, 8)}`}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(run.created_at).toLocaleString("zh-CN")}
                    {" · "}
                    {run.records_collected} 条记录
                    {run.duration_ms != null && ` · ${(run.duration_ms / 1000).toFixed(1)}s`}
                  </p>
                </div>
                <TaskStatusBadge status={run.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
