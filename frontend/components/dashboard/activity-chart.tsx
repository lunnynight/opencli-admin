"use client"

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { DailyActivity } from "@/lib/types"

const chartConfig = {
  new_records: {
    label: "新增记录",
    color: "var(--chart-1)",
  },
  total_runs: {
    label: "执行次数",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function ActivityChart({ data }: { data: DailyActivity[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>7 天采集趋势</CardTitle>
        <CardDescription>每日新增记录与任务执行量</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <AreaChart data={data} margin={{ left: 4, right: 4 }}>
            <defs>
              <linearGradient id="fillRecords" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-new_records)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-new_records)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="fillRuns" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-total_runs)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-total_runs)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value: string) => value.slice(5)}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              dataKey="new_records"
              type="monotone"
              fill="url(#fillRecords)"
              stroke="var(--color-new_records)"
              strokeWidth={2}
            />
            <Area
              dataKey="total_runs"
              type="monotone"
              fill="url(#fillRuns)"
              stroke="var(--color-total_runs)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
