"use client"

import { useMemo, useState } from "react"
import { Database, MoreHorizontal, Search } from "lucide-react"
import { toast } from "sonner"

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
import { Badge } from "@/components/ui/badge"
import { ChannelBadge, EnabledBadge } from "@/components/status-badge"
import { useDeleteSource, useSources, useToggleSource } from "@/lib/queries"

export default function SourcesPage() {
  const { data: sources, isLoading } = useSources()
  const toggle = useToggleSource()
  const remove = useDeleteSource()
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    if (!sources) return []
    const q = query.trim().toLowerCase()
    if (!q) return sources
    return sources.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.channel_type.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [sources, query])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">数据源</h1>
          <p className="text-muted-foreground text-sm">管理采集渠道与其配置</p>
        </div>
        <InputGroup className="w-full max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="搜索名称 / 渠道 / 标签"
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
              <Database />
            </EmptyMedia>
            <EmptyTitle>{query ? "没有匹配的数据源" : "还没有数据源"}</EmptyTitle>
            <EmptyDescription>
              {query ? "换个关键词试试。" : "在采集画布中创建数据源节点后会出现在这里。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>渠道</TableHead>
                <TableHead>标签</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-24 text-right">启用</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{source.name}</span>
                      {source.description && (
                        <span className="text-muted-foreground max-w-md truncate text-xs">
                          {source.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ChannelBadge channel={source.channel_type} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {source.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="font-normal">
                          {tag}
                        </Badge>
                      ))}
                      {source.tags.length > 3 && (
                        <span className="text-muted-foreground text-xs">
                          +{source.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <EnabledBadge enabled={source.enabled} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={source.enabled}
                      aria-label={`启用 ${source.name}`}
                      onCheckedChange={(enabled) =>
                        toggle.mutate(
                          { id: source.id, enabled },
                          {
                            onError: () => toast.error("更新失败，请重试"),
                          },
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
                              remove.mutate(source.id, {
                                onSuccess: () => toast.success("数据源已删除"),
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
