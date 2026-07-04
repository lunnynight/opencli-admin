'use client'

import { motion } from 'motion/react'

import { cn } from '@/lib/utils'

const EASE_EMPHASIZED_DECELERATE = [0.05, 0.7, 0.1, 1] as const

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASE_EMPHASIZED_DECELERATE },
  },
}

export function PageContainer({
  title,
  eyebrow,
  description,
  actions,
  tabs,
  children,
  className,
}: {
  title: string
  /** Uppercase tracked mono label above the headline (brand signature). */
  eyebrow?: string
  description?: string
  actions?: React.ReactNode
  /** Optional route tabs rendered under the header (sibling views). */
  tabs?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={cn('mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6', className)}
    >
      <motion.div variants={item} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            {eyebrow ? <span className="eyebrow-mono">{eyebrow}</span> : null}
            <h1 className="text-3xl font-normal tracking-[-0.02em] text-balance">{title}</h1>
            {description ? (
              <p className="text-sm text-muted-foreground text-pretty">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
        {tabs}
      </motion.div>
      <motion.div variants={item} className="flex flex-col gap-6">
        {children}
      </motion.div>
    </motion.div>
  )
}
