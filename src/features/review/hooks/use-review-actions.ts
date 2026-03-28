import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { acceptFinding } from '@/features/review/actions/acceptFinding.action'
import { flagFinding } from '@/features/review/actions/flagFinding.action'
import { noteFinding } from '@/features/review/actions/noteFinding.action'
import { rejectFinding } from '@/features/review/actions/rejectFinding.action'
import { sourceIssueFinding } from '@/features/review/actions/sourceIssueFinding.action'
import { useFocusManagement } from '@/features/review/hooks/use-focus-management'
import { useReviewStore, getStoreFileState } from '@/features/review/stores/review.store'
import type { UndoEntryAction } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import { announce } from '@/features/review/utils/announce'
import { isAlreadySuppressed, trackRejection } from '@/features/review/utils/pattern-detection'
import type { TrackRejectionResult } from '@/features/review/utils/pattern-detection'
import { getNewState } from '@/features/review/utils/state-transitions'
import type { ReviewAction } from '@/features/review/utils/state-transitions'
import { FINDING_STATUSES } from '@/types/finding'
import type { FindingStatus } from '@/types/finding'

// Map ReviewAction → UndoEntryAction (source → accept is 'source_issue' in undo context)
// confirm_native uses a separate flow (Task 10) but needs an entry for type completeness
const REVIEW_TO_UNDO_ACTION: Record<ReviewAction, UndoEntryAction> = {
  accept: 'accept',
  reject: 'reject',
  flag: 'flag',
  note: 'note',
  source: 'source_issue',
  confirm_native: 'accept', // native confirm resolves to accepted/re_accepted
}

type UseReviewActionsOptions = {
  fileId: string
  projectId: string
  sourceLang?: string | undefined
  targetLang?: string | undefined
  /** Story 5.2a: Whether current user is non-native for this file's target language */
  isNonNative?: boolean | undefined
}

// State-transition actions that use executeReviewAction pattern
type StateTransitionAction = 'accept' | 'reject' | 'flag' | 'note' | 'source'

const ACTION_FN_MAP: Record<
  StateTransitionAction,
  (input: { findingId: string; fileId: string; projectId: string }) => Promise<unknown>
> = {
  accept: acceptFinding,
  reject: rejectFinding,
  flag: flagFinding,
  note: noteFinding,
  source: sourceIssueFinding,
}

type ToastFn = (message: string, data?: Parameters<typeof toast>[1]) => ReturnType<typeof toast>

const ACTION_LABELS: Record<ReviewAction, { past: string; toast: ToastFn }> = {
  accept: { past: 'accepted', toast: toast.success },
  reject: { past: 'rejected', toast: toast },
  flag: { past: 'flagged for review', toast: toast.warning },
  note: { past: 'noted', toast: toast.info },
  source: { past: 'marked as source issue', toast: toast },
  confirm_native: { past: 'confirmed by native reviewer', toast: toast.success },
}

