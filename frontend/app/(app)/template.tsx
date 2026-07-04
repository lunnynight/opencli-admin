'use client'

import { motion } from 'motion/react'

/** M3 emphasized-decelerate page entrance on every navigation. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.05, 0.7, 0.1, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  )
}
