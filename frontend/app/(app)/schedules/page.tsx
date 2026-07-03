"use client"

import { useMemo, useState } from "react"
import { CalendarClock, MoreHorizontal, Search } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EnabledBadge } from "@/components/status-badge"
import { useDeleteSchedule, useSchedules, useToggleSchedule } from "@/lib/queries"

function formatTime(value?: string) {
  if (!value) return "—"
  return new Date(value).toLocaleString("zh-CN", { hour12: false })
}

export default function SchedulesPage() {
  const { data: schedules, isLoading } = useSchedules()
  const toggle = useToggleSchedule()
  const remove = useDeleteSchedule()
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    if (!schedules) return []
    const q = query.trim().toLowerCase()
    if (!q) return schedules
    return schedules.filter(
      (s) => s.name.toLowerCase().includes(q) || s.cron_expression.includes(q),
    )
  }, [schedules, query])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">定时计划</h1>
          <p className="text-muted-foreground text-sm">Cron 表达式驱动的自动采集排程</p>
        </div>
        <InputGroup className="w-full max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="搜索名称 / cron"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </InputGroup>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarClock />
            </EmptyMedia>
            <EmptyTitle>{query ? "没有匹配的计划" : "还没有定时计划"}</EmptyTitle>
            <EmptyDescription>
              {query ? "换个关键词试试。" : "为数据源配置 cron 排程后会出现在这里。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>Cron 表达式</TableHead>
                <TableHead>时区</TableHead>
                <TableHead>下次运行</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-24 text-right">启用</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{schedule.name}</span>
                      {schedule.is_one_time && (
                        <Badge variant="secondary" className="font-normal">
                          单次
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Kbd>{schedule.cron_expression}</Kbd>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {schedule.timezone}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatTime(schedule.next_run_at)}
                  </TableCell>
                  <TableCell>
                    <EnabledBadge enabled={schedule.enabled} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={schedule.enabled}
                      aria-label={`启用 ${schedule.name}`}
                      onCheckedChange={(enabled) =>
                        toggle.mutate(
                          { id: schedule.id, enabled },
                          { onError: () => toast.error("更新失败，请重试") },
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="更多操作">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() =>
                              remove.mutate(schedule.id, {
                                onSuccess: () => toast.success("计划已删除"),
                                onError: () => toast.error("删除失败，请重试"),
                              })
                            }
                          >
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
