'use client'

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { useReviewStore } from '@/features/review/stores/review.store'
import { createBrowserClient } from '@/lib/supabase/client'

const POLL_INTERVAL = 30_000
const TOAST_DEBOUNCE = 500

/**
 * Subscribe to Realtime changes on language_pair_configs for the given language pair.
 * Falls back to polling when Realtime channel fails.
 * Skips subscription when targetLang is empty (language pair not yet resolved).
 */
export function useThresholdSubscription(
  sourceLang: string,
  targetLang: string,
  tenantId?: string | undefined,
): void {
  const updateThresholds = useReviewStore((s) => s.updateThresholds)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showDebouncedToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = setTimeout(() => {
      toast.success('Confidence thresholds updated')
      toastTimerRef.current = null
    }, TOAST_DEBOUNCE)
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()

    const poll = async () => {
      const supabase = createBrowserClient()
      let query = supabase
        .from('language_pair_configs')
        .select('l2_confidence_min, l3_confidence_min')
        .eq('source_lang', sourceLang)
        .eq('target_lang', targetLang)
      if (tenantId) {
        query = query.eq('tenant_id', tenantId)
      }
      const { data } = await query.single()

      if (data) {
        updateThresholds({
          l2ConfidenceMin: data.l2_confidence_min,
          l3ConfidenceMin: data.l3_confidence_min,
        })
      }
    }

    pollTimerRef.current = setInterval(() => {
      poll().catch(() => {
        /* polling errors are non-fatal */
      })
    }, POLL_INTERVAL)
  }, [sourceLang, targetLang, tenantId, updateThresholds, stopPolling])

  useEffect(() => {
    // L-2: skip subscription when targetLang not yet resolved (null → '' fallback from caller)
    if (!sourceLang || !targetLang) return

    const supabase = createBrowserClient()

    const handleThresholdChange = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new

      // Defense-in-depth: verify targetLang matches (Realtime filter only supports single column)
      // Without this check, EN->JA threshold changes would incorrectly update EN->TH thresholds
      if (row.target_lang !== targetLang) return

      const l2 = typeof row.l2_confidence_min === 'number' ? row.l2_confidence_min : null
      const l3 = typeof row.l3_confidence_min === 'number' ? row.l3_confidence_min : null

      if (l2 !== null && l3 !== null) {
        updateThresholds({ l2ConfidenceMin: l2, l3ConfidenceMin: l3 })
        showDebouncedToast()
      }
    }

    // TD-TENANT-003: compound filter with tenant_id when available
    const realtimeFilter = tenantId
      ? `source_lang=eq.${sourceLang}&tenant_id=eq.${tenantId}`
      : `source_lang=eq.${sourceLang}`

    const channel = supabase
      .channel(`thresholds:${sourceLang}:${targetLang}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'language_pair_configs',
          filter: realtimeFilter,
        },
        handleThresholdChange,
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          startPolling()
        }
      })

    return () => {
      stopPolling()
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
      }
      supabase.removeChannel(channel)
    }
  }, [
    sourceLang,
    targetLang,
    tenantId,
    updateThresholds,
    showDebouncedToast,
    startPolling,
    stopPolling,
  ])
}
