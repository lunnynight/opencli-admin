import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OperatorCardProps {
  label: string
  value: ReactNode
  hint?: string
  icon: LucideIcon
  tone?: string
  active?: boolean
  onClick?: () => void
}

export function OperatorCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'border-white/10 bg-white/[0.035] text-zinc-300',
  active = false,
  onClick,
}: OperatorCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center border', tone)}>
          <Icon size={16} />
        </span>
        <span className="font-code text-2xl text-zinc-50">{value}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-zinc-100">{label}</p>
      {hint && <p className="mt-1 text-xs leading-5 text-zinc-500">{hint}</p>}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        data-active={active}
        onClick={onClick}
        className="group min-h-28 border border-white/10 bg-black/20 p-3 text-left transition-colors hover:border-primary-500/45 hover:bg-white/[0.04] data-[active=true]:border-primary-500/65 data-[active=true]:bg-primary-500/[0.075]"
      >
        {body}
      </button>
    )
  }

  return (
    <div
      data-active={active}
      className="min-h-28 border border-white/10 bg-black/20 p-3 data-[active=true]:border-primary-500/65 data-[active=true]:bg-primary-500/[0.075]"
    >
      {body}
    </div>
  )
}
