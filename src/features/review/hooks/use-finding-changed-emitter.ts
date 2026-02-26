'use client'

import { useEffect, useMemo } from 'react'

import { createFindingChangedEmitter } from '@/features/review/utils/finding-changed-emitter'
import type { FindingChangedEventData } from '@/types/pipeline'

/**
 * Thin React wrapper around createFindingChangedEmitter.
 * Calls cancel() on unmount to prevent orphaned timers.
 *
 * IMPORTANT: Wrap triggerFn in useCallback to prevent emitter recreation on every render.
 */
export function useFindingChangedEmitter(
  triggerFn: (data: FindingChangedEventData) => Promise<void>,
) {
  const emitter = useMemo(() => createFindingChangedEmitter(triggerFn), [triggerFn])

  useEffect(() => {
    return () => {
      emitter.cancel()
    }
  }, [emitter])

  return emitter
}
