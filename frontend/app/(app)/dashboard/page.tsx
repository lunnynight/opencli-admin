import type { Metadata } from "next"
import { DashboardContent } from "@/components/dashboard/dashboard-content"

export const metadata: Metadata = {
  title: "仪表盘 · OpenCLI Admin",
}

export default function DashboardPage() {
  return <DashboardContent />
}
