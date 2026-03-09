'use client'

import { AlertTriangle, Info, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { FindingSeverity } from '@/types/finding'

export type SeverityIndicatorProps = {
  severity: FindingSeverity
}

/** Guardrail #36: icon shape + text + color, icon min 16px */
const SEVERITY_CONFIG: Record<
  FindingSeverity,
  { Icon: LucideIcon; label: string; classes: string }
> = {
  critical: {
    Icon: XCircle,
    label: 'Critical',
    classes: 'bg-severity-critical/10 text-severity-critical border-severity-critical/20',
  },
  major: {
    Icon: AlertTriangle,
    label: 'Major',
    classes: 'bg-severity-major/10 text-severity-major border-severity-major/20',
  },
  minor: {
    Icon: Info,
    label: 'Minor',
    classes: 'bg-severity-minor/10 text-severity-minor border-severity-minor/20',
  },
}

export function SeverityIndicator({ severity }: SeverityIndicatorProps) {
  const config = SEVERITY_CONFIG[severity]
  const { Icon, label, classes } = config

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium border ${classes}`}
    >
      {/* Guardrail #36: aria-hidden on icon, text label is accessible name */}
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  )
}
