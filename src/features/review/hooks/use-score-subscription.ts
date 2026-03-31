import { useCallback, useEffect, useRef } from 'react'

import { useReviewStore } from '@/features/review/stores/review.store'
import { createBrowserClient } from '@/lib/supabase/client'
import { SCORE_STATUSES } from '@/types/finding'
import type { LayerCompleted, ScoreStatus } from '@/types/finding'

const INITIAL_POLL_INTERVAL = 5000
const MAX_POLL_INTERVAL = 60000

const SCORE_STATUS_VALUES = new Set<string>(SCORE_STATUSES)

const LAYER_COMPLETED_VALUES = new Set<string>(['L1', 'L1L2', 'L1L2L3'])

function isValidScoreStatus(value: string): value is ScoreStatus {
  return SCORE_STATUS_VALUES.has(value)
}

function isValidLayerCompleted(value: string): value is LayerCompleted {
  return LAYER_COMPLETED_VALUES.has(value)
}

/**
 * Subscribe to scores table changes for a specific file via Supabase Realtime.
 * Falls back to polling with exponential backoff on channel error.
 */
// S4 fix: tenantId is required — Realtime filter MUST include tenant_id for isolation
export function useScoreSubscription(fileId: string, tenantId: string) {
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollIntervalRef = useRef(INITIAL_POLL_INTERVAL)
  const isPollingRef = useRef(false)
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)

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

      // Fetch current score from DB (RLS-protected)
      const supabase = supabaseRef.current
      if (supabase) {
        try {
          // CR-H2: tenantId is required (S4 fix) — always filter by tenant_id
          const { data } = await supabase
            .from('scores')
            .select('mqm_score, status, layer_completed, auto_pass_rationale')
            .eq('file_id', fileId)
            .eq('tenant_id', tenantId)
            .single()
          if (data && isValidScoreStatus(data.status)) {
            // CR-H1: skip write if fileId no longer active (prevents cross-file corruption during transition)
            if (useReviewStore.getState().currentFileId !== fileId) return
            const layerCompleted =
              typeof data.layer_completed === 'string' &&
              isValidLayerCompleted(data.layer_completed)
                ? data.layer_completed
                : null
            const autoPassRationale =
              typeof data.auto_pass_rationale === 'string' ? data.auto_pass_rationale : null
            useReviewStore
              .getState()
              .updateScore(data.mqm_score, data.status, layerCompleted, autoPassRationale)
          }
        } catch {
          // Polling errors are non-fatal — next poll will retry
        }
      }

      if (!isPollingRef.current) return
      // Schedule next poll with exponential backoff, capped at MAX_POLL_INTERVAL
      pollTimerRef.current = setTimeout(() => {
        pollIntervalRef.current = Math.min(pollIntervalRef.current * 2, MAX_POLL_INTERVAL)
        poll().catch(() => {
          /* best-effort polling — next tick will retry */
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

    const handleScoreChange = (payload: { new: Record<string, unknown> }) => {
      // Client-side tenant guard (Realtime filter only supports single column)
      if (payload.new.tenant_id !== tenantId) return
      // CR-H1: skip write if fileId no longer active (prevents cross-file corruption during transition)
      if (useReviewStore.getState().currentFileId !== fileId) return
      const row = payload.new
      const mqm_score = typeof row.mqm_score === 'number' ? row.mqm_score : null
      const status = typeof row.status === 'string' ? row.status : null
      if (mqm_score === null || status === null || !isValidScoreStatus(status)) return
      const layerCompleted =
        typeof row.layer_completed === 'string' && isValidLayerCompleted(row.layer_completed)
          ? row.layer_completed
          : null
      const autoPassRationale =
        typeof row.auto_pass_rationale === 'string' ? row.auto_pass_rationale : null
      useReviewStore.getState().updateScore(mqm_score, status, layerCompleted, autoPassRationale)
    }

    // Supabase Realtime supports single-column filter only (compound silently ignored)
    // Client-side tenant guard in handleScoreChange provides defense-in-depth
    const realtimeFilter = `file_id=eq.${fileId}`

    const channel = supabase
      .channel(`scores:${fileId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scores',
          filter: realtimeFilter,
        },
        handleScoreChange,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scores',
          filter: realtimeFilter,
        },
        handleScoreChange,
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
