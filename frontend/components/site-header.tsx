"use client"

import { usePathname } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { ThemeToggle } from "@/components/theme-toggle"

const TITLES: Record<string, string> = {
  "/dashboard": "仪表盘",
  "/sources": "数据源",
  "/schedules": "定时计划",
  "/tasks": "采集任务",
  "/records": "采集记录",
  "/canvas": "采集画布",
}

export function SiteHeader() {
  const pathname = usePathname()
  const title =
    Object.entries(TITLES).find(([path]) => pathname.startsWith(path))?.[1] ??
    "OpenCLI Admin"

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  )
}
