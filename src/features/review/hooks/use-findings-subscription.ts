import { useCallback, useEffect, useRef } from 'react'

import { useReviewStore } from '@/features/review/stores/review.store'
import { createBrowserClient } from '@/lib/supabase/client'
import type { DetectedByLayer, Finding, FindingSeverity, FindingStatus } from '@/types/finding'

// ── Burst batching — collect INSERT events and flush as single state update via queueMicrotask ──
type InsertBuffer = {
  findings: Finding[]
  scheduled: boolean
}

const INITIAL_POLL_INTERVAL = 5000
const MAX_POLL_INTERVAL = 60000

function mapRowToFinding(row: Record<string, unknown>): Finding | null {
  const id = typeof row.id === 'string' ? row.id : null
  const severity = typeof row.severity === 'string' ? row.severity : null
  if (!id || !severity) return null

  return {
    id,
    tenantId: typeof row.tenant_id === 'string' ? row.tenant_id : '',
    projectId: typeof row.project_id === 'string' ? row.project_id : '',
    sessionId: typeof row.review_session_id === 'string' ? row.review_session_id : '',
    segmentId: typeof row.segment_id === 'string' ? row.segment_id : '',
    severity: severity as FindingSeverity,
    category: typeof row.category === 'string' ? row.category : '',
    status: (typeof row.status === 'string' ? row.status : 'pending') as FindingStatus,
    description: typeof row.description === 'string' ? row.description : '',
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    fileId: typeof row.file_id === 'string' ? row.file_id : null,
    detectedByLayer: (typeof row.detected_by_layer === 'string'
      ? row.detected_by_layer
      : 'L1') as DetectedByLayer,
    aiModel: typeof row.ai_model === 'string' ? row.ai_model : null,
    aiConfidence: typeof row.ai_confidence === 'number' ? row.ai_confidence : null,
    suggestedFix: typeof row.suggested_fix === 'string' ? row.suggested_fix : null,
    sourceTextExcerpt: typeof row.source_text_excerpt === 'string' ? row.source_text_excerpt : null,
    targetTextExcerpt: typeof row.target_text_excerpt === 'string' ? row.target_text_excerpt : null,
    segmentCount: typeof row.segment_count === 'number' ? row.segment_count : 1,
    scope: (typeof row.scope === 'string' ? row.scope : 'per-file') as 'per-file' | 'cross-file',
    reviewSessionId: typeof row.review_session_id === 'string' ? row.review_session_id : null,
    relatedFileIds: Array.isArray(row.related_file_ids) ? (row.related_file_ids as string[]) : null,
  }
}

/**
 * Subscribe to findings table changes for a specific file via Supabase Realtime.
 * Falls back to polling with exponential backoff on channel error.
 */
export function useFindingsSubscription(fileId: string) {
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollIntervalRef = useRef(INITIAL_POLL_INTERVAL)
  const isPollingRef = useRef(false)
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)
  const insertBufferRef = useRef<InsertBuffer>({ findings: [], scheduled: false })

  const stopPolling = useCallback(() => {
    isPollingRef.current = false
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    pollIntervalRef.current = INITIAL_POLL_INTERVAL
  }, [])

  const startPolling = useCallback(() => {
    isPollingRef.current = true
    pollIntervalRef.current = INITIAL_POLL_INTERVAL

    const poll = async () => {
      if (!isPollingRef.current) return

      const supabase = supabaseRef.current
      if (supabase) {
        try {
          const { data } = await supabase
            .from('findings')
            .select('*')
            .eq('file_id', fileId)
            .order('created_at', { ascending: false })
          if (data && Array.isArray(data)) {
            const newMap = new Map<string, Finding>()
            for (const row of data) {
              const finding = mapRowToFinding(row as Record<string, unknown>)
              if (finding) newMap.set(finding.id, finding)
            }
            useReviewStore.getState().setFindings(newMap)
          }
        } catch {
          // Polling errors are non-fatal — next poll will retry
        }
      }

      if (!isPollingRef.current) return
      pollTimerRef.current = setTimeout(() => {
        pollIntervalRef.current = Math.min(pollIntervalRef.current * 2, MAX_POLL_INTERVAL)
        poll().catch(() => {
          /* best-effort polling */
        })
      }, pollIntervalRef.current)
    }

    poll().catch(() => {
      /* best-effort initial poll */
    })
  }, [fileId])

  useEffect(() => {
    const supabase = createBrowserClient()
    supabaseRef.current = supabase

    // Flush buffered INSERT findings as a single state update (AC7 burst batching)
    const flushInsertBuffer = () => {
      const buf = insertBufferRef.current
      const batch = buf.findings
      buf.findings = []
      buf.scheduled = false
      if (batch.length === 0) return
      const store = useReviewStore.getState()
      const newMap = new Map(store.findingsMap)
      for (const f of batch) {
        newMap.set(f.id, f)
      }
      store.setFindings(newMap)
    }

    const handleInsert = (payload: { new: Record<string, unknown> }) => {
      const finding = mapRowToFinding(payload.new)
      if (!finding) return
      const buf = insertBufferRef.current
      buf.findings.push(finding)
      if (!buf.scheduled) {
        buf.scheduled = true
        queueMicrotask(flushInsertBuffer)
      }
    }

    const handleUpdate = (payload: { new: Record<string, unknown> }) => {
      const finding = mapRowToFinding(payload.new)
      if (finding) {
        useReviewStore.getState().setFinding(finding.id, finding)
      }
    }

    const handleDelete = (payload: { old: Record<string, unknown> }) => {
      const id = typeof payload.old.id === 'string' ? payload.old.id : null
      if (id) {
        useReviewStore.getState().removeFinding(id)
      }
    }

    const channel = supabase
      .channel(`findings:${fileId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'findings',
          filter: `file_id=eq.${fileId}`,
        },
        handleInsert,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'findings',
          filter: `file_id=eq.${fileId}`,
        },
        handleUpdate,
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'findings',
          filter: `file_id=eq.${fileId}`,
        },
        handleDelete,
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          startPolling()
        }
        if (status === 'SUBSCRIBED') {
          stopPolling()
        }
      })

    return () => {
      stopPolling()
      supabase.removeChannel(channel)
    }
  }, [fileId, startPolling, stopPolling])
}
