'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { getSegmentContext } from '@/features/review/actions/getSegmentContext.action'
import type { SegmentContextData } from '@/features/review/actions/getSegmentContext.action'

export type { SegmentContextData }

type UseSegmentContextParams = {
  fileId: string | null
  segmentId: string | null
  contextRange: number
}

type UseSegmentContextResult = {
  data: SegmentContextData | null
  isLoading: boolean
  error: string | null
  retry: () => void
}

const DEBOUNCE_MS = 150
const MAX_CACHE_SIZE = 50

/**
 * Fetches segment context (current + surrounding segments) for the detail panel.
 * Debounces rapid segmentId changes (J/K navigation), caches results by segmentId+contextRange,
 * and aborts stale requests via AbortController.
 */
export function useSegmentContext({
  fileId,
  segmentId,
  contextRange,
}: UseSegmentContextParams): UseSegmentContextResult {
  const [data, setData] = useState<SegmentContextData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounce triggers a "fetch request" via state, actual fetch in separate effect
  const [fetchRequest, setFetchRequest] = useState<{
    fileId: string
    segmentId: string
    contextRange: number
    attempt: number // increment to re-trigger
  } | null>(null)

  // Cache: segmentId+contextRange → data
  const cacheRef = useRef(new Map<string, SegmentContextData>())
  const abortRef = useRef<AbortController | null>(null)

  // Clear cache on fileId change
  useEffect(() => {
    cacheRef.current.clear()
    setData(null)
    setError(null)
  }, [fileId])

  // Debounce effect: waits DEBOUNCE_MS then sets fetchRequest
  useEffect(() => {
    // Cross-file guard: no fetch when segmentId or fileId is null
    if (!segmentId || !fileId) {
      setData(null)
      setIsLoading(false)
      setError(null)
      setFetchRequest(null)
      return
    }

    const cacheKey = `${segmentId}:${contextRange}`
    const cached = cacheRef.current.get(cacheKey)
    if (cached) {
      setData(cached)
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)

    const timer = setTimeout(() => {
      setFetchRequest((prev) => ({
        fileId,
        segmentId,
        contextRange,
        attempt: (prev?.attempt ?? 0) + 1,
      }))
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [segmentId, fileId, contextRange])

  // Fetch effect: runs when fetchRequest changes
  useEffect(() => {
    if (!fetchRequest) return

    // Abort previous in-flight request
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    let cancelled = false

    const doFetch = async () => {
      try {
        const result = await getSegmentContext({
          fileId: fetchRequest.fileId,
          segmentId: fetchRequest.segmentId,
          contextRange: fetchRequest.contextRange,
        })

        if (cancelled || controller.signal.aborted) return

        const cacheKey = `${fetchRequest.segmentId}:${fetchRequest.contextRange}`
        if (result.success) {
          // Evict oldest entry if cache is full
          if (cacheRef.current.size >= MAX_CACHE_SIZE) {
            const oldestKey = cacheRef.current.keys().next().value as string
            cacheRef.current.delete(oldestKey)
          }
          cacheRef.current.set(cacheKey, result.data)
          setData(result.data)
          setError(null)
        } else {
          setData(null)
          setError(result.error)
        }
      } catch {
        if (cancelled || controller.signal.aborted) return
        // Non-critical: server action already handles structured errors
        // Client-side error logging — pino not available in browser
        setError('Failed to load segment context')
      } finally {
        if (!cancelled && !controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    doFetch().catch(() => {
      // Non-critical — errors handled inside doFetch
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [fetchRequest])

  const retry = useCallback(() => {
    if (!segmentId || !fileId) return
    // Clear cache entry for current segment
    const cacheKey = `${segmentId}:${contextRange}`
    cacheRef.current.delete(cacheKey)
    setError(null)
    setIsLoading(true)
    setData(null)

    // Trigger re-fetch by setting a new fetchRequest directly (bypass debounce)
    setFetchRequest((prev) => ({
      fileId,
      segmentId,
      contextRange,
      attempt: (prev?.attempt ?? 0) + 1,
    }))
  }, [segmentId, fileId, contextRange])

  return { data, isLoading, error, retry }
}
