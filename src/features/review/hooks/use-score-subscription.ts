'use client'

import { useCallback, useEffect, useRef } from 'react'

import { useReviewStore } from '@/features/review/stores/review.store'
import { createBrowserClient } from '@/lib/supabase/client'
import { SCORE_STATUSES } from '@/types/finding'
import type { ScoreStatus } from '@/types/finding'

const INITIAL_POLL_INTERVAL = 5000
const MAX_POLL_INTERVAL = 60000

const SCORE_STATUS_VALUES = new Set<string>(SCORE_STATUSES)

function isValidScoreStatus(value: string): value is ScoreStatus {
  return SCORE_STATUS_VALUES.has(value)
}

/**
 * Subscribe to scores table changes for a specific file via Supabase Realtime.
 * Falls back to polling with exponential backoff on channel error.
 */
export function useScoreSubscription(fileId: string) {
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
          const { data } = await supabase
            .from('scores')
            .select('mqm_score, status')
            .eq('file_id', fileId)
            .single()
          if (data && isValidScoreStatus(data.status)) {
            useReviewStore.getState().updateScore(data.mqm_score, data.status)
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
  }, [fileId])

  useEffect(() => {
    const supabase = createBrowserClient()
    supabaseRef.current = supabase

    const handleScoreUpdate = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new
      const mqm_score = typeof row.mqm_score === 'number' ? row.mqm_score : null
      const status = typeof row.status === 'string' ? row.status : null
      if (mqm_score === null || status === null || !isValidScoreStatus(status)) return
      useReviewStore.getState().updateScore(mqm_score, status)
    }

    const channel = supabase
      .channel(`scores:${fileId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scores',
          filter: `file_id=eq.${fileId}`,
        },
        handleScoreUpdate,
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
