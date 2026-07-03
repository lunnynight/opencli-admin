"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, FileText, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TaskStatusBadge } from "@/components/status-badge"
import { useRecords } from "@/lib/queries"
import { Fragment } from "react"

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false })
}

function recordTitle(record: { normalized_data: Record<string, unknown> }) {
  const d = record.normalized_data
  return (
    (typeof d.title === "string" && d.title) ||
    (typeof d.name === "string" && d.name) ||
    (typeof d.content === "string" && d.content.slice(0, 80)) ||
    "（无标题）"
  )
}

export default function RecordsPage() {
  const [search, setSearch] = useState("")
  const [submitted, setSubmitted] = useState("")
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { data: resp, isLoading } = useRecords({ page, search: submitted })

  const records = resp?.data ?? []
  const meta = resp?.meta

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">采集记录</h1>
          <p className="text-muted-foreground text-sm">
            已入库的采集数据{meta ? `，共 ${meta.total} 条` : ""}
          </p>
        </div>
        <form
          className="w-full max-w-xs"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setSubmitted(search)
          }}
        >
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="全文搜索，回车提交"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
        </form>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>{submitted ? "没有匹配的记录" : "还没有采集记录"}</EmptyTitle>
            <EmptyDescription>
              {submitted ? "换个关键词试试。" : "任务成功运行后，数据会出现在这里。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>内容</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">采集时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const isOpen = expanded === record.id
                  return (
                    <Fragment key={record.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : record.id)}
                      >
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={isOpen ? "收起" : "展开"}
                            aria-expanded={isOpen}
                          >
                            {isOpen ? <ChevronDown /> : <ChevronRight />}
                          </Button>
                        </TableCell>
                        <TableCell className="max-w-xl">
                          <span className="line-clamp-1 font-medium">
                            {recordTitle(record)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <TaskStatusBadge status={record.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right text-sm">
                          {formatTime(record.created_at)}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={4} className="bg-muted/50 p-0">
                            <ScrollArea className="max-h-80">
                              <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">
                                {JSON.stringify(
                                  {
                                    normalized: record.normalized_data,
                                    ai: record.ai_enrichment ?? null,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </ScrollArea>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {meta && meta.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                第 {meta.page} / {meta.pages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
