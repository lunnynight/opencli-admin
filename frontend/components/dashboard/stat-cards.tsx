import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Database, FileText, CheckCircle2, Activity } from "lucide-react"
import type { DashboardStats } from "@/lib/types"

export function StatCards({ stats }: { stats: DashboardStats }) {
  const successRate = Math.round(stats.runs.success_rate * 100)
  const items = [
    {
      label: "数据源",
      value: stats.sources.total,
      sub: `${stats.sources.enabled} 个已启用`,
      icon: Database,
    },
    {
      label: "已采集记录",
      value: stats.records.total,
      sub: `AI 已处理 ${stats.records.ai_processed.toLocaleString()}`,
      icon: FileText,
    },
    {
      label: "执行成功",
      value: stats.runs.success,
      sub: `共 ${stats.runs.total.toLocaleString()} 次执行`,
      icon: CheckCircle2,
      badge:
        stats.runs.total > 0 ? (
          <Badge
            variant="secondary"
            className={successRate >= 90 ? "text-success" : successRate >= 60 ? "text-warning" : "text-destructive"}
          >
            {successRate}%
          </Badge>
        ) : undefined,
    },
    {
      label: "运行中任务",
      value: stats.tasks.running,
      sub: `失败 ${stats.tasks.failed} · 共 ${stats.tasks.total}`,
      icon: Activity,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.label}
            </CardTitle>
            <item.icon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums tracking-tight">
              {item.value.toLocaleString()}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              {item.badge}
              <span>{item.sub}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
