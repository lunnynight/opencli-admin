import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ChannelType, TaskStatus } from "@/lib/types"

// GitHub-style status dots: a colored dot + neutral text reads cleaner than
// fully tinted badges and keeps the palette restrained.

const TASK_STATUS_META: Record<TaskStatus, { label: string; dot: string }> = {
  pending: { label: "等待中", dot: "bg-muted-foreground" },
  running: { label: "运行中", dot: "bg-primary animate-pulse" },
  completed: { label: "已完成", dot: "bg-success" },
  failed: { label: "失败", dot: "bg-destructive" },
  cancelled: { label: "已取消", dot: "bg-warning" },
}

export function TaskStatusBadge({ status }: { status: TaskStatus | string }) {
  const meta = TASK_STATUS_META[status as TaskStatus] ?? {
    label: status,
    dot: "bg-muted-foreground",
  }
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  )
}

export function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span
        className={cn("size-1.5 rounded-full", enabled ? "bg-success" : "bg-muted-foreground")}
      />
      {enabled ? "已启用" : "已停用"}
    </Badge>
  )
}

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  opencli: "OpenCLI",
  web_scraper: "网页爬虫",
  api: "API",
  rss: "RSS",
  cli: "CLI",
  skill: "Skill",
  crawl4ai: "Crawl4AI",
}

export function ChannelBadge({ channel }: { channel: ChannelType | string }) {
  return (
    <Badge variant="secondary" className="font-normal">
      {CHANNEL_LABELS[channel as ChannelType] ?? channel}
    </Badge>
  )
}