export function useReviewActions({
  fileId,
  projectId,
  sourceLang,
  targetLang,
  isNonNative = false,
}: UseReviewActionsOptions) {
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
      const fs = getStoreFileState(state, fileId)
      const finding = fs.findingsMap.get(findingId)
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
      // Story 5.2a: also set hasNonNativeAction optimistically (we know client-side if user is non-native)
      // CR-R2 C1 fix: snapshot pre-action value for rollback
      const prevHasNonNativeAction = finding.hasNonNativeAction ?? false
      state.setFinding(findingId, {
        ...finding,
        status: newState,
        updatedAt: new Date().toISOString(),
        hasNonNativeAction: finding.hasNonNativeAction || isNonNative,
      })

      inFlightRef.current = true
      setIsInFlight(true)
      setActiveAction(action)
      try {
        // confirm_native uses separate flow (Task 10) — skip executeReviewAction pattern
        if (!(action in ACTION_FN_MAP)) return
        const actionFn = ACTION_FN_MAP[action as StateTransitionAction]
        const result = await (actionFn({ findingId, fileId, projectId }) as Promise<{
          success: boolean
          error?: string
          data?: {
            serverUpdatedAt?: string
            noOp?: boolean
            findingId?: string
            [key: string]: unknown
          }
        }>)

        if (!result.success) {
          // M4 fix: get fresh state before rollback to avoid overwriting Realtime updates
          const currentState = useReviewStore.getState()
          const currentFinding = getStoreFileState(currentState, fileId).findingsMap.get(findingId)
          // Only rollback if the current status is still our optimistic value
          if (currentFinding && currentFinding.status === newState) {
            // CR-R2 C1 fix: restore hasNonNativeAction alongside status
            currentState.setFinding(findingId, {
              ...currentFinding,
              status: currentStatus,
              hasNonNativeAction: prevHasNonNativeAction,
            })
          }
          toast.error(`Action failed: ${result.error}`)
          return
        }

        // H2 fix: replace optimistic updatedAt with server timestamp
        // Prevents client clock skew from permanently blocking future Realtime/poll updates
        const successState = useReviewStore.getState()
        const successFinding = getStoreFileState(successState, fileId).findingsMap.get(findingId)
        if (successFinding && result.data && 'serverUpdatedAt' in result.data) {
          successState.setFinding(findingId, {
            ...successFinding,
            updatedAt: result.data.serverUpdatedAt,
            // Story 5.2a C1 fix: if current user is non-native, badge should appear immediately
            // (server wrote metadata.non_native=true to review_actions — reflect in store)
            hasNonNativeAction: successFinding.hasNonNativeAction || isNonNative,
          })
        }

        // Story 4.4a: Increment override count for single-action re-decisions
        // Skip if server returned no-op (race condition: Realtime already changed state)
        // Only increment if finding already had prior actions (matches Q7 semantic)
        const isNoOp = result.data && 'noOp' in result.data && result.data.noOp === true
        if (!isNoOp && currentStatus !== 'pending') {
          const currentCount = getStoreFileState(successState, fileId).overrideCounts.get(findingId)
          if (currentCount !== undefined) {
            successState.incrementOverrideCount(findingId)
          } else {
            // First override — set count to 1 (Q7 would return actionCount=2, minus 1 = 1)
            successState.setOverrideCount(findingId, 1)
          }
        }

        // Story 4.4b: Push undo entry after successful action
        const undoAction = REVIEW_TO_UNDO_ACTION[action]
        useReviewStore.getState().pushUndo({
          id: crypto.randomUUID(),
          type: 'single',
          action: undoAction,
          findingId,
          batchId: null,
          previousStates: new Map([[findingId, currentStatus]]),
          newStates: new Map([[findingId, newState]]),
          previousSeverity: null,
          newSeverity: null,
          findingSnapshot: null,
          description: `${ACTION_LABELS[action].past} finding`,
          timestamp: Date.now(),
          staleFindings: new Set(),
        })

        // Story 4.6: Pattern detection on reject — track and detect recurring false positives
        if (action === 'reject') {
          const latestState = useReviewStore.getState()
          // R2-L8: guard — skip tracker update if user navigated away during in-flight request
          if (latestState.currentFileId !== fileId) {
            // File switched during await — don't contaminate new file's tracker
          } else {
            // TD-ARCH-002 fix: read activeSuppressions + rejectionTracker from FileState Map,
            // not from flat ReviewState fields — flat fields are stale initial values after refactor
            const latestFs = getStoreFileState(latestState, fileId)
            const findingForDetection: FindingForDisplay = {
              id: findingId,
              segmentId: finding.segmentId ?? null,
              severity: finding.severity,
              originalSeverity: finding.originalSeverity ?? null,
              category: finding.category,
              description: finding.description,
              status: newState,
              detectedByLayer: finding.detectedByLayer,
              aiConfidence: finding.aiConfidence ?? null,
              sourceTextExcerpt: finding.sourceTextExcerpt ?? null,
              targetTextExcerpt: finding.targetTextExcerpt ?? null,
              suggestedFix: finding.suggestedFix ?? null,
              aiModel: finding.aiModel ?? null,
              hasNonNativeAction: finding.hasNonNativeAction ?? false,
            }
            // Use file's language pair passed from ReviewPageClient
            const segSourceLang = sourceLang ?? 'unknown'
            const segTargetLang = targetLang ?? 'unknown'
            // CF-C2 fix: check if finding is already covered by active suppression rule
            // CR-M1 fix: pass fileId for 'file' scope guard in isAlreadySuppressed
            const alreadySuppressed = isAlreadySuppressed(
              latestFs.activeSuppressions,
              findingForDetection,
              segSourceLang,
              segTargetLang,
              fileId,
            )
            if (!alreadySuppressed) {
              // CR-H1 fix: trackRejection returns new tracker (immutable pattern for Zustand)
              const result: TrackRejectionResult = trackRejection(
                latestFs.rejectionTracker,
                findingForDetection,
                segSourceLang,
                segTargetLang,
              )
              latestState.setRejectionTracker(result.tracker)
              if (result.pattern) {
                latestState.setDetectedPattern(result.pattern)
              }
            }
          }
        }

        // Success toast (Task 6.1)
        const label = ACTION_LABELS[action]
        label.toast(`Finding ${label.past}`, { duration: 3000 })

        // Screen reader announcement (Task 6.3 — Guardrail #33: polite)
        const updatedState = useReviewStore.getState()
        const updatedFs = getStoreFileState(updatedState, fileId)
        const statusMap = new Map<string, string>()
        let reviewed = 0
        for (const [id, f] of updatedFs.findingsMap) {
          statusMap.set(id, f.status)
          if (f.status !== 'pending') reviewed++
        }
        announce(`Finding ${label.past}. ${reviewed} of ${updatedFs.findingsMap.size} reviewed`)

        // C1+H3 fix: use sortedFindingIds from store (visual order, includes minor)
        const sortedIds = updatedFs.sortedFindingIds
        const nextPendingId = autoAdvance(sortedIds, statusMap, findingId)

        if (nextPendingId) {
          updatedState.setSelectedFinding(nextPendingId)
        } else {
          // TD-E2E-018 fix: all findings reviewed — clear selectedFinding to close Sheet
          // (Radix Sheet sets aria-hidden on background, blocking action bar focus)
          updatedState.setSelectedFinding(null)
        }
      } catch {
        // M4 fix: fresh state for rollback on unexpected error
        const currentState = useReviewStore.getState()
        const currentFinding = getStoreFileState(currentState, fileId).findingsMap.get(findingId)
        if (currentFinding && currentFinding.status === newState) {
          currentState.setFinding(findingId, {
            ...currentFinding,
            status: currentStatus,
            hasNonNativeAction: prevHasNonNativeAction,
          })
        }
        toast.error('Action failed unexpectedly')
      } finally {
        inFlightRef.current = false
        setIsInFlight(false)
        setActiveAction(null)
      }
    },
    [fileId, projectId, autoAdvance, sourceLang, targetLang, isNonNative],
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

  // Story 4.3: Note action — two-path logic
  // Path 1: not noted → executeAction('note') + auto-advance
  // Path 2: already noted → returns 'open-note-input' for caller to open NoteInput popover
  const handleNote = useCallback(
    (findingId: string): 'open-note-input' | void => {
      const state = useReviewStore.getState()
      const finding = getStoreFileState(state, fileId).findingsMap.get(findingId)
      if (!finding) return

      // Path 2: already noted → open NoteInput (no advance, no state change)
      if (finding.status === 'noted') {
        return 'open-note-input'
      }

      // Path 1: not noted → standard action + auto-advance (Guardrail #13: no void swallowing)
      executeAction(findingId, 'note').catch(() => {
        /* handled by executeAction's own catch */
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fileId read via getState(), stable per mount
    [executeAction],
  )

  // Story 4.3: Source Issue action — auto-advance
  const handleSourceIssue = useCallback(
    (findingId: string) => executeAction(findingId, 'source'),
    [executeAction],
  )

  return {
    handleAccept,
    handleReject,
    handleFlag,
    handleNote,
    handleSourceIssue,
    isActionInFlight: isInFlight,
    activeAction,
  }
}
