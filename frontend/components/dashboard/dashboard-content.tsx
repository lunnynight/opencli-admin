"use client"

import { useDashboardStats, useDashboardActivity } from "@/lib/queries"
import { StatCards } from "@/components/dashboard/stat-cards"
import { ActivityChart } from "@/components/dashboard/activity-chart"
import { RecentTasks } from "@/components/dashboard/recent-tasks"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export function DashboardContent() {
  const stats = useDashboardStats()
  const activity = useDashboardActivity()

  if (stats.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>无法加载仪表盘数据</AlertTitle>
        <AlertDescription>
          请确认后端服务已启动（{String(stats.error)}）
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {stats.isLoading || !stats.data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <StatCards stats={stats.data} />
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {activity.isLoading ? (
            <Skeleton className="h-80" />
          ) : (
            <ActivityChart data={activity.data?.daily ?? []} />
          )}
        </div>
        <div className="lg:col-span-2">
          {stats.isLoading ? (
            <Skeleton className="h-80" />
          ) : (
            <RecentTasks runs={stats.data?.recent_runs ?? []} />
          )}
        </div>
      </div>
    </div>
  )
}
