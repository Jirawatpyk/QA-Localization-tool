import { useCallback, useRef } from 'react'
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
  const inFlightRef = useRef(false)

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

      // Optimistic update
      state.setFinding(findingId, { ...finding, status: newState })

      inFlightRef.current = true
      try {
        const actionFn = ACTION_FN_MAP[action]
        const result = await actionFn({ findingId, fileId, projectId })

        if (!result.success) {
          // Rollback optimistic update
          state.setFinding(findingId, { ...finding, status: currentStatus })
          toast.error(`Action failed: ${result.error}`)
          return
        }

        // Success toast (Task 6.1)
        const label = ACTION_LABELS[action]
        label.toast(`Finding ${label.past}`, { duration: 3000 })

        // Screen reader announcement (Task 6.3 — Guardrail #33: polite)
        const updatedState = useReviewStore.getState()
        const reviewed = [...updatedState.findingsMap.values()].filter(
          (f) => f.status !== 'pending',
        ).length
        const total = updatedState.findingsMap.size
        announce(`Finding ${label.past}. ${reviewed} of ${total} reviewed`)

        // Auto-advance to next Pending finding
        // useFocusManagement().autoAdvance handles rAF internally (Guardrail #32)
        autoAdvance(
          [...updatedState.findingsMap.keys()],
          new Map([...updatedState.findingsMap.entries()].map(([k, v]) => [k, v.status])),
          findingId,
        )
      } catch {
        // Rollback on unexpected error
        state.setFinding(findingId, { ...finding, status: currentStatus })
        toast.error('Action failed unexpectedly')
      } finally {
        inFlightRef.current = false
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
    isActionInFlight: inFlightRef.current,
  }
}
