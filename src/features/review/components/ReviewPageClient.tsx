'use client'

import { ChevronLeft, ChevronRight, PanelRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScoreBadge } from '@/features/batch/components/ScoreBadge'
import { retryAiAnalysis } from '@/features/pipeline/actions/retryAiAnalysis.action'
import { addFinding } from '@/features/review/actions/addFinding.action'
import { approveFile } from '@/features/review/actions/approveFile.action'
import { bulkAction } from '@/features/review/actions/bulkAction.action'
import { confirmNativeReview } from '@/features/review/actions/confirmNativeReview.action'
import { createSuppressionRule } from '@/features/review/actions/createSuppressionRule.action'
import { deleteFinding } from '@/features/review/actions/deleteFinding.action'
import { getActiveSuppressions } from '@/features/review/actions/getActiveSuppressions.action'
import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { getOverrideHistory } from '@/features/review/actions/getOverrideHistory.action'
import { overrideNativeReview } from '@/features/review/actions/overrideNativeReview.action'
import { overrideSeverity } from '@/features/review/actions/overrideSeverity.action'
import { updateNoteText } from '@/features/review/actions/updateNoteText.action'
import { AddFindingDialog } from '@/features/review/components/AddFindingDialog'
import { AiToggle } from '@/features/review/components/AiToggle'
import { AutoPassRationale } from '@/features/review/components/AutoPassRationale'
import { BulkActionBar } from '@/features/review/components/BulkActionBar'
import { BulkConfirmDialog } from '@/features/review/components/BulkConfirmDialog'
import { CommandPalette } from '@/features/review/components/CommandPalette'
import { ConflictDialog } from '@/features/review/components/ConflictDialog'
import { FileNavigationDropdown } from '@/features/review/components/FileNavigationDropdown'
import { FilterBar } from '@/features/review/components/FilterBar'
import { FindingDetailContent } from '@/features/review/components/FindingDetailContent'
import { FindingDetailSheet } from '@/features/review/components/FindingDetailSheet'
import { FindingList } from '@/features/review/components/FindingList'
import { FlagForNativeDialog } from '@/features/review/components/FlagForNativeDialog'
import { KeyboardCheatSheet } from '@/features/review/components/KeyboardCheatSheet'
import { NoteInput } from '@/features/review/components/NoteInput'
import { ReviewActionBar } from '@/features/review/components/ReviewActionBar'
import { ReviewProgress } from '@/features/review/components/ReviewProgress'
import { ReviewStatusBar } from '@/features/review/components/ReviewStatusBar'
import { SearchInput } from '@/features/review/components/SearchInput'
import { SeverityOverrideMenu } from '@/features/review/components/SeverityOverrideMenu'
import { SuppressPatternDialog } from '@/features/review/components/SuppressPatternDialog'
import { useFindingsSubscription } from '@/features/review/hooks/use-findings-subscription'
import {
  useKeyboardActions,
  useReviewHotkeys,
  useUndoRedoHotkeys,
} from '@/features/review/hooks/use-keyboard-actions'
import {
  useLockGuard,
  useReadOnlyAnnouncer,
  useReadOnlyMode,
} from '@/features/review/hooks/use-read-only-mode'
import { useReviewActions } from '@/features/review/hooks/use-review-actions'
import { useScoreSubscription } from '@/features/review/hooks/use-score-subscription'
import { useThresholdSubscription } from '@/features/review/hooks/use-threshold-subscription'
import { useUndoRedo } from '@/features/review/hooks/use-undo-redo'
import { useViewportTransition } from '@/features/review/hooks/use-viewport-transition'
import {
  useReviewStore,
  useFileState,
  getStoreFileState,
  ReviewFileIdContext,
} from '@/features/review/stores/review.store'
import type { UndoEntry } from '@/features/review/stores/review.store'
import type {
  DetectedPattern,
  FindingForDisplay,
  SuppressionConfig,
  SuppressionRule,
} from '@/features/review/types'
import { mountAnnouncer, unmountAnnouncer } from '@/features/review/utils/announce'
import { saveFilterCache } from '@/features/review/utils/filter-cache'
import { findingMatchesFilters } from '@/features/review/utils/filter-helpers'
import { resetPatternCounter } from '@/features/review/utils/pattern-detection'
import { getNewState } from '@/features/review/utils/state-transitions'
import type {
  Finding,
  FindingSeverity,
  FindingStatus,
  LayerCompleted,
  ScoreBadgeState,
  ScoreStatus,
} from '@/types/finding'

