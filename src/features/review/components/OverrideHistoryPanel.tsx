'use client'

import { ArrowRight, Clock } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { OverrideHistoryEntry } from '@/features/review/actions/getOverrideHistory.action'

export type { OverrideHistoryEntry }

export type OverrideHistoryPanelProps = {
  findingId: string
  projectId: string
  isVisible: boolean
  fetchHistory:
    | ((input: { findingId: string; projectId: string }) => Promise<{
        success: boolean
        data?: OverrideHistoryEntry[]
        error?: string
      }>)
    | undefined
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} min ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function formatState(state: string): string {
  return state.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function OverrideHistoryPanel({
  findingId,
  projectId,
  isVisible,
  fetchHistory,
}: OverrideHistoryPanelProps) {
  const [entries, setEntries] = useState<OverrideHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const doFetch = useCallback(async () => {
    if (!fetchHistory) return
    setIsLoading(true)
    setEntries([]) // Clear stale entries before fetch (H1 fix)
    try {
      const result = await fetchHistory({ findingId, projectId })
      if (result.success && result.data) {
        setEntries(result.data)
      }
    } finally {
      // CR-M1: always clear loading state, even on network error
      setIsLoading(false)
    }
  }, [findingId, projectId, fetchHistory])

  useEffect(() => {
    if (isVisible && findingId && fetchHistory) {
      doFetch().catch(() => {
        // Non-critical — UI degrades gracefully
      })
    }
  }, [isVisible, findingId, doFetch, fetchHistory])

  if (!isVisible) return null

  return (
    <div
      aria-label="Decision history"
      data-testid="override-history-panel"
      className="mt-4 rounded-lg border bg-muted/30 p-3"
    >
      <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
        <Clock className="h-4 w-4" aria-hidden="true" />
        Decision History
      </h4>

      {isLoading && <p className="text-xs text-muted-foreground">Loading history...</p>}

      {!isLoading && entries.length === 0 && (
        <p className="text-xs text-muted-foreground">No history available.</p>
      )}

      {!isLoading && entries.length > 0 && (
        <ul role="list" className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} role="listitem" className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">
                {formatRelativeTime(entry.createdAt)}
              </span>
              <span className="font-medium shrink-0">{formatState(entry.previousState)}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="font-medium shrink-0">{formatState(entry.newState)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
