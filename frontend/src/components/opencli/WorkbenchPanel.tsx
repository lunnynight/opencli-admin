import type { ReactNode } from 'react'
import Card from '../Card'

export function WorkbenchPanel({
  label,
  title,
  description,
  action,
  children,
}: {
  label: string
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card padding={false} className="overflow-hidden">
      <div className="border-b border-white/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="telemetry-label">{label}</p>
            <div className="mt-1 text-lg font-semibold text-zinc-100">{title}</div>
            {description && <div className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">{description}</div>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
      {children}
    </Card>
  )
}
