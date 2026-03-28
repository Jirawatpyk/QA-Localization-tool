import { useCallback, useEffect, useRef } from 'react'

import { useReviewStore, getStoreFileState } from '@/features/review/stores/review.store'
import { announce } from '@/features/review/utils/announce'
import { createBrowserClient } from '@/lib/supabase/client'
import { DETECTED_BY_LAYERS, FINDING_SEVERITIES, FINDING_STATUSES } from '@/types/finding'
import type { DetectedByLayer, Finding, FindingSeverity, FindingStatus } from '@/types/finding'

// ── Runtime validators — derived from typed const arrays (Guardrail #3) ──
const SEVERITY_VALUES: ReadonlySet<string> = new Set(FINDING_SEVERITIES)
const STATUS_VALUES: ReadonlySet<string> = new Set(FINDING_STATUSES)
const LAYER_VALUES: ReadonlySet<string> = new Set(DETECTED_BY_LAYERS)
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
    originalSeverity:
      typeof row.original_severity === 'string' && isValidSeverity(row.original_severity)
        ? row.original_severity
        : null,
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
            // MERGE poll results with store — don't overwrite optimistic updates.
            // If store has a newer updatedAt (from optimistic update), keep store version.
            const store = useReviewStore.getState()
            // CR-H1: skip write if this subscription's fileId no longer matches active file
            // (prevents stale subscription from corrupting another file's state during <Link> transition)
            if (store.currentFileId !== fileId) return
            const mergedMap = new Map<string, Finding>(getStoreFileState(store, fileId).findingsMap)
            let changed = false
            for (const row of data) {
              const polled = mapRowToFinding(row as Record<string, unknown>)
              if (!polled) continue
              const existing = mergedMap.get(polled.id)
              if (!existing) {
                // New finding from poll — add it
                mergedMap.set(polled.id, polled)
                changed = true
              } else if (polled.updatedAt > existing.updatedAt) {
                // Poll has newer data — authoritative update
                // CR-R2 I1 fix: merge to preserve derived fields (hasNonNativeAction)
                mergedMap.set(polled.id, { ...existing, ...polled })
                changed = true
              }
              // else: store has same or newer data (optimistic) — keep it
            }
            if (changed) {
              store.setFindings(mergedMap)
            }
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
      // CR-H1: skip write if fileId no longer active (prevents cross-file corruption during transition)
      if (store.currentFileId !== fileId) return
      const newMap = new Map(getStoreFileState(store, fileId).findingsMap)
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
      if (!finding) return
      // Merge guard: only apply if Realtime event has newer data than the store.
      // Without this, an out-of-order or delayed UPDATE event (e.g. Supabase
      // Realtime latency on cloud) can overwrite a fresher optimistic update.
      // Pattern mirrors the polling merge (lines 127-130) for consistency.
      const store = useReviewStore.getState()
      // CR-H1: skip write if fileId no longer active
      if (store.currentFileId !== fileId) return
      const existing = getStoreFileState(store, fileId).findingsMap.get(finding.id)
      if (existing && finding.updatedAt <= existing.updatedAt) {
        // Store has same or newer data (e.g. optimistic update) — skip
        return
      }
      // CR-R2 I1 fix: merge over existing to preserve derived fields (hasNonNativeAction)
      // that aren't in the findings DB row. Without this, Realtime UPDATE silently clears the badge.
      if (existing) {
        store.setFinding(finding.id, { ...existing, ...finding })
      } else {
        store.setFinding(finding.id, finding)
      }

      // Story 4.4b AC7: Mark undo entries stale when finding modified by another user
      store.markEntryStale(finding.id)
    }

    const handleDelete = (payload: { old: Record<string, unknown> }) => {
      const id = typeof payload.old.id === 'string' ? payload.old.id : null
      if (id) {
        const store = useReviewStore.getState()
        // CR-H1: skip write if fileId no longer active
        if (store.currentFileId !== fileId) return
        store.removeFinding(id)
        // Story 4.4b AC7: Remove all undo/redo entries referencing deleted finding
        store.removeEntriesForFinding(id)
        announce(`Finding no longer exists`)
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
