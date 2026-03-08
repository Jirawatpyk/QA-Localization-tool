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
 */
export function useThresholdSubscription(sourceLang: string, targetLang: string): void {
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
      const { data } = await supabase
        .from('language_pair_configs')
        .select('l2_confidence_min, l3_confidence_min')
        .eq('source_lang', sourceLang)
        .eq('target_lang', targetLang)
        .single()

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
  }, [sourceLang, targetLang, updateThresholds, stopPolling])

  useEffect(() => {
    const supabase = createBrowserClient()

    const handleThresholdChange = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new
      const l2 = typeof row.l2_confidence_min === 'number' ? row.l2_confidence_min : null
      const l3 = typeof row.l3_confidence_min === 'number' ? row.l3_confidence_min : null

      if (l2 !== null && l3 !== null) {
        updateThresholds({ l2ConfidenceMin: l2, l3ConfidenceMin: l3 })
        showDebouncedToast()
      }
    }

    const channel = supabase
      .channel(`thresholds:${sourceLang}:${targetLang}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'language_pair_configs',
          filter: `source_lang=eq.${sourceLang}`,
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
  }, [sourceLang, targetLang, updateThresholds, showDebouncedToast, startPolling, stopPolling])
}
