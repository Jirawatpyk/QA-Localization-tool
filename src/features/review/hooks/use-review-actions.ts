import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { acceptFinding } from '@/features/review/actions/acceptFinding.action'
import { flagFinding } from '@/features/review/actions/flagFinding.action'
import { rejectFinding } from '@/features/review/actions/rejectFinding.action'
import { useFocusManagement } from '@/features/review/hooks/use-focus-management'
import { useReviewStore } from '@/features/review/stores/review.store'
import { announce } from '@/features/review/utils/announce'
import { getNewState } from '@/features/review/utils/state-transitions'
import type { ReviewAction } from '@/features/review/utils/state-transitions'
import { FINDING_STATUSES } from '@/types/finding'
import type { FindingStatus } from '@/types/finding'

type UseReviewActionsOptions = {
  fileId: string
  projectId: string
}

const ACTION_FN_MAP = {
  accept: acceptFinding,
  reject: rejectFinding,
  flag: flagFinding,
} as const

type ToastFn = (message: string, data?: Parameters<typeof toast>[1]) => ReturnType<typeof toast>

const ACTION_LABELS: Record<ReviewAction, { past: string; toast: ToastFn }> = {
  accept: { past: 'accepted', toast: toast.success },
  reject: { past: 'rejected', toast: toast },
  flag: { past: 'flagged for review', toast: toast.warning },
}

export function useReviewActions({ fileId, projectId }: UseReviewActionsOptions) {
  const { autoAdvance } = useFocusManagement()
  // H1 fix: useState for UI-facing loading state (triggers re-render for spinner)
  // Ref kept for synchronous double-click guard (checked before await)
  const inFlightRef = useRef(false)
  const [isInFlight, setIsInFlight] = useState(false)
  // CR-R2-H2: track which action is in-flight for per-button spinner
  const [activeAction, setActiveAction] = useState<ReviewAction | null>(null)

  const executeAction = useCallback(
    async (findingId: string, action: ReviewAction) => {
      // Double-click prevention (Guardrail #13 — avoid swallowed errors)
      if (inFlightRef.current) return

      const state = useReviewStore.getState()
      const finding = state.findingsMap.get(findingId)
      if (!finding) return

      // Runtime verify: store value → validated FindingStatus (Guardrail #3)
      if (!FINDING_STATUSES.includes(finding.status as FindingStatus)) return

      const currentStatus = finding.status as FindingStatus
      const newState = getNewState(action, currentStatus)

      // No-op transition — info toast and skip
      if (newState === null) {
        toast.info(`Finding already ${currentStatus}`)
        return
      }

      // Optimistic update — set updatedAt to NOW so polling merge won't overwrite with stale data
      state.setFinding(findingId, {
        ...finding,
        status: newState,
        updatedAt: new Date().toISOString(),
      })

      inFlightRef.current = true
      setIsInFlight(true)
      setActiveAction(action)
      try {
        const actionFn = ACTION_FN_MAP[action]
        const result = await actionFn({ findingId, fileId, projectId })

        if (!result.success) {
          // M4 fix: get fresh state before rollback to avoid overwriting Realtime updates
          const currentState = useReviewStore.getState()
          const currentFinding = currentState.findingsMap.get(findingId)
          // Only rollback if the current status is still our optimistic value
          if (currentFinding && currentFinding.status === newState) {
            currentState.setFinding(findingId, { ...currentFinding, status: currentStatus })
          }
          toast.error(`Action failed: ${result.error}`)
          return
        }

        // H2 fix: replace optimistic updatedAt with server timestamp
        // Prevents client clock skew from permanently blocking future Realtime/poll updates
        const successState = useReviewStore.getState()
        const successFinding = successState.findingsMap.get(findingId)
        if (successFinding && result.data && 'serverUpdatedAt' in result.data) {
          successState.setFinding(findingId, {
            ...successFinding,
            updatedAt: result.data.serverUpdatedAt,
          })
        }

        // Success toast (Task 6.1)
        const label = ACTION_LABELS[action]
        label.toast(`Finding ${label.past}`, { duration: 3000 })

        // Screen reader announcement (Task 6.3 — Guardrail #33: polite)
        const updatedState = useReviewStore.getState()
        const statusMap = new Map<string, string>()
        let reviewed = 0
        for (const [id, f] of updatedState.findingsMap) {
          statusMap.set(id, f.status)
          if (f.status !== 'pending') reviewed++
        }
        announce(`Finding ${label.past}. ${reviewed} of ${updatedState.findingsMap.size} reviewed`)

        // C1+H3 fix: use sortedFindingIds from store (visual order, includes minor)
        // instead of Map insertion order. FindingList syncs this from its severity-sorted groups.
        // autoAdvance handles rAF DOM focus. setSelectedFinding triggers FindingList's
        // storeSelectedId effect which handles minor accordion expansion (C1 fix).
        const sortedIds = updatedState.sortedFindingIds
        const nextPendingId = autoAdvance(sortedIds, statusMap, findingId)

        if (nextPendingId) {
          updatedState.setSelectedFinding(nextPendingId)
        }
      } catch {
        // M4 fix: fresh state for rollback on unexpected error
        const currentState = useReviewStore.getState()
        const currentFinding = currentState.findingsMap.get(findingId)
        if (currentFinding && currentFinding.status === newState) {
          currentState.setFinding(findingId, { ...currentFinding, status: currentStatus })
        }
        toast.error('Action failed unexpectedly')
      } finally {
        inFlightRef.current = false
        setIsInFlight(false)
        setActiveAction(null)
      }
    },
    [fileId, projectId, autoAdvance],
  )

  const handleAccept = useCallback(
    (findingId: string) => executeAction(findingId, 'accept'),
    [executeAction],
  )

  const handleReject = useCallback(
    (findingId: string) => executeAction(findingId, 'reject'),
    [executeAction],
  )

  const handleFlag = useCallback(
    (findingId: string) => executeAction(findingId, 'flag'),
    [executeAction],
  )

  return {
    handleAccept,
    handleReject,
    handleFlag,
    isActionInFlight: isInFlight,
    activeAction,
  }
}