/** M3 fix: Native override picker with proper focus trap + Escape (Guardrail #30) */
function NativeOverrideDialog({
  open,
  onOpenChange,
  onOverride,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOverride: (status: 'accepted' | 'rejected') => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Override Finding</DialogTitle>
          <DialogDescription>Choose the new status for this finding.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 bg-success/10 text-success border-success/20 hover:bg-success/20"
            onClick={() => {
              onOpenChange(false)
              onOverride('accepted')
            }}
          >
            Accept
          </Button>
          <Button
            variant="outline"
            className="flex-1 bg-error/10 text-error border-error/20 hover:bg-error/20"
            onClick={() => {
              onOpenChange(false)
              onOverride('rejected')
            }}
          >
            Reject
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type ReviewPageClientProps = {
  fileId: string
  projectId: string
  tenantId: string
  initialData: FileReviewData
}

function deriveScoreBadgeState(
  layerCompleted: LayerCompleted | null,
  scoreStatus: ScoreStatus | null,
): ScoreBadgeState | undefined {
  // Story 3.5: calculating → analyzing (spinner state)
  if (scoreStatus === 'calculating') return 'analyzing'
  // Partial status takes priority over layer-derived state (PM-B finding)
  if (scoreStatus === 'partial') return 'partial'
  if (!layerCompleted) return undefined
  if (layerCompleted === 'L1') return 'rule-only'
  if (layerCompleted === 'L1L2') return 'ai-screened'
  if (layerCompleted === 'L1L2L3') return 'deep-analyzed'
  return undefined
}

/** Score statuses that allow manual approval */
const APPROVABLE_STATUSES = new Set<ScoreStatus>(['calculated', 'overridden'])

export function ReviewPageClient({
  fileId,
  projectId,
  tenantId,
  initialData,
}: ReviewPageClientProps) {
  const isReadOnly = useReadOnlyMode()
  const { selfAssignIfNeeded } = useLockGuard()
  const announceReadOnly = useReadOnlyAnnouncer() // H9: a11y feedback for SR users
  const resetForFile = useReviewStore((s) => s.resetForFile)
  const setFilter = useReviewStore((s) => s.setFilter)
  const setFindings = useReviewStore((s) => s.setFindings)
  const findingsMap = useFileState((fs) => fs.findingsMap, fileId)
  const currentScore = useFileState((fs) => fs.currentScore, fileId)
  const layerCompleted = useFileState((fs) => fs.layerCompleted, fileId)
  const scoreStatus = useFileState((fs) => fs.scoreStatus, fileId)
  const updateScore = useReviewStore((s) => s.updateScore)
  const storeL2ConfidenceMin = useFileState((fs) => fs.l2ConfidenceMin, fileId)
  const storeL3ConfidenceMin = useFileState((fs) => fs.l3ConfidenceMin, fileId)
  const selectedId = useFileState((fs) => fs.selectedId, fileId)
  const setSelectedFinding = useReviewStore((s) => s.setSelectedFinding)

  // Story 4.5: Filter + Search + AI toggle state from store
  const filterState = useFileState((fs) => fs.filterState, fileId)
  const searchQuery = useFileState((fs) => fs.searchQuery, fileId)
  const aiSuggestionsEnabled = useFileState((fs) => fs.aiSuggestionsEnabled, fileId)

  // Responsive viewport transition hook — consolidates all layout state + callbacks
  const {
    layoutMode,
    isDesktop,
    isAsideMode,
    sheetOpen,
    showToggleButton,
    detailFindingId,
    handleFindingSelect,
    handleNavigateAway,
    handleSheetChange,
    handleToggleDrawer,
    handleActiveFindingChange,
    activeFindingIdRef,
    activeFindingState,
    selectedIdFromClickRef,
  } = useViewportTransition({
    setSelectedFinding,
    selectedId,
  })

  // S-FIX-4: Collapse toggle for compact (1024-1279px) detail panel
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const showCollapseToggle = layoutMode === 'compact'
  // Auto-uncollapse when leaving compact range
  const [prevLayoutMode, setPrevLayoutMode] = useState(layoutMode)
  if (prevLayoutMode !== layoutMode) {
    setPrevLayoutMode(layoutMode)
    if (layoutMode !== 'compact' && detailCollapsed) {
      setDetailCollapsed(false)
    }
  }

  // Mount announcer for screen reader (Guardrail #33 — pre-exist in DOM)
  useEffect(() => {
    mountAnnouncer()
    return () => {
      unmountAnnouncer()
    }
  }, [])

  // Wire review actions hook (Story 4.2 + 4.3)
  const {
    handleAccept,
    handleReject,
    handleFlag,
    handleNote,
    handleSourceIssue,
    isActionInFlight,
    activeAction,
  } = useReviewActions({
    fileId,
    projectId,
    sourceLang: initialData.sourceLang,
    targetLang: initialData.targetLang ?? undefined,
    isNonNative: initialData.isNonNative,
  })

  // Story 4.4a: Bulk selection state from store
  const selectedIds = useFileState((fs) => fs.selectedIds, fileId)
  const selectionMode = useFileState((fs) => fs.selectionMode, fileId)
  const isBulkInFlight = useFileState((fs) => fs.isBulkInFlight, fileId)
  const clearSelection = useReviewStore((s) => s.clearSelection)
  const setSelectionMode = useReviewStore((s) => s.setSelectionMode)
  const setBulkInFlight = useReviewStore((s) => s.setBulkInFlight)

  // Story 4.5: Command palette state
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // Story 4.5: Ctrl+K global handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Story 5.2c: Native reviewer state
  const isNativeReviewer = initialData.userRole === 'native_reviewer'
  const [flagDialogOpen, setFlagDialogOpen] = useState(false)
  const [flagDialogFindingId, setFlagDialogFindingId] = useState<string | null>(null)
  // CR-R2 P0-2: native override status picker state
  const [nativeOverridePickerOpen, setNativeOverridePickerOpen] = useState(false)

  // Story 4.4a: Bulk confirm dialog state
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkConfirmAction, setBulkConfirmAction] = useState<'accept' | 'reject'>('accept')
  const [activeBulkAction, setActiveBulkAction] = useState<'accept' | 'reject' | null>(null)

  // Story 4.4a: Bulk action handlers
  const executeBulk = useCallback(
    async (action: 'accept' | 'reject') => {
      const store = useReviewStore.getState()
      // TD-ARCH-002: read from fileStates Map only (flat fields removed)
      const fs = getStoreFileState(store, fileId)
      const currentSelectedIds = fs.selectedIds
      const currentFindingsMap = fs.findingsMap
      const ids = [...currentSelectedIds]
      if (ids.length === 0) return

      setBulkInFlight(true)
      setActiveBulkAction(action)

      // Task 13: Optimistic update — snapshot + batch update
      const snapshots = new Map<string, Finding>()
      for (const id of ids) {
        const f = currentFindingsMap.get(id)
        if (f) snapshots.set(id, f)
      }

      // Optimistic: update all findings in store (CR-H3: static import, no dynamic chunk risk)
      for (const id of ids) {
        const f = snapshots.get(id)
        if (!f) continue
        const newState = getNewState(action, f.status)
        if (newState) {
          // CR-R2 C2 fix: merge hasNonNativeAction for bulk optimistic (same as single-action path)
          store.setFinding(id, {
            ...f,
            status: newState,
            updatedAt: new Date().toISOString(),
            hasNonNativeAction: f.hasNonNativeAction || initialData.isNonNative,
          })
        }
      }

      try {
        const result = await bulkAction({ findingIds: ids, action, fileId, projectId })

        if (result.success) {
          // Sync server timestamps (H2 fix pattern)
          for (const pf of result.data.processedFindings) {
            const current = getStoreFileState(useReviewStore.getState(), fileId).findingsMap.get(
              pf.findingId,
            )
            if (current) {
              // CR-R2 C2 fix: preserve hasNonNativeAction in success sync
              useReviewStore.getState().setFinding(pf.findingId, {
                ...current,
                updatedAt: pf.serverUpdatedAt,
                hasNonNativeAction: current.hasNonNativeAction || initialData.isNonNative,
              })
            }
            // Increment override count (matches Q7 semantic: overrideCount = actionCount - 1)
            // Only for re-decisions (previousState !== 'pending' = finding was already acted on)
            if (pf.previousState !== 'pending') {
              const currentCount = getStoreFileState(
                useReviewStore.getState(),
                fileId,
              ).overrideCounts.get(pf.findingId)
              if (currentCount !== undefined) {
                useReviewStore.getState().incrementOverrideCount(pf.findingId)
              } else {
                useReviewStore.getState().setOverrideCount(pf.findingId, 1)
              }
            }
          }
          // CR-H1: Rollback optimistic updates for skipped findings (not found in DB / concurrent delete)
          for (const skippedId of result.data.skippedIds) {
            const snap = snapshots.get(skippedId)
            if (snap) {
              const current = getStoreFileState(useReviewStore.getState(), fileId).findingsMap.get(
                skippedId,
              )
              // Only rollback if store still has our optimistic value (Realtime hasn't overwritten)
              const optimisticStatus = getNewState(action, snap.status)
              if (current && optimisticStatus && current.status === optimisticStatus) {
                useReviewStore.getState().setFinding(skippedId, snap)
              }
            }
          }
          const processed = result.data.processedCount
          const verb = action === 'accept' ? 'accepted' : 'rejected'
          toast.success(`${processed} finding${processed !== 1 ? 's' : ''} ${verb}`)

          // Story 4.4b: Push undo entry for bulk action
          const previousStates = new Map<string, FindingStatus>()
          const newStates = new Map<string, FindingStatus>()
          for (const pf of result.data.processedFindings) {
            previousStates.set(pf.findingId, pf.previousState as FindingStatus)
            newStates.set(pf.findingId, pf.newState as FindingStatus)
          }
          if (previousStates.size > 0) {
            useReviewStore.getState().pushUndo({
              id: crypto.randomUUID(),
              type: 'bulk',
              action,
              findingId: null,
              batchId: result.data.batchId,
              previousStates,
              newStates,
              previousSeverity: null,
              newSeverity: null,
              findingSnapshot: null,
              description: `Bulk ${verb} (${processed} findings)`,
              timestamp: Date.now(),
              staleFindings: new Set(),
            })
          }

          // Clear selection
          clearSelection()
          setSelectionMode('single')
        } else {
          // Rollback optimistic updates
          for (const [id, snap] of snapshots) {
            const current = getStoreFileState(useReviewStore.getState(), fileId).findingsMap.get(id)
            if (current) {
              useReviewStore.getState().setFinding(id, snap)
            }
          }
          toast.error(result.error ?? 'Bulk operation failed')
        }
      } finally {
        setBulkInFlight(false)
        setActiveBulkAction(null)
      }
    },
    [fileId, projectId, clearSelection, setSelectionMode, setBulkInFlight, initialData.isNonNative],
  )

  const handleBulkAccept = useCallback(async () => {
    if (isReadOnly) {
      announceReadOnly('bulk accept') // H9: a11y feedback
      return // S-FIX-7 AC6: read-only guard
    }
    // S-FIX-7 C3 fix: self-assign before bulk mutation
    const outcome = await selfAssignIfNeeded(fileId, projectId)
    if (outcome === 'conflict') return
    if (selectedIds.size > 5) {
      setBulkConfirmAction('accept')
      setBulkConfirmOpen(true)
    } else {
      executeBulk('accept').catch(() => toast.error('Bulk accept failed'))
    }
  }, [
    selectedIds.size,
    executeBulk,
    isReadOnly,
    selfAssignIfNeeded,
    fileId,
    projectId,
    announceReadOnly,
  ])

  const handleBulkReject = useCallback(async () => {
    if (isReadOnly) {
      announceReadOnly('bulk reject') // H9: a11y feedback
      return // S-FIX-7 AC6: read-only guard
    }
    // S-FIX-7 C3 fix: self-assign before bulk mutation
    const outcome = await selfAssignIfNeeded(fileId, projectId)
    if (outcome === 'conflict') return
    if (selectedIds.size > 5) {
      setBulkConfirmAction('reject')
      setBulkConfirmOpen(true)
    } else {
      executeBulk('reject').catch(() => toast.error('Bulk reject failed'))
    }
  }, [
    selectedIds.size,
    executeBulk,
    isReadOnly,
    selfAssignIfNeeded,
    fileId,
    projectId,
    announceReadOnly,
  ])

  const handleClearBulkSelection = useCallback(() => {
    clearSelection()
    setSelectionMode('single')
  }, [clearSelection, setSelectionMode])

  // Selected findings for BulkConfirmDialog severity breakdown
  const selectedFindingsForDialog = useMemo(() => {
    const result: Finding[] = []
    for (const id of selectedIds) {
      const f = findingsMap.get(id)
      if (f) result.push(f)
    }
    return result
  }, [selectedIds, findingsMap])

  // Story 4.3: dialog/popover state
  const [isNoteInputOpen, setIsNoteInputOpen] = useState(false)
  const [isOverrideMenuOpen, setIsOverrideMenuOpen] = useState(false)
  const [isAddFindingDialogOpen, setIsAddFindingDialogOpen] = useState(false)
  // CR-R1-H2: in-flight guard for override/reset (prevent rapid double-override corruption)
  const overrideInFlightRef = useRef(false)
  // CR-R1-H3: capture findingId at NoteInput open time (prevent stale closure)
  const noteTargetIdRef = useRef<string | null>(null)

  // CR-C1: activeFindingIdRef, activeFindingState, selectedIdFromClickRef
  // now provided by useViewportTransition hook above

  // handleActiveFindingChange now provided by useViewportTransition hook

  // Viewport transition sync (prevLayoutMode) now handled inside useViewportTransition hook

  // CR-R2 P1-2: shared native confirm handler with stale rollback guard
  const executeNativeConfirm = useCallback(
    async (findingId: string) => {
      if (isReadOnly) return // S-FIX-7 AC6: read-only guard
      // S-FIX-7 C3 fix: self-assign before native confirm mutation
      const lockOutcome = await selfAssignIfNeeded(fileId, projectId)
      if (lockOutcome === 'conflict') return
      const store = useReviewStore.getState()
      const f = getStoreFileState(store, fileId).findingsMap.get(findingId)
      if (!f) return
      const optimisticUpdatedAt = new Date().toISOString()
      store.setFinding(findingId, { ...f, status: 'accepted', updatedAt: optimisticUpdatedAt })
      // CR-R2 F7: Push undo entry (consistent with all other review actions)
      useReviewStore.getState().pushUndo({
        id: crypto.randomUUID(),
        type: 'single',
        action: 'accept',
        findingId,
        batchId: null,
        previousStates: new Map([[findingId, f.status]]),
        newStates: new Map([[findingId, 'accepted' as FindingStatus]]),
        previousSeverity: null,
        newSeverity: null,
        findingSnapshot: null,
        description: 'Confirm native review',
        timestamp: Date.now(),
        staleFindings: new Set(),
      })
      void confirmNativeReview({ findingId, fileId, projectId })
        .then((result) => {
          if (result.success) {
            const curr = getStoreFileState(useReviewStore.getState(), fileId).findingsMap.get(
              findingId,
            )
            if (curr) {
              useReviewStore.getState().setFinding(findingId, {
                ...curr,
                status: result.data.newState,
                updatedAt: result.data.serverUpdatedAt,
                assignmentStatus: 'confirmed',
              })
            }
            toast.success('Finding confirmed')
          } else {
            const curr = getStoreFileState(useReviewStore.getState(), fileId).findingsMap.get(
              findingId,
            )
            if (curr && curr.updatedAt === optimisticUpdatedAt) {
              useReviewStore.getState().setFinding(findingId, f)
            }
            toast.error(result.error ?? 'Confirm failed')
          }
        })
        .catch(() => {
          const curr = getStoreFileState(useReviewStore.getState(), fileId).findingsMap.get(
            findingId,
          )
          if (curr && curr.updatedAt === optimisticUpdatedAt) {
            useReviewStore.getState().setFinding(findingId, f)
          }
          toast.error('Confirm failed')
        })
    },
    [fileId, projectId, isReadOnly, selfAssignIfNeeded],
  )

  // CR-R2 P0-2: shared native override handler with dynamic status
  const executeNativeOverride = useCallback(
    async (findingId: string, newStatus: 'accepted' | 'rejected') => {
      if (isReadOnly) return // S-FIX-7 AC6: read-only guard
      // S-FIX-7 C3 fix: self-assign before native override mutation
      const lockOutcome = await selfAssignIfNeeded(fileId, projectId)
      if (lockOutcome === 'conflict') return
      const store = useReviewStore.getState()
      const f = getStoreFileState(store, fileId).findingsMap.get(findingId)
      if (!f) return
      const optimisticUpdatedAt = new Date().toISOString()
      store.setFinding(findingId, { ...f, status: newStatus, updatedAt: optimisticUpdatedAt })
      // CR-R2 F7: Push undo entry (consistent with all other review actions)
      useReviewStore.getState().pushUndo({
        id: crypto.randomUUID(),
        type: 'single',
        action: newStatus === 'accepted' ? 'accept' : 'reject',
        findingId,
        batchId: null,
        previousStates: new Map([[findingId, f.status]]),
        newStates: new Map([[findingId, newStatus as FindingStatus]]),
        previousSeverity: null,
        newSeverity: null,
        findingSnapshot: null,
        description: `Override native review to ${newStatus}`,
        timestamp: Date.now(),
        staleFindings: new Set(),
      })
      void overrideNativeReview({ findingId, fileId, projectId, newStatus })
        .then((result) => {
          if (result.success) {
            const curr = getStoreFileState(useReviewStore.getState(), fileId).findingsMap.get(
              findingId,
            )
            if (curr) {
              useReviewStore.getState().setFinding(findingId, {
                ...curr,
                status: result.data.newState,
                updatedAt: result.data.serverUpdatedAt,
                assignmentStatus: 'overridden',
              })
            }
            toast.success(`Overridden to ${result.data.newState}`)
          } else {
            // CR-R2 P1-2: check staleness before rollback
            const curr = getStoreFileState(useReviewStore.getState(), fileId).findingsMap.get(
              findingId,
            )
            if (curr && curr.updatedAt === optimisticUpdatedAt) {
              useReviewStore.getState().setFinding(findingId, f)
            }
            toast.error(result.error ?? 'Override failed')
          }
        })
        .catch(() => {
          const curr = getStoreFileState(useReviewStore.getState(), fileId).findingsMap.get(
            findingId,
          )
          if (curr && curr.updatedAt === optimisticUpdatedAt) {
            useReviewStore.getState().setFinding(findingId, f)
          }
          toast.error('Override failed')
        })
    },
    [fileId, projectId, isReadOnly, selfAssignIfNeeded],
  )

  // Register review hotkeys — A/R/F wired to real handlers (Story 4.2)
  // CR-C1: use ref (synchronous, no re-render dependency) for hotkey dispatch
  const getSelectedId = useCallback(() => activeFindingIdRef.current, [activeFindingIdRef])
  // Story 4.3: Note two-path handler for hotkey
  // CR-R1-H3: capture findingId at open time so NoteInput submit uses correct target
  const handleNoteHotkey = useCallback(
    (findingId: string) => {
      const result = handleNote(findingId)
      if (result === 'open-note-input') {
        noteTargetIdRef.current = findingId
        setIsNoteInputOpen(true)
      }
    },
    [handleNote],
  )

  useReviewHotkeys(
    {
      accept: handleAccept,
      reject: handleReject,
      flag: handleFlag,
      note: handleNoteHotkey,
      source: handleSourceIssue,
      override: () => {
        // CR-R1-M2: guard — don't open menu if no finding focused (prevents stale open state)
        if (!activeFindingIdRef.current || isReadOnly) return // S-FIX-7 AC6
        setIsOverrideMenuOpen(true)
      },
      add: () => {
        if (!isReadOnly) setIsAddFindingDialogOpen(true)
      }, // S-FIX-7 AC6
      // CR-R2: use shared handlers (P0-2 status picker + P1-2 stale rollback guard)
      confirmNative: executeNativeConfirm,
      overrideNative: () => {
        if (!activeFindingIdRef.current) return
        // CR-R2 P0-2: open status picker instead of hardcoded 'accepted'
        setNativeOverridePickerOpen(true)
      },
    },
    getSelectedId,
    { readOnly: isReadOnly },
  )

  // Story 4.4a: Bulk keyboard shortcuts — Ctrl+A (select all) + Escape (clear bulk)
  const { register } = useKeyboardActions()

  useEffect(() => {
    const cleanups: Array<() => void> = []

    // Shift+F — Flag for Native Review (opens dialog, QA reviewers only)
    if (!isNativeReviewer) {
      cleanups.push(
        register(
          'shift+f',
          () => {
            if (isReadOnly) return // S-FIX-7 H3: read-only guard
            const findingId = activeFindingIdRef.current
            if (!findingId) return
            setFlagDialogFindingId(findingId)
            setFlagDialogOpen(true)
          },
          {
            scope: 'review',
            description: 'Flag for native review',
            category: 'Review Actions',
          },
        ),
      )
    }

    // Ctrl+A — select all filtered findings (Guardrail #34: only when finding list focused)
    cleanups.push(
      register(
        'ctrl+a',
        () => {
          if (isReadOnly) return // S-FIX-7 H3: read-only guard (no bulk mode in read-only)
          useReviewStore.getState().selectAllFiltered()
        },
        {
          scope: 'review',
          description: 'Select all findings',
          category: 'Bulk',
          preventDefault: true,
        },
      ),
    )

    // Escape — clear bulk selection (Guardrail #31: selection layer)
    cleanups.push(
      register(
        'escape',
        () => {
          const state = useReviewStore.getState()
          const fs = getStoreFileState(state, fileId)
          if (fs.selectionMode === 'bulk' && fs.selectedIds.size > 0) {
            state.clearSelection()
            state.setSelectionMode('single')
          }
        },
        { scope: 'review', description: 'Clear bulk selection', category: 'Bulk' },
      ),
    )

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [register, fileId, isNativeReviewer, activeFindingIdRef, isReadOnly])

  // J/K navigation from review-zone scope (Guardrail #28: review area, not just grid)
  const navigateNextRef = useRef<(() => void) | null>(null)
  const navigatePrevRef = useRef<(() => void) | null>(null)

  // Clear stale refs on file switch (FindingList unmounts → refs point to old callbacks)
  useEffect(() => {
    navigateNextRef.current = null
    navigatePrevRef.current = null
  }, [fileId])

  const handleNavigateReady = useCallback((fns: { next: () => void; prev: () => void }) => {
    navigateNextRef.current = fns.next
    navigatePrevRef.current = fns.prev
  }, [])

  const handleReviewZoneKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // IME guard
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
      // Input guard (Guardrail #28)
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (target.getAttribute('contenteditable') === 'true') return
      // Scope guard: skip when focus is in file navigation (Guardrail #28 — review area only)
      if (target.closest('nav')) return

      const key = e.key.toLowerCase()

      // AC5 / TD-UX-006: Shift+J/K extends selection range (same handler as j/k — Guardrail #28)
      // Uses sortedFindingIds but skips non-visible findings (minor accordion collapsed)
      // Cross-file review P1: must skip hidden minor findings to avoid selecting non-visible rows
      if (e.shiftKey && (key === 'j' || e.key === 'ArrowDown')) {
        e.preventDefault()
        const currentId = activeFindingIdRef.current
        if (!currentId) return
        const fs = getStoreFileState(useReviewStore.getState(), fileId)
        const ids = fs.sortedFindingIds
        const idx = ids.indexOf(currentId)
        // Find next VISIBLE finding by checking DOM (skip hidden minor findings)
        for (let i = idx + 1; i < ids.length; i++) {
          const nextId = ids[i]!
          if (document.querySelector(`[data-finding-id="${CSS.escape(nextId)}"]`)) {
            useReviewStore.getState().selectRange(currentId, nextId)
            break
          }
        }
        return
      }
      if (e.shiftKey && (key === 'k' || e.key === 'ArrowUp')) {
        e.preventDefault()
        const currentId = activeFindingIdRef.current
        if (!currentId) return
        const fs = getStoreFileState(useReviewStore.getState(), fileId)
        const ids = fs.sortedFindingIds
        const idx = ids.indexOf(currentId)
        // Find previous VISIBLE finding by checking DOM
        for (let i = idx - 1; i >= 0; i--) {
          const prevId = ids[i]!
          if (document.querySelector(`[data-finding-id="${CSS.escape(prevId)}"]`)) {
            useReviewStore.getState().selectRange(currentId, prevId)
            break
          }
        }
        return
      }

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        navigateNextRef.current?.()
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        navigatePrevRef.current?.()
      }
    },
    [fileId, activeFindingIdRef],
  )

  // TD-ARCH-001: per-instance init guard (ref) + per-file initialized flag (Map).
  // processedFileIdRef is per-component-instance — ensures each mount initializes once.
  // FileState.initialized is per-file in the Map — used by useFileState consumers.
  const processedFileIdRef = useRef<string | null>(null)

  // Initialize store on fileId change — resetForFile restores filter from sessionStorage (AC3).
  // Filter cache is saved by FileNavigationDropdown before <Link> navigation.
  useEffect(() => {
    // Guard: skip re-init for same file (protects optimistic state from RSC revalidation).
    // CR-H2: read from fileStates Map (not flat findingsMap) to check the correct file's data.
    // Exception: if findingsMap is empty but initialData has findings → data arrived late (F5 fix).
    const fileFs = useReviewStore.getState().fileStates.get(fileId)
    const storeFindingsSize = fileFs?.findingsMap.size ?? 0
    if (
      processedFileIdRef.current === fileId &&
      (storeFindingsSize > 0 || initialData.findings.length === 0)
    ) {
      return
    }
    // CF-1 fix: track whether this is first init (not F5 re-init) for filter override
    // I2 fix: check if store already has this file's state (A→B→A navigation guard)
    // Uses fileStates.has() not currentFileId — currentFileId may point to file B
    const storeAlreadyHasFile = useReviewStore.getState().fileStates.has(fileId)
    const isFirstInit = processedFileIdRef.current !== fileId && !storeAlreadyHasFile
    processedFileIdRef.current = fileId

    resetForFile(fileId)

    // Story 5.2c AC2: native_reviewer's default filter = 'flagged' (scoped view)
    // Only on GENUINE first init — not F5 re-init or return navigation (CF-1 + I2)
    if (isFirstInit && initialData.userRole === 'native_reviewer') {
      setFilter('status', 'flagged')
    }

    const data = initialData

    // Populate initial findings — build batch Map for single store update (M5)
    const initialMap = new Map<string, Finding>()
    for (const f of data.findings) {
      const finding: Finding = {
        ...f,
        originalSeverity: f.originalSeverity ?? null,
        tenantId,
        projectId,
        sessionId: '', // CQ-M3: legacy field — review sessions not yet wired (Story 4.4a)
        status: f.status,
        createdAt: new Date().toISOString(),
        // CF-P0-1: Use real DB updatedAt for Realtime merge guard (was new Date() → all updates dropped)
        updatedAt: f.updatedAt ?? new Date().toISOString(),
        fileId,
        reviewSessionId: null,
        relatedFileIds: null,
      }
      initialMap.set(f.id, finding)
    }
    setFindings(initialMap)

    // Story 4.4a: Populate override counts
    if (data.overrideCounts) {
      useReviewStore
        .getState()
        .setOverrideCounts(new Map(Object.entries(data.overrideCounts).map(([k, v]) => [k, v])))
    }

    // Populate initial score
    if (data.score.mqmScore !== null) {
      updateScore(data.score.mqmScore, data.score.status, data.score.layerCompleted)
    }

    // TD-ARCH-001: Mark file as initialized in the Map
    const updatedState = useReviewStore.getState()
    const currentFs = updatedState.fileStates.get(fileId)
    if (currentFs && !currentFs.initialized) {
      const newFileStates = new Map(updatedState.fileStates)
      newFileStates.set(fileId, { ...currentFs, initialized: true })
      useReviewStore.setState({ fileStates: newFileStates })
    }
    // initialData in deps: effect re-runs on RSC revalidation but processedFileIdRef guard
    // prevents re-initialization for the same file. Only genuine file navigation triggers init.
  }, [fileId, initialData, projectId, tenantId, resetForFile, setFindings, updateScore, setFilter])

  // Story 4.6: Load active suppressions on file load + session cleanup
  const setActiveSuppressions = useReviewStore((s) => s.setActiveSuppressions)
  const activeSuppressions = useFileState((fs) => fs.activeSuppressions, fileId)
  useEffect(() => {
    async function loadSuppressions() {
      const result = await getActiveSuppressions(projectId, fileId)
      if (result.success) {
        setActiveSuppressions(result.data) // May be [] after deactivation — clear is correct
      }
    }
    loadSuppressions().catch(() => {
      /* non-critical — suppressions still work without preload */
    })
  }, [fileId, projectId, setActiveSuppressions])

  // Story 4.6: Session-only suppression cleanup on page unload
  // CQ-H1 fix: only fire on beforeunload (page close/navigation), not visibilitychange (tab switch)
  // Defensive: 24h stale cleanup on file load handles missed cleanups
  const activeSuppressionRef = useRef(activeSuppressions)
  activeSuppressionRef.current = activeSuppressions

  useEffect(() => {
    function deactivateSessionRules() {
      const sessionRuleIds = activeSuppressionRef.current
        .filter((r) => r.duration === 'session' && r.isActive)
        .map((r) => r.id)
      if (sessionRuleIds.length === 0) return
      try {
        const blob = new Blob([JSON.stringify({ ruleIds: sessionRuleIds })], {
          type: 'application/json',
        })
        navigator.sendBeacon('/api/deactivate-session-rules', blob)
      } catch {
        /* non-critical — 24h stale cleanup is defensive fallback */
      }
    }

    window.addEventListener('beforeunload', deactivateSessionRules)
    return () => {
      window.removeEventListener('beforeunload', deactivateSessionRules)
    }
  }, [])

  // BUG-2 fix: Save filter state to sessionStorage on beforeunload + unmount.
  // Without this, F5 refresh / browser back / tab close loses filter state.
  // Uses refs to avoid re-registering the listener on every filter change.
  const filterStateRef = useRef(filterState)
  filterStateRef.current = filterState
  const searchQueryRef = useRef(searchQuery)
  searchQueryRef.current = searchQuery
  const aiSuggestionsEnabledRef = useRef(aiSuggestionsEnabled)
  aiSuggestionsEnabledRef.current = aiSuggestionsEnabled

  useEffect(() => {
    function persistFilterState() {
      saveFilterCache(fileId, {
        filterState: { ...filterStateRef.current },
        searchQuery: searchQueryRef.current,
        aiSuggestionsEnabled: aiSuggestionsEnabledRef.current,
      })
    }

    window.addEventListener('beforeunload', persistFilterState)
    // TD-REVIEW-002 fix: pagehide fires reliably on iOS Safari where beforeunload doesn't
    window.addEventListener('pagehide', persistFilterState)
    return () => {
      window.removeEventListener('beforeunload', persistFilterState)
      window.removeEventListener('pagehide', persistFilterState)
      // Also save on unmount (client-side navigation away from review page)
      persistFilterState()
    }
  }, [fileId])

  // Retry AI analysis state
  const [isPending, startTransition] = useTransition()
  const [retryDispatched, setRetryDispatched] = useState(false)

  // Approve state
  const [isApproving, startApproveTransition] = useTransition()

  // Story 4.4b: Undo/redo + conflict dialog state
  const [conflictOpen, setConflictOpen] = useState(false)
  const [conflictEntry, setConflictEntry] = useState<UndoEntry | null>(null)
  const [conflictFindingId, setConflictFindingId] = useState<string | null>(null)
  const [conflictCurrentState, setConflictCurrentState] = useState<string | null>(null)

  const handleConflict = useCallback(
    (entry: UndoEntry, findingId: string, currentState: string) => {
      setConflictEntry(entry)
      setConflictFindingId(findingId)
      setConflictCurrentState(currentState)
      setConflictOpen(true)
    },
    [],
  )

  const { performUndo, performRedo, forceUndo } = useUndoRedo({
    fileId,
    projectId,
    onConflict: handleConflict,
  })

  // Register Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  useUndoRedoHotkeys({ undo: performUndo, redo: performRedo }, { readOnly: isReadOnly })

  // Wire Realtime subscriptions (TD-TENANT-003: pass tenantId for compound filter)
  useScoreSubscription(fileId, tenantId)
  useFindingsSubscription(fileId, tenantId)
  // Threshold subscription — only if language pair is available
  const sourceLang = initialData.sourceLang
  const targetLang = initialData.targetLang
  useThresholdSubscription(sourceLang, targetLang ?? '', tenantId)

  // Story 4.6: Pattern detection toast + suppress dialog
  const detectedPattern = useFileState((fs) => fs.detectedPattern, fileId)
  const clearDetectedPattern = useReviewStore((s) => s.clearDetectedPattern)
  const addSuppression = useReviewStore((s) => s.addSuppression)
  const [suppressDialogOpen, setSuppressDialogOpen] = useState(false)
  // CF-H2 fix: use ref to avoid race between two simultaneous pattern toasts overwriting state
  const pendingPatternRef = useRef<DetectedPattern | null>(null)
  const [pendingPattern, setPendingPattern] = useState<DetectedPattern | null>(null)

  // Show toast when pattern detected — dismiss on unmount to prevent stale closures
  const patternToastIdRef = useRef<string | number | null>(null)
  useEffect(() => {
    if (!detectedPattern) return
    const patternRef = detectedPattern
    const toastId = toast(
      `Pattern detected: '${patternRef.patternName}' (${patternRef.matchingFindingIds.length} rejects)`,
      {
        duration: Infinity, // persistent — requires user decision
        action: {
          label: 'Suppress this pattern',
          onClick: () => {
            if (isReadOnly) return // S-FIX-7 AC6
            // CF-H2 fix: store in ref (stable) AND state (triggers render)
            pendingPatternRef.current = patternRef
            setPendingPattern(patternRef)
            setSuppressDialogOpen(true)
          },
        },
        cancel: {
          label: 'Keep checking',
          onClick: () => {
            const groupKey = `${patternRef.category}::${patternRef.sourceLang}::${patternRef.targetLang}`
            // CF-C1 fix: read live tracker from store, not stale closure ref
            // CR-H1 fix: resetPatternCounter returns new Map (immutable pattern for Zustand)
            // TD-ARCH-002 fix: read rejectionTracker from FileState Map (flat field is stale)
            const liveState = useReviewStore.getState()
            const liveFs = getStoreFileState(liveState, fileId)
            const newTracker = resetPatternCounter(
              liveFs.rejectionTracker,
              groupKey,
              patternRef.patternName,
            )
            liveState.setRejectionTracker(newTracker)
          },
        },
      },
    )
    patternToastIdRef.current = toastId
    clearDetectedPattern()
    // Use local toastId (not ref) to avoid dismissing a newer toast on cleanup
    return () => {
      toast.dismiss(toastId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fileId stable while dialog open
  }, [detectedPattern, clearDetectedPattern])

  const handleSuppressConfirm = useCallback(
    async (config: SuppressionConfig) => {
      // CF-H2 fix: prefer ref (stable across toast overwrites) over state
      const pattern = pendingPatternRef.current ?? pendingPattern
      if (!pattern) return
      setSuppressDialogOpen(false)
      // CR-M2: always pass sourceLang/targetLang from pattern (even for file/all scope)
      // so feedback_events get real language pair, not 'unknown'
      const result = await createSuppressionRule({
        projectId,
        fileId: config.fileId,
        currentFileId: fileId, // AC3: auto-reject scoped to current file
        category: pattern.category,
        pattern: pattern.keywords.join(', '),
        scope: config.scope,
        duration: config.duration,
        sourceLang: config.sourceLang ?? pattern.sourceLang,
        targetLang: config.targetLang ?? pattern.targetLang,
      })
      if (result.success) {
        const rule: SuppressionRule = {
          id: result.data.ruleId,
          projectId,
          tenantId,
          pattern: pattern.keywords.join(', '),
          category: pattern.category,
          scope: config.scope,
          duration: config.duration,
          reason: 'Auto-generated from pattern detection',
          fileId: config.fileId,
          sourceLang: config.sourceLang,
          targetLang: config.targetLang,
          matchCount: result.data.autoRejectedCount,
          createdBy: '', // TODO(story-5.2): wire userId from auth context
          createdByName: null,
          isActive: true,
          createdAt: new Date().toISOString(),
        }
        addSuppression(rule)
        // CR-L5/IF-1: sync ref immediately (no render-cycle gap for beforeunload)
        activeSuppressionRef.current = [...activeSuppressionRef.current, rule]

        // Production bug fix: update client-side store to reflect server auto-rejects
        // Without this, the UI still shows auto-rejected findings as "pending"
        // CR-H2: use server timestamp (not client clock) to prevent Realtime merge guard drift
        if (result.data.autoRejectedIds.length > 0) {
          const autoRejectedSet = new Set(result.data.autoRejectedIds)
          const updatedAt = result.data.serverUpdatedAt ?? new Date().toISOString()
          const currentState = useReviewStore.getState()
          const currentFs = getStoreFileState(currentState, fileId)
          for (const id of autoRejectedSet) {
            const finding = currentFs.findingsMap.get(id)
            if (finding && finding.status === 'pending') {
              currentState.setFinding(id, {
                ...finding,
                status: 'rejected',
                updatedAt,
              })
            }
          }
        }

        toast.success(
          `Pattern suppressed — ${result.data.autoRejectedCount} findings auto-rejected`,
        )
      } else {
        toast.error(`Suppression failed: ${result.error}`)
      }
      pendingPatternRef.current = null
      setPendingPattern(null)
    },
    [pendingPattern, projectId, fileId, tenantId, addSuppression],
  )

  const handleSuppressCancel = useCallback(() => {
    setSuppressDialogOpen(false)
    pendingPatternRef.current = null // R2-L1: clear ref alongside state
    setPendingPattern(null)
  }, [])

  // Derive display values
  const effectiveScore = currentScore ?? initialData.score.mqmScore
  const effectiveLayerCompleted = layerCompleted ?? initialData.score.layerCompleted
  const effectiveScoreStatus = scoreStatus ?? initialData.score.status
  const badgeState = deriveScoreBadgeState(effectiveLayerCompleted, effectiveScoreStatus)

  // Story 3.5: score lifecycle states
  const isCalculating = effectiveScoreStatus === 'calculating'
  const isAutoPassedStatus = effectiveScoreStatus === 'auto_passed'
  const canApprove = APPROVABLE_STATUSES.has(effectiveScoreStatus) && !isApproving

  // AI pending: L1 completed but AI layers haven't run yet, and file isn't in a terminal failure state
  const isAiPending =
    effectiveLayerCompleted === 'L1' &&
    initialData.file.status !== 'ai_partial' &&
    initialData.file.status !== 'failed' &&
    effectiveScoreStatus !== 'partial'

  // Partial status detection for retry button + warning
  const isPartial = effectiveScoreStatus === 'partial' || initialData.file.status === 'ai_partial'
  const showRetryButton = isPartial && !retryDispatched

  function handleRetry() {
    startTransition(async () => {
      const result = await retryAiAnalysis({ fileId, projectId })
      if (result.success) {
        setRetryDispatched(true)
      }
    })
  }

  function handleApprove() {
    if (isReadOnly) {
      announceReadOnly('approve file') // H9: a11y feedback
      return // S-FIX-7 AC6: read-only guard
    }
    startApproveTransition(async () => {
      // S-FIX-7 C3 fix: self-assign before approve
      const lockOutcome = await selfAssignIfNeeded(fileId, projectId)
      if (lockOutcome === 'conflict') return
      const result = await approveFile({ fileId, projectId })
      if (result.success) {
        toast.success('File approved')
      } else {
        if (result.code === 'SCORE_STALE') {
          toast.error('Score is being recalculated — please wait and retry')
        } else {
          toast.error(result.error ?? 'An unexpected error occurred')
        }
      }
    })
  }

  // Warning text based on which layer failed
  const partialWarningText = useMemo(() => {
    if (!isPartial) return null
    const lc = effectiveLayerCompleted
    if (lc === 'L1L2' && initialData.processingMode === 'thorough') {
      return 'Deep analysis unavailable — showing screening results'
    }
    if (lc === 'L1') {
      return 'AI analysis unavailable — showing rule-based results'
    }
    return null
  }, [isPartial, effectiveLayerCompleted, initialData.processingMode])

  // Convert findings map to array (FindingList handles sorting internally)
  const allFindings = useMemo(() => Array.from(findingsMap.values()), [findingsMap])

  // Convert Finding → FindingForDisplay for FindingList
  const findingsForDisplay: FindingForDisplay[] = useMemo(
    () =>
      allFindings.map((f) => ({
        id: f.id,
        segmentId: f.segmentId,
        severity: f.severity,
        originalSeverity: f.originalSeverity,
        category: f.category,
        description: f.description,
        status: f.status,
        detectedByLayer: f.detectedByLayer,
        aiConfidence: f.aiConfidence,
        sourceTextExcerpt: f.sourceTextExcerpt,
        targetTextExcerpt: f.targetTextExcerpt,
        suggestedFix: f.suggestedFix,
        aiModel: f.aiModel,
        hasNonNativeAction: f.hasNonNativeAction ?? false,
        // Story 5.2c: assignment fields for flagged findings (CR-C2 fix)
        assignmentId: f.assignmentId,
        assignmentStatus: f.assignmentStatus,
        assignedToName: f.assignedToName,
        assignedByName: f.assignedByName,
        flaggerComment: f.flaggerComment,
      })),
    [allFindings],
  )

  // Story 4.5: Client-side filtering (AC2, AC4, AC8)
  const filteredFindings = useMemo(
    () =>
      findingsForDisplay.filter((f) =>
        findingMatchesFilters(f, filterState, searchQuery, aiSuggestionsEnabled),
      ),
    [findingsForDisplay, filterState, searchQuery, aiSuggestionsEnabled],
  )

  // Count findings per severity
  const severityCounts = useMemo(() => {
    const counts: Record<FindingSeverity, number> = { critical: 0, major: 0, minor: 0 }
    for (const f of findingsMap.values()) {
      counts[f.severity] = (counts[f.severity] ?? 0) + 1
    }
    return counts
  }, [findingsMap])

  // Expand/collapse state — local ephemeral UI state
  // Critical findings are pre-populated as expanded
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set<string>())

  // Pre-expand critical findings — "adjust state during render" pattern (React 19)
  // Avoids setState-in-effect which violates react-hooks/set-state-in-effect
  const criticalIdsForExpand = useMemo(
    () => findingsForDisplay.filter((f) => f.severity === 'critical').map((f) => f.id),
    [findingsForDisplay],
  )
  const criticalIdsKey = criticalIdsForExpand.join(',')
  const [prevCriticalIdsKey, setPrevCriticalIdsKey] = useState('')

  if (criticalIdsKey !== prevCriticalIdsKey) {
    setPrevCriticalIdsKey(criticalIdsKey)
    if (criticalIdsForExpand.length > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev)
        for (const id of criticalIdsForExpand) {
          next.add(id)
        }
        return next
      })
    }
  }

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // handleFindingSelect + handleNavigateAway now provided by useViewportTransition hook

  // Reviewed count for ReviewProgress dual-track
  const reviewedCount = useMemo(
    () => allFindings.filter((f) => f.status !== 'pending').length,
    [allFindings],
  )

  // Story 4.3: derive active finding for SeverityOverrideMenu + detail panel
  const activeFinding = activeFindingState ? (findingsMap.get(activeFindingState) ?? null) : null

  // CQ-M2 fix: memoize findingNumber to avoid O(n) findIndex every render
  const activeFindingNumber = useMemo(() => {
    if (!activeFindingState) return undefined
    const idx = findingsForDisplay.findIndex((f) => f.id === activeFindingState)
    return idx >= 0 ? idx + 1 : undefined
  }, [activeFindingState, findingsForDisplay])

  // detailFindingId now provided by useViewportTransition hook
  const selectedFinding = detailFindingId
    ? (findingsForDisplay.find((f) => f.id === detailFindingId) ?? null)
    : null

  // CR-R1-M1: shared delete handler for desktop aside + mobile sheet (DRY)
  const handleDeleteFinding = useCallback(
    async (findingId: string) => {
      if (isReadOnly) {
        announceReadOnly('delete finding') // R2-H5: a11y feedback (same pattern as handleApprove)
        return // S-FIX-7 AC6: read-only guard
      }
      // S-FIX-7 C3 fix: self-assign before delete
      const lockOutcome = await selfAssignIfNeeded(fileId, projectId)
      if (lockOutcome === 'conflict') return
      // Capture snapshot BEFORE server call — Realtime may remove it before .then() runs
      const findingSnapshot = getStoreFileState(useReviewStore.getState(), fileId).findingsMap.get(
        findingId,
      )
      if (!findingSnapshot) {
        toast.error('Finding already removed')
        return
      }
      void deleteFinding({ findingId, fileId, projectId })
        .then((result) => {
          if (result.success) {
            const finding = findingSnapshot
            useReviewStore.getState().removeFinding(findingId)
            handleActiveFindingChange(null)
            // Explicit setSelectedFinding needed for mobile path — handleActiveFindingChange
            // only syncs Zustand selectedId in aside mode (see use-viewport-transition.ts)
            setSelectedFinding(null)
            toast.success('Finding deleted')

            // Story 4.4b: Push undo entry with full snapshot for re-insert
            if (finding) {
              useReviewStore.getState().pushUndo({
                id: crypto.randomUUID(),
                type: 'single',
                action: 'delete',
                findingId,
                batchId: null,
                previousStates: new Map([[findingId, finding.status]]),
                newStates: new Map(),
                previousSeverity: null,
                newSeverity: null,
                findingSnapshot: {
                  id: finding.id,
                  segmentId: finding.segmentId,
                  fileId: finding.fileId ?? fileId,
                  projectId: finding.projectId,
                  tenantId: finding.tenantId,
                  reviewSessionId: finding.reviewSessionId,
                  status: finding.status,
                  severity: finding.severity,
                  originalSeverity: finding.originalSeverity,
                  category: finding.category,
                  description: finding.description,
                  detectedByLayer: finding.detectedByLayer,
                  aiModel: finding.aiModel,
                  aiConfidence: finding.aiConfidence,
                  suggestedFix: finding.suggestedFix,
                  sourceTextExcerpt: finding.sourceTextExcerpt,
                  targetTextExcerpt: finding.targetTextExcerpt,
                  scope: finding.scope,
                  relatedFileIds: finding.relatedFileIds,
                  segmentCount: finding.segmentCount,
                  createdAt: finding.createdAt,
                  updatedAt: finding.updatedAt,
                },
                description: 'Delete finding',
                timestamp: Date.now(),
                staleFindings: new Set(),
              })
            }
          } else {
            toast.error(result.error ?? 'Delete failed')
          }
        })
        .catch(() => toast.error('Delete failed'))
    },
    [
      fileId,
      projectId,
      setSelectedFinding,
      handleActiveFindingChange,
      isReadOnly,
      selfAssignIfNeeded,
      announceReadOnly,
    ],
  )

  // mobileDrawerOpen, showToggleButton, handleToggleDrawer, prevLayoutForSheet,
  // sheetOpen, handleSheetChange — all now provided by useViewportTransition hook

  // TD-ARCH-001: Detect stale instance during <Link> transition.
  // When another instance takes over (different currentFileId), this instance
  // should become invisible + non-interactive so it doesn't block the new one.
  const storeCurrentFileId = useReviewStore((s) => s.currentFileId)
  const isStaleInstance = storeCurrentFileId !== null && storeCurrentFileId !== fileId

  return (
    <ReviewFileIdContext.Provider value={fileId}>
      {/* S-FIX-4: Outer wrapper for 3-zone + status bar layout */}
      <div
        className="flex flex-col h-full"
        data-layout-mode={layoutMode}
        {...(isStaleInstance
          ? {
              style: {
                pointerEvents: 'none' as const,
                opacity: 0,
                position: 'absolute' as const,
                inset: 0,
                zIndex: -1,
              },
              'aria-hidden': true,
            }
          : {})}
      >
        <div
          className="flex flex-1 overflow-hidden"
          data-testid="review-3-zone"
          onKeyDown={handleReviewZoneKeyDown}
        >
          {/* Zone 1: File Navigation — desktop: sidebar, laptop: dropdown, mobile: hidden */}
          {isDesktop && (
            <nav
              aria-label="File navigation"
              className="w-60 border-r shrink-0 overflow-y-auto p-4"
              data-testid="file-sidebar-nav"
            >
              <h2 className="text-sm font-semibold text-muted-foreground mb-2">Files</h2>
              <p className="text-xs text-muted-foreground">File navigation coming soon.</p>
            </nav>
          )}

          {/* Zone 2: Finding List (center) */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* File navigation dropdown — always render for review page navigation */}
            <div className="mb-4">
              <FileNavigationDropdown
                currentFileName={initialData.file.fileName}
                currentFileId={fileId}
                projectId={projectId}
                siblingFiles={initialData.siblingFiles}
              />
            </div>

            {/* Story 5.2c: Native reviewer scoped view banner (AC2) */}
            {isNativeReviewer && initialData.assignedFindingCount > 0 && (
              <div
                className="mb-4 rounded-md border border-info/20 bg-info/10 p-3 text-sm text-info"
                role="status"
              >
                You have access to {initialData.assignedFindingCount} flagged segment
                {initialData.assignedFindingCount !== 1 ? 's' : ''} in this file
              </div>
            )}

            {/* Header: file name + score badge + approve button */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold">{initialData.file.fileName}</h1>
                <p className="text-sm text-muted-foreground mt-1">Project Review</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Score badge with dimming during recalculation */}
                <div
                  aria-live="polite"
                  data-testid="score-live-region"
                  className={isCalculating ? 'opacity-50' : ''}
                  data-recalculating={isCalculating ? 'true' : undefined}
                >
                  <ScoreBadge score={effectiveScore ?? null} size="md" state={badgeState} />
                  {/* Story 4.5 AC8: "AI findings hidden" indicator beside score badge */}
                  {!aiSuggestionsEnabled && (
                    <span
                      data-testid="ai-hidden-indicator"
                      className="text-xs text-muted-foreground ml-2"
                    >
                      AI findings hidden
                    </span>
                  )}
                </div>

                {/* Recalculating badge */}
                {isCalculating && (
                  <Badge variant="outline" className="animate-pulse">
                    Recalculating...
                  </Badge>
                )}

                {/* AI pending indicator */}
                {isAiPending && (
                  <Badge variant="outline" className="text-info border-info/30">
                    AI pending
                  </Badge>
                )}

                {/* Approve button — shown when not auto_passed */}
                {!isAutoPassedStatus && (
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={!canApprove || isReadOnly}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
                  >
                    {isApproving ? 'Approving...' : 'Approve'}
                  </button>
                )}

                {showRetryButton && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium bg-warning/10 text-warning border-warning/20 hover:bg-warning/20 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
                  >
                    {isPending ? 'Retrying...' : 'Retry AI Analysis'}
                  </button>
                )}
              </div>
            </div>

            {/* Auto-pass rationale — shown when auto_passed */}
            {isAutoPassedStatus && initialData.autoPassRationale && (
              <AutoPassRationale rationale={initialData.autoPassRationale} />
            )}

            {/* Partial status warning — container always in DOM per G#33 */}
            <div aria-live="assertive" data-testid="error-live-region">
              {partialWarningText && (
                <p className="text-sm text-warning bg-warning/5 border border-warning/20 rounded-md px-3 py-2">
                  {partialWarningText}
                </p>
              )}
            </div>

            {/* Dual-track progress (Story 4.1a AC3) */}
            <ReviewProgress
              reviewedCount={reviewedCount}
              totalCount={allFindings.length}
              fileStatus={initialData.file.status}
              processingMode={initialData.processingMode}
              layerCompleted={effectiveLayerCompleted}
            />

            {/* Finding count summary */}
            <div data-testid="finding-count-summary" className="flex gap-4 text-sm mt-4">
              <span className="text-severity-critical font-medium">
                Critical: {severityCounts.critical}
              </span>
              <span className="text-severity-major font-medium">Major: {severityCounts.major}</span>
              <span className="text-severity-minor font-medium">Minor: {severityCounts.minor}</span>
              <span className="text-muted-foreground">Total: {findingsMap.size}</span>
            </div>

            {/* Story 4.5: Filter bar + search + AI toggle (AC1, AC2, AC4, AC5, AC8) */}
            <div className="mt-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <FilterBar
                    findings={findingsForDisplay}
                    filteredCount={filteredFindings.length}
                  />
                </div>
                <div className="flex flex-col gap-2 shrink-0 pt-2">
                  <SearchInput />
                  {/* AC8: AI Suggestions toggle */}
                  <AiToggle />
                </div>
              </div>
            </div>

            {/* Findings list — grid role moved to FindingList (Story 4.1b, Guardrail #29, #38) */}
            <div data-testid="finding-list" className="mt-4 space-y-2">
              <FindingList
                findings={filteredFindings}
                expandedIds={expandedIds}
                onToggleExpand={handleToggleExpand}
                onFindingSelect={handleFindingSelect}
                onNavigateAway={handleNavigateAway}
                sourceLang={sourceLang}
                targetLang={targetLang ?? undefined}
                l2ConfidenceMin={storeL2ConfidenceMin ?? initialData.l2ConfidenceMin}
                l3ConfidenceMin={storeL3ConfidenceMin ?? initialData.l3ConfidenceMin}
                onAccept={handleAccept}
                onReject={handleReject}
                isActionInFlight={isActionInFlight}
                onActiveFindingChange={handleActiveFindingChange}
                skipStoreSyncRef={selectedIdFromClickRef}
                onOverrideBadgeClick={(findingId) => {
                  // Select the finding to open detail panel, then auto-show history
                  handleActiveFindingChange(findingId)
                }}
                onNavigateReady={handleNavigateReady}
                searchQuery={searchQuery}
              />
            </div>
            {/* Action Bar (Task 5 — below finding list, hidden when aside visible to avoid duplication) */}
            {!isAsideMode && (
              <ReviewActionBar
                onAccept={() => activeFindingState && handleAccept(activeFindingState)}
                onReject={() => activeFindingState && handleReject(activeFindingState)}
                onFlag={() => {
                  if (!activeFindingState || isReadOnly) return // S-FIX-7 H3: read-only guard
                  // CR-C3 fix: open FlagForNativeDialog for QA reviewers instead of simple flag
                  if (!isNativeReviewer) {
                    setFlagDialogFindingId(activeFindingState)
                    setFlagDialogOpen(true)
                  } else {
                    handleFlag(activeFindingState)
                  }
                }}
                onNote={() => {
                  if (!activeFindingState) return
                  const result = handleNote(activeFindingState)
                  if (result === 'open-note-input') {
                    noteTargetIdRef.current = activeFindingState
                    setIsNoteInputOpen(true)
                  }
                }}
                onSource={() => activeFindingState && handleSourceIssue(activeFindingState)}
                onOverride={() => {
                  if (!activeFindingState) return
                  setIsOverrideMenuOpen(true)
                }}
                onAdd={() => setIsAddFindingDialogOpen(true)}
                isDisabled={!activeFindingState || isActionInFlight || isReadOnly}
                isInFlight={isActionInFlight}
                activeAction={activeAction}
                findingNumber={activeFindingNumber}
                isManualFinding={
                  activeFindingState
                    ? findingsMap.get(activeFindingState)?.detectedByLayer === 'Manual'
                    : false
                }
                isNativeReviewer={isNativeReviewer}
                onConfirmNative={() => {
                  if (activeFindingState) executeNativeConfirm(activeFindingState)
                }}
                onOverrideNative={() => {
                  if (!activeFindingState) return
                  // CR-R2 P0-2: open status picker instead of hardcoded 'accepted'
                  setNativeOverridePickerOpen(true)
                }}
              />
            )}

            {/* Story 4.4a: Bulk selection aria-live announcer (persistent in DOM per Guardrail #33) */}
            <div aria-live="polite" className="sr-only" data-testid="bulk-selection-announcer">
              {selectionMode === 'bulk' && selectedIds.size > 0
                ? `${selectedIds.size} findings selected`
                : selectionMode === 'single'
                  ? 'Selection cleared'
                  : ''}
            </div>

            {/* Story 4.4a: BulkActionBar — visible in bulk mode with selections */}
            {selectionMode === 'bulk' && selectedIds.size > 0 && (
              <BulkActionBar
                selectedCount={selectedIds.size}
                onBulkAccept={handleBulkAccept}
                onBulkReject={handleBulkReject}
                onClearSelection={handleClearBulkSelection}
                isBulkInFlight={isBulkInFlight}
                activeAction={activeBulkAction}
              />
            )}

            {/* Story 4.4a: BulkConfirmDialog — for >5 threshold */}
            <BulkConfirmDialog
              open={bulkConfirmOpen}
              onOpenChange={setBulkConfirmOpen}
              action={bulkConfirmAction}
              selectedFindings={selectedFindingsForDialog}
              totalSelectedCount={selectedIds.size}
              onConfirm={() => {
                executeBulk(bulkConfirmAction).catch(() => toast.error('Bulk operation failed'))
              }}
            />

            {/* Story 4.4b: ConflictDialog for undo conflicts */}
            <ConflictDialog
              open={conflictOpen}
              entry={conflictEntry}
              findingId={conflictFindingId}
              currentState={conflictCurrentState}
              onForceUndo={() => {
                setConflictOpen(false)
                if (conflictEntry) {
                  forceUndo(conflictEntry).catch(() => {
                    /* handled in forceUndo */
                  })
                }
              }}
              onCancel={() => {
                setConflictOpen(false)
                setConflictEntry(null)
              }}
            />

            {/* Story 4.5: Command palette (AC6, AC7, AC10) */}
            <CommandPalette
              open={commandPaletteOpen}
              onOpenChange={setCommandPaletteOpen}
              findings={filteredFindings}
              siblingFiles={initialData.siblingFiles}
              onNavigateToFile={(targetFileId) => {
                // CR-R2 L2: wire file navigation — save filter cache + navigate
                const store = useReviewStore.getState()
                const fs = store.fileStates.get(fileId)
                saveFilterCache(fileId, {
                  filterState: { ...(fs?.filterState ?? store.filterState) },
                  searchQuery: fs?.searchQuery ?? store.searchQuery,
                  aiSuggestionsEnabled: fs?.aiSuggestionsEnabled ?? store.aiSuggestionsEnabled,
                })
                window.location.href = `/projects/${projectId}/review/${targetFileId}`
              }}
              onNavigateToFinding={(id) => handleActiveFindingChange(id)}
              onAction={(action) => {
                if (!activeFindingState) return
                switch (action) {
                  case 'accept':
                    handleAccept(activeFindingState)
                    break
                  case 'reject':
                    handleReject(activeFindingState)
                    break
                  case 'flag':
                    handleFlag(activeFindingState)
                    break
                  case 'note':
                    handleNote(activeFindingState)
                    break
                  case 'source_issue':
                    handleSourceIssue(activeFindingState)
                    break
                }
              }}
            />

            {/* Story 4.3: NoteInput popover (AC1 Path 2) */}
            <NoteInput
              open={isNoteInputOpen}
              disabled={isReadOnly}
              onSubmit={(noteText) => {
                setIsNoteInputOpen(false)
                // CR-R1-H3: use ref-captured findingId from open time, not current activeFindingState
                const targetId = noteTargetIdRef.current
                if (!targetId) return
                void updateNoteText({ findingId: targetId, fileId, projectId, noteText })
                  .then((result) => {
                    if (result.success) toast.success('Note saved')
                    else toast.error(result.error ?? 'Failed to save note')
                  })
                  .catch(() => toast.error('Failed to save note'))
              }}
              onDismiss={() => setIsNoteInputOpen(false)}
            />

            {/* Story 4.3: SeverityOverrideMenu (AC3) */}
            {activeFinding && (
              <SeverityOverrideMenu
                currentSeverity={activeFinding.severity}
                originalSeverity={activeFinding.originalSeverity}
                open={isOverrideMenuOpen}
                onOpenChange={setIsOverrideMenuOpen}
                onOverride={async (newSeverity) => {
                  setIsOverrideMenuOpen(false)
                  if (!activeFindingState || overrideInFlightRef.current) return
                  // S-FIX-7 C3 fix: self-assign before override
                  const lockOutcome = await selfAssignIfNeeded(fileId, projectId)
                  if (lockOutcome === 'conflict') return
                  // Optimistic store update
                  const store = useReviewStore.getState()
                  const f = getStoreFileState(store, fileId).findingsMap.get(activeFindingState)
                  if (f) {
                    store.setFinding(activeFindingState, {
                      ...f,
                      originalSeverity: f.originalSeverity ?? f.severity,
                      severity: newSeverity,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  overrideInFlightRef.current = true
                  void overrideSeverity({
                    findingId: activeFindingState,
                    fileId,
                    projectId,
                    newSeverity,
                  })
                    .then((result) => {
                      if (result.success) {
                        // CR-R1-H4: sync server timestamp to prevent Realtime merge guard rejection
                        const curr = getStoreFileState(
                          useReviewStore.getState(),
                          fileId,
                        ).findingsMap.get(activeFindingState)
                        if (curr) {
                          useReviewStore.getState().setFinding(activeFindingState, {
                            ...curr,
                            updatedAt: result.data.serverUpdatedAt,
                          })
                        }
                        toast.success(`Severity overridden to ${newSeverity}`)

                        // Story 4.4b CR-C1: Push undo entry for severity override (AC3)
                        useReviewStore.getState().pushUndo({
                          id: crypto.randomUUID(),
                          type: 'single',
                          action: 'severity_override',
                          findingId: activeFindingState,
                          batchId: null,
                          previousStates: new Map([[activeFindingState, f?.status ?? 'pending']]),
                          newStates: new Map([[activeFindingState, f?.status ?? 'pending']]),
                          previousSeverity: {
                            severity: f?.severity ?? newSeverity,
                            originalSeverity: f?.originalSeverity ?? null,
                          },
                          newSeverity,
                          findingSnapshot: null,
                          description: `Override severity (${f?.severity ?? '?'} → ${newSeverity})`,
                          timestamp: Date.now(),
                          staleFindings: new Set(),
                        })
                      } else {
                        // Rollback optimistic update
                        if (f) {
                          const curr = getStoreFileState(
                            useReviewStore.getState(),
                            fileId,
                          ).findingsMap.get(activeFindingState)
                          if (curr)
                            useReviewStore.getState().setFinding(activeFindingState, {
                              ...curr,
                              severity: f.severity,
                              originalSeverity: f.originalSeverity,
                            })
                        }
                        toast.error(result.error ?? 'Override failed')
                      }
                    })
                    .catch(() => toast.error('Override failed'))
                    .finally(() => {
                      overrideInFlightRef.current = false
                    })
                }}
                onReset={async () => {
                  setIsOverrideMenuOpen(false)
                  if (!activeFindingState || !activeFinding || overrideInFlightRef.current) return
                  const orig = activeFinding.originalSeverity
                  if (!orig) return
                  // S-FIX-7 C3 fix: self-assign before override reset
                  const lockOutcome = await selfAssignIfNeeded(fileId, projectId)
                  if (lockOutcome === 'conflict') return
                  // Optimistic store update for reset
                  const store = useReviewStore.getState()
                  const f = getStoreFileState(store, fileId).findingsMap.get(activeFindingState)
                  if (f) {
                    store.setFinding(activeFindingState, {
                      ...f,
                      severity: orig,
                      originalSeverity: null,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  overrideInFlightRef.current = true
                  void overrideSeverity({
                    findingId: activeFindingState,
                    fileId,
                    projectId,
                    newSeverity: orig,
                  })
                    .then((result) => {
                      if (result.success) {
                        // CR-R1-H4: sync server timestamp
                        const curr = getStoreFileState(
                          useReviewStore.getState(),
                          fileId,
                        ).findingsMap.get(activeFindingState)
                        if (curr) {
                          useReviewStore.getState().setFinding(activeFindingState, {
                            ...curr,
                            updatedAt: result.data.serverUpdatedAt,
                          })
                        }
                        toast.success('Severity reset to original')

                        // Story 4.4b CR-C1: Push undo entry for severity reset (AC3)
                        useReviewStore.getState().pushUndo({
                          id: crypto.randomUUID(),
                          type: 'single',
                          action: 'severity_override',
                          findingId: activeFindingState,
                          batchId: null,
                          previousStates: new Map([[activeFindingState, f?.status ?? 'pending']]),
                          newStates: new Map([[activeFindingState, f?.status ?? 'pending']]),
                          previousSeverity: {
                            severity: f?.severity ?? orig,
                            originalSeverity: f?.originalSeverity ?? null,
                          },
                          newSeverity: orig,
                          findingSnapshot: null,
                          description: `Reset severity (${f?.severity ?? '?'} → ${orig})`,
                          timestamp: Date.now(),
                          staleFindings: new Set(),
                        })
                      } else {
                        // Rollback
                        if (f) {
                          const curr = getStoreFileState(
                            useReviewStore.getState(),
                            fileId,
                          ).findingsMap.get(activeFindingState)
                          if (curr)
                            useReviewStore.getState().setFinding(activeFindingState, {
                              ...curr,
                              severity: f.severity,
                              originalSeverity: f.originalSeverity,
                            })
                        }
                        toast.error(result.error ?? 'Reset failed')
                      }
                    })
                    .catch(() => toast.error('Reset failed'))
                    .finally(() => {
                      overrideInFlightRef.current = false
                    })
                }}
                trigger={<span className="hidden" />}
              />
            )}

            {/* Story 4.3: AddFindingDialog (AC4) */}
            <AddFindingDialog
              open={isAddFindingDialogOpen}
              onOpenChange={setIsAddFindingDialogOpen}
              segments={initialData.segments}
              categories={initialData.categories}
              defaultSegmentId={
                activeFindingState ? (findingsMap.get(activeFindingState)?.segmentId ?? null) : null
              }
              onSubmit={async (data) => {
                setIsAddFindingDialogOpen(false)
                // S-FIX-7 C3 fix: self-assign before add finding
                const lockOutcome = await selfAssignIfNeeded(fileId, projectId)
                if (lockOutcome === 'conflict') return
                void addFinding({ ...data, fileId, projectId })
                  .then((result) => {
                    if (result.success) {
                      toast.success('Manual finding added')
                      // Add new finding to store so it renders immediately
                      const store = useReviewStore.getState()
                      const newFinding: Finding = {
                        id: result.data.findingId,
                        tenantId,
                        projectId,
                        sessionId: '',
                        segmentId: data.segmentId,
                        severity: result.data.severity,
                        originalSeverity: null,
                        category: result.data.category,
                        status: 'manual',
                        description: result.data.description,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        fileId,
                        detectedByLayer: 'Manual',
                        aiModel: null,
                        aiConfidence: null,
                        suggestedFix: data.suggestion,
                        // H2 fix: populate from segments data to avoid flicker until Realtime arrives
                        sourceTextExcerpt:
                          initialData.segments
                            .find((s) => s.id === data.segmentId)
                            ?.sourceText?.substring(0, 100) ?? null,
                        targetTextExcerpt: null, // target text not available in segments list
                        segmentCount: 1,
                        scope: 'per-file',
                        reviewSessionId: null,
                        relatedFileIds: null,
                      }
                      store.setFinding(result.data.findingId, newFinding)

                      // Story 4.4b: Push undo entry for manual add (CR-C2: include snapshot for redo)
                      store.pushUndo({
                        id: crypto.randomUUID(),
                        type: 'single',
                        action: 'add',
                        findingId: result.data.findingId,
                        batchId: null,
                        previousStates: new Map(),
                        newStates: new Map([[result.data.findingId, 'manual']]),
                        previousSeverity: null,
                        newSeverity: null,
                        findingSnapshot: {
                          id: newFinding.id,
                          segmentId: newFinding.segmentId || null,
                          fileId: newFinding.fileId ?? fileId,
                          projectId,
                          tenantId,
                          reviewSessionId: null,
                          status: 'manual',
                          severity: newFinding.severity,
                          originalSeverity: null,
                          category: newFinding.category,
                          description: newFinding.description,
                          detectedByLayer: 'Manual',
                          aiModel: null,
                          aiConfidence: null,
                          suggestedFix: newFinding.suggestedFix,
                          sourceTextExcerpt: newFinding.sourceTextExcerpt,
                          targetTextExcerpt: null,
                          scope: 'per-file',
                          relatedFileIds: null,
                          segmentCount: 1,
                          createdAt: newFinding.createdAt,
                          updatedAt: newFinding.updatedAt,
                        },
                        description: 'Add manual finding',
                        timestamp: Date.now(),
                        staleFindings: new Set(),
                      })
                    } else {
                      toast.error(result.error ?? 'Failed to add finding')
                    }
                  })
                  .catch(() => toast.error('Failed to add finding'))
              }}
            />
          </div>

          {/* Zone 3: Detail Panel — S-FIX-4: aside at >= 1024px, Sheet at < 1024px */}
          {isAsideMode ? (
            <>
              {/* S-FIX-4 AC1: Collapse toggle button (compact 1024-1279px only) */}
              {showCollapseToggle && (
                <button
                  type="button"
                  onClick={() => setDetailCollapsed((c) => !c)}
                  className="shrink-0 flex items-center justify-center w-5 border-l border-border bg-surface-secondary hover:bg-muted text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
                  aria-label={detailCollapsed ? 'Expand detail panel' : 'Collapse detail panel'}
                  data-testid="detail-panel-collapse-toggle"
                >
                  {detailCollapsed ? (
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              )}
              {!(showCollapseToggle && detailCollapsed) && (
                <aside
                  role="complementary"
                  aria-label="Finding detail"
                  className={`shrink-0 border-l border-border overflow-y-auto ${
                    isDesktop
                      ? 'w-[var(--detail-panel-width)]'
                      : layoutMode === 'laptop'
                        ? 'w-[var(--detail-panel-width-laptop)]'
                        : 'w-[var(--detail-panel-width-tablet)]'
                  }`}
                  data-testid="finding-detail-aside"
                >
                  <div className="p-4">
                    <h2 className="font-semibold text-foreground">Finding Detail</h2>
                    <p className="text-sm text-muted-foreground">
                      Review finding details, segment context, and take actions
                    </p>
                  </div>
                  <FindingDetailContent
                    finding={selectedFinding}
                    sourceLang={sourceLang}
                    targetLang={targetLang ?? ''}
                    fileId={fileId}
                    projectId={projectId}
                    contextRange={undefined}
                    onNavigateToFinding={handleActiveFindingChange}
                    findingNumber={activeFindingNumber}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    onFlag={(id) => {
                      if (isReadOnly) return // S-FIX-7 H3: read-only guard
                      if (!isNativeReviewer) {
                        setFlagDialogFindingId(id)
                        setFlagDialogOpen(true)
                      } else {
                        handleFlag(id)
                      }
                    }}
                    onDelete={handleDeleteFinding}
                    onNote={() => {
                      if (!activeFindingState) return
                      const result = handleNote(activeFindingState)
                      if (result === 'open-note-input') {
                        noteTargetIdRef.current = activeFindingState
                        setIsNoteInputOpen(true)
                      }
                    }}
                    onSource={() => activeFindingState && handleSourceIssue(activeFindingState)}
                    onOverride={() => {
                      if (!activeFindingState) return
                      setIsOverrideMenuOpen(true)
                    }}
                    onAdd={() => setIsAddFindingDialogOpen(true)}
                    fetchOverrideHistory={getOverrideHistory}
                    isActionInFlight={isActionInFlight}
                    activeAction={activeAction}
                    isManualFinding={
                      activeFindingState
                        ? findingsMap.get(activeFindingState)?.detectedByLayer === 'Manual'
                        : false
                    }
                    isNativeReviewer={isNativeReviewer}
                    onConfirmNative={() => {
                      if (activeFindingState) executeNativeConfirm(activeFindingState)
                    }}
                    onOverrideNative={() => {
                      if (!activeFindingState) return
                      setNativeOverridePickerOpen(true)
                    }}
                    isNonNative={initialData.isNonNative}
                    btConfidenceThreshold={initialData.btConfidenceThreshold}
                    assignmentId={selectedFinding?.assignmentId}
                    flaggerComment={selectedFinding?.flaggerComment}
                  />
                </aside>
              )}
            </>
          ) : (
            <FindingDetailSheet
              open={sheetOpen}
              onOpenChange={handleSheetChange}
              finding={selectedFinding}
              sourceLang={sourceLang}
              targetLang={targetLang ?? ''}
              fileId={fileId}
              onNavigateToFinding={handleActiveFindingChange}
              findingNumber={activeFindingNumber}
              onAccept={handleAccept}
              onReject={handleReject}
              onFlag={(id) => {
                if (isReadOnly) return // S-FIX-7 H3: read-only guard
                if (!isNativeReviewer) {
                  setFlagDialogFindingId(id)
                  setFlagDialogOpen(true)
                } else {
                  handleFlag(id)
                }
              }}
              onDelete={handleDeleteFinding}
              onNote={() => {
                if (!activeFindingState) return
                const result = handleNote(activeFindingState)
                if (result === 'open-note-input') {
                  noteTargetIdRef.current = activeFindingState
                  setIsNoteInputOpen(true)
                }
              }}
              onSource={() => activeFindingState && handleSourceIssue(activeFindingState)}
              onOverride={() => {
                if (!activeFindingState) return
                setIsOverrideMenuOpen(true)
              }}
              onAdd={() => setIsAddFindingDialogOpen(true)}
              isActionInFlight={isActionInFlight}
              activeAction={activeAction}
              isManualFinding={
                activeFindingState
                  ? findingsMap.get(activeFindingState)?.detectedByLayer === 'Manual'
                  : false
              }
              isNativeReviewer={isNativeReviewer}
              onConfirmNative={() => {
                if (activeFindingState) executeNativeConfirm(activeFindingState)
              }}
              onOverrideNative={() => {
                if (!activeFindingState) return
                setNativeOverridePickerOpen(true)
              }}
              projectId={projectId}
              fetchOverrideHistory={getOverrideHistory}
              isNonNative={initialData.isNonNative}
              btConfidenceThreshold={initialData.btConfidenceThreshold}
              assignmentId={selectedFinding?.assignmentId}
              flaggerComment={selectedFinding?.flaggerComment}
            />
          )}

          {/* Mobile toggle button — opens drawer when finding selected (< 1024px only) */}
          {showToggleButton && (
            <button
              type="button"
              onClick={handleToggleDrawer}
              className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
              aria-label="Open finding detail"
              data-testid="detail-panel-toggle"
            >
              <PanelRight className="h-5 w-5" aria-hidden="true" />
            </button>
          )}

          {/* Keyboard Cheat Sheet Modal (Ctrl+?) */}
          <KeyboardCheatSheet />

          {/* Story 4.6: Suppress Pattern Dialog */}
          <SuppressPatternDialog
            open={suppressDialogOpen}
            pattern={pendingPattern}
            fileId={fileId}
            onConfirm={handleSuppressConfirm}
            onCancel={handleSuppressCancel}
          />

          {/* Story 5.2c: Flag for Native Dialog (QA reviewers only) */}
          {!isNativeReviewer && flagDialogFindingId && (
            <FlagForNativeDialog
              open={flagDialogOpen}
              onOpenChange={setFlagDialogOpen}
              findingId={flagDialogFindingId}
              fileId={fileId}
              projectId={projectId}
              onSuccess={(data) => {
                if (flagDialogFindingId) {
                  const store = useReviewStore.getState()
                  const f = getStoreFileState(store, fileId).findingsMap.get(flagDialogFindingId)
                  if (f)
                    store.setFinding(flagDialogFindingId, {
                      ...f,
                      status: 'flagged',
                      updatedAt: new Date().toISOString(),
                      // CR-M4 + R2 P0-1: merge assignment data including assignmentId
                      assignmentId: data.assignmentId,
                      assignmentStatus: 'pending',
                      assignedToName: data.assignedToName,
                      flaggerComment: data.flaggerComment,
                    })
                }
              }}
            />
          )}

          {/* M3 fix: Native override picker uses shadcn Dialog (focus trap + Escape per Guardrail #30) */}
          <NativeOverrideDialog
            open={nativeOverridePickerOpen}
            onOpenChange={setNativeOverridePickerOpen}
            onOverride={(status) => {
              if (activeFindingState) {
                executeNativeOverride(activeFindingState, status)
              }
            }}
          />
        </div>

        {/* S-FIX-4 AC2: 32px persistent status bar at bottom of review layout */}
        <ReviewStatusBar
          score={effectiveScore ?? null}
          badgeState={badgeState}
          reviewedCount={reviewedCount}
          totalCount={allFindings.length}
          layerCompleted={effectiveLayerCompleted}
          processingMode={initialData.processingMode}
          isVisible={isAsideMode}
        />
      </div>
    </ReviewFileIdContext.Provider>
  )
}
