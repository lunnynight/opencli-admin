"use client"

import { useState } from "react"
import { ListChecks } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TaskStatusBadge } from "@/components/status-badge"
import { useTasks } from "@/lib/queries"

const STATUS_FILTERS = [
  { value: "all", label: "全部" },
  { value: "running", label: "运行中" },
  { value: "pending", label: "等待中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
] as const

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false })
}

export default function TasksPage() {
  const [status, setStatus] = useState("all")
  const { data: tasks, isLoading } = useTasks(
    status === "all" ? undefined : { status },
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">采集任务</h1>
          <p className="text-muted-foreground text-sm">
            实时任务执行状态，每 15 秒自动刷新
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          value={status}
          onValueChange={(v) => v && setStatus(v)}
        >
          {STATUS_FILTERS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value}>
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecks />
            </EmptyMedia>
            <EmptyTitle>没有任务</EmptyTitle>
            <EmptyDescription>
              {status === "all"
                ? "触发采集或等待定时计划运行后，任务会出现在这里。"
                : "当前筛选条件下没有任务。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>数据源</TableHead>
                <TableHead>触发方式</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>错误信息</TableHead>
                <TableHead className="text-right">创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">
                    {task.source_name ?? task.source_id}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {task.trigger_type === "manual"
                      ? "手动"
                      : task.trigger_type === "cron"
                        ? "定时"
                        : task.trigger_type}
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge status={task.status} />
                  </TableCell>
                  <TableCell>
                    {task.error_message ? (
                      <span className="text-destructive max-w-sm truncate text-xs">
                        {task.error_message}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-sm">
                    {formatTime(task.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
