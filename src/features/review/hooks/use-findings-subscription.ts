import { useCallback, useEffect, useRef } from 'react'

import { useReviewStore } from '@/features/review/stores/review.store'
import { announce } from '@/features/review/utils/announce'
import { createBrowserClient } from '@/lib/supabase/client'
import { FINDING_STATUSES } from '@/types/finding'
import type { DetectedByLayer, Finding, FindingSeverity, FindingStatus } from '@/types/finding'

// ── Runtime validators (consistent with use-score-subscription.ts isValidScoreStatus pattern) ──
const SEVERITY_VALUES = new Set<string>(['critical', 'major', 'minor'])
const STATUS_VALUES = new Set<string>(FINDING_STATUSES)
const LAYER_VALUES = new Set<string>(['L1', 'L2', 'L3'])
const SCOPE_VALUES = new Set<string>(['per-file', 'cross-file'])

type FindingScope = 'per-file' | 'cross-file'
function isValidScope(value: string): value is FindingScope {
  return SCOPE_VALUES.has(value)
}

function isValidSeverity(value: string): value is FindingSeverity {
  return SEVERITY_VALUES.has(value)
}

function isValidStatus(value: string): value is FindingStatus {
  return STATUS_VALUES.has(value)
}

function isValidLayer(value: string): value is DetectedByLayer {
  return LAYER_VALUES.has(value)
}

// ── Burst batching — collect INSERT events and flush as single state update via queueMicrotask ──
type InsertBuffer = {
  findings: Finding[]
  scheduled: boolean
}

const INITIAL_POLL_INTERVAL = 5000
const MAX_POLL_INTERVAL = 60000

function mapRowToFinding(row: Record<string, unknown>): Finding | null {
  const id = typeof row.id === 'string' ? row.id : null
  const rawSeverity = typeof row.severity === 'string' ? row.severity : null
  if (!id || !rawSeverity || !isValidSeverity(rawSeverity)) return null

  const rawStatus = typeof row.status === 'string' ? row.status : 'pending'
  const status: FindingStatus = isValidStatus(rawStatus) ? rawStatus : 'pending'

  const rawLayer = typeof row.detected_by_layer === 'string' ? row.detected_by_layer : 'L1'
  const detectedByLayer: DetectedByLayer = isValidLayer(rawLayer) ? rawLayer : 'L1'

  return {
    id,
    tenantId: typeof row.tenant_id === 'string' ? row.tenant_id : '',
    projectId: typeof row.project_id === 'string' ? row.project_id : '',
    sessionId: typeof row.review_session_id === 'string' ? row.review_session_id : '',
    segmentId: typeof row.segment_id === 'string' ? row.segment_id : '',
    severity: rawSeverity,
    category: typeof row.category === 'string' ? row.category : '',
    status,
    description: typeof row.description === 'string' ? row.description : '',
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    fileId: typeof row.file_id === 'string' ? row.file_id : null,
    detectedByLayer,
    aiModel: typeof row.ai_model === 'string' ? row.ai_model : null,
    aiConfidence: typeof row.ai_confidence === 'number' ? row.ai_confidence : null,
    suggestedFix: typeof row.suggested_fix === 'string' ? row.suggested_fix : null,
    sourceTextExcerpt: typeof row.source_text_excerpt === 'string' ? row.source_text_excerpt : null,
    targetTextExcerpt: typeof row.target_text_excerpt === 'string' ? row.target_text_excerpt : null,
    segmentCount: typeof row.segment_count === 'number' ? row.segment_count : 1,
    scope: typeof row.scope === 'string' && isValidScope(row.scope) ? row.scope : 'per-file',
    reviewSessionId: typeof row.review_session_id === 'string' ? row.review_session_id : null,
    relatedFileIds: Array.isArray(row.related_file_ids) ? (row.related_file_ids as string[]) : null,
  }
}

/**
 * Subscribe to findings table changes for a specific file via Supabase Realtime.
 * Falls back to polling with exponential backoff on channel error.
 */
export function useFindingsSubscription(fileId: string, tenantId?: string | undefined) {
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
          let query = supabase.from('findings').select('*').eq('file_id', fileId)
          if (tenantId) {
            query = query.eq('tenant_id', tenantId)
          }
          const { data } = await query.order('created_at', { ascending: false })
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
  }, [fileId, tenantId])

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
      // Guardrail #33: polite announcement for new findings
      announce(`${batch.length} new AI finding${batch.length === 1 ? '' : 's'} added`)
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

    // TD-TENANT-003: compound filter with tenant_id when available
    const realtimeFilter = tenantId
      ? `file_id=eq.${fileId}&tenant_id=eq.${tenantId}`
      : `file_id=eq.${fileId}`

    const channel = supabase
      .channel(`findings:${fileId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'findings',
          filter: realtimeFilter,
        },
        handleInsert,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'findings',
          filter: realtimeFilter,
        },
        handleUpdate,
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'findings',
          filter: realtimeFilter,
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
  }, [fileId, tenantId, startPolling, stopPolling])
}
