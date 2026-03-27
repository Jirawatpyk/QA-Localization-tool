'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { getBackTranslation } from '@/features/bridge/actions/getBackTranslation.action'
import type { BackTranslationOutput } from '@/features/bridge/types'

type UseBackTranslationOptions = {
  segmentId: string | null
  projectId: string
  skipCache?: boolean | undefined
}

type UseBackTranslationResult = {
  data: BackTranslationOutput | null
  loading: boolean
  error: string | null
  cached: boolean
  refresh: () => void
}

const DEBOUNCE_MS = 300 // Guardrail #53

/**
 * Client hook for fetching back-translation with debounce and abort.
 *
 * Guardrail #53: 300ms debounce on segmentId change
 * Guardrail #75: AbortController + stale guard on segment change.
 * Note: Next.js Server Actions don't accept AbortSignal — abort only prevents
 * client-side state updates. Server-side AI call runs to completion.
 * Budget drain mitigated by 300ms debounce (Guardrail #53) + per-call budget check.
 * Guard: discard result if segmentId !== currentSegmentId (stale guard)
 */
export function useBackTranslation({
  segmentId,
  projectId,
  skipCache = false,
}: UseBackTranslationOptions): UseBackTranslationResult {
  const [data, setData] = useState<BackTranslationOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cached, setCached] = useState(false)

  // Refs for abort and stale prevention
  const abortControllerRef = useRef<AbortController | null>(null)
  const currentSegmentIdRef = useRef<string | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchBT = useCallback(
    async (sid: string, forceSkipCache: boolean) => {
      // Cancel any in-flight request (Guardrail #75)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const controller = new AbortController()
      abortControllerRef.current = controller

      currentSegmentIdRef.current = sid
      setLoading(true)
      setError(null)

      try {
        const result = await getBackTranslation({
          segmentId: sid,
          projectId,
          skipCache: forceSkipCache,
        })

        // Stale guard: discard if segment changed during fetch
        if (currentSegmentIdRef.current !== sid) return
        if (controller.signal.aborted) return

        if (result.success) {
          setData(result.data)
          setCached(result.data.cached)
          setError(null)
        } else {
          setData(null)
          setCached(false)
          setError(result.error)
        }
      } catch (err) {
        // Stale guard
        if (currentSegmentIdRef.current !== sid) return
        if (controller.signal.aborted) return

        setData(null)
        setCached(false)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        // Only clear loading if this is still the current request
        if (currentSegmentIdRef.current === sid && !controller.signal.aborted) {
          setLoading(false)
        }
      }
    },
    [projectId],
  )

  // Debounced fetch on segmentId change (Guardrail #53)
  useEffect(() => {
    // Clear previous debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    // Cancel in-flight (Guardrail #75)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (!segmentId) {
      setData(null)
      setLoading(false)
      setError(null)
      setCached(false)
      currentSegmentIdRef.current = null
      return
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchBT(segmentId, skipCache).catch(() => {
        /* non-critical: handled in fetchBT */
      })
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [segmentId, skipCache, fetchBT])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Manual refresh (bypasses cache)
  const refresh = useCallback(() => {
    if (segmentId) {
      fetchBT(segmentId, true).catch(() => {
        /* non-critical: handled in fetchBT */
      })
    }
  }, [segmentId, fetchBT])

  return { data, loading, error, cached, refresh }
}
