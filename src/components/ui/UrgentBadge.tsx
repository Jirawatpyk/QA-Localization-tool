'use client'

import { AlertTriangle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type UrgentBadgeProps = {
  className?: string
}

export function UrgentBadge({ className }: UrgentBadgeProps) {
  return (
    <Badge
      variant="destructive"
      className={cn('gap-1', className)}
      aria-label="Urgent priority"
      data-testid="urgent-badge"
    >
      <AlertTriangle className="size-3" aria-hidden="true" />
      Urgent
    </Badge>
  )
}
