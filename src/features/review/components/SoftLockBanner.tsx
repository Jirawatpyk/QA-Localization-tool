'use client'

import { AlertTriangle } from 'lucide-react'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { takeOverFile } from '@/features/project/actions/takeOverFile.action'

type SoftLockBannerProps = {
  assignmentId: string
  projectId: string
  assigneeName: string
  lastActiveAt: Date | null
  isStale: boolean
  onTakeOver?: () => void
  onViewReadOnly?: () => void
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export function SoftLockBanner({
  assignmentId,
  projectId,
  assigneeName,
  lastActiveAt,
  isStale,
  onTakeOver,
  onViewReadOnly,
}: SoftLockBannerProps) {
  const [isPending, startTransition] = useTransition()

  function handleTakeOver() {
    startTransition(async () => {
      const result = await takeOverFile({
        currentAssignmentId: assignmentId,
        projectId,
      })

      if (result.success) {
        onTakeOver?.()
      }
    })
  }

  const lastActiveText = lastActiveAt ? formatRelativeTime(lastActiveAt) : 'unknown'

  return (
    <div
      className="bg-warning/10 border-warning flex items-center gap-3 rounded-md border px-4 py-3"
      role="alert"
      aria-live="polite"
      data-testid="soft-lock-banner"
    >
      <AlertTriangle className="text-warning size-5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-medium">
          This file is being reviewed by {assigneeName}
          {isStale ? (
            <span className="text-muted-foreground"> — inactive since {lastActiveText}</span>
          ) : (
            <span className="text-muted-foreground"> — last active {lastActiveText}</span>
          )}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onViewReadOnly}>
          View read-only
        </Button>
        <Button variant="destructive" size="sm" onClick={handleTakeOver} disabled={isPending}>
          {isPending ? 'Taking over...' : `Take over (notify ${assigneeName})`}
        </Button>
      </div>
    </div>
  )
}
