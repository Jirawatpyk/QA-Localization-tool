'use client'

import { PanelRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { ScoreBadge } from '@/features/batch/components/ScoreBadge'
import { retryAiAnalysis } from '@/features/pipeline/actions/retryAiAnalysis.action'
import { addFinding } from '@/features/review/actions/addFinding.action'
import { approveFile } from '@/features/review/actions/approveFile.action'
import { deleteFinding } from '@/features/review/actions/deleteFinding.action'
import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { overrideSeverity } from '@/features/review/actions/overrideSeverity.action'
import { updateNoteText } from '@/features/review/actions/updateNoteText.action'
import { AddFindingDialog } from '@/features/review/components/AddFindingDialog'
import { AutoPassRationale } from '@/features/review/components/AutoPassRationale'
import { FileNavigationDropdown } from '@/features/review/components/FileNavigationDropdown'
import { FindingDetailContent } from '@/features/review/components/FindingDetailContent'
import { FindingDetailSheet } from '@/features/review/components/FindingDetailSheet'
import { FindingList } from '@/features/review/components/FindingList'
import { KeyboardCheatSheet } from '@/features/review/components/KeyboardCheatSheet'
import { NoteInput } from '@/features/review/components/NoteInput'
import { ReviewActionBar } from '@/features/review/components/ReviewActionBar'
import { ReviewProgress } from '@/features/review/components/ReviewProgress'
import { SeverityOverrideMenu } from '@/features/review/components/SeverityOverrideMenu'
import { useFindingsSubscription } from '@/features/review/hooks/use-findings-subscription'
import { useReviewHotkeys } from '@/features/review/hooks/use-keyboard-actions'
import { useReviewActions } from '@/features/review/hooks/use-review-actions'
import { useScoreSubscription } from '@/features/review/hooks/use-score-subscription'
import { useThresholdSubscription } from '@/features/review/hooks/use-threshold-subscription'
import { useReviewStore } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import { mountAnnouncer, unmountAnnouncer } from '@/features/review/utils/announce'
import { useIsDesktop, useIsLaptop } from '@/hooks/useMediaQuery'
import type {
  Finding,
  FindingSeverity,
  LayerCompleted,
  ScoreBadgeState,
  ScoreStatus,
} from '@/types/finding'

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

/** Derive layout mode string for data-layout-mode attribute */
function getLayoutMode(isDesktop: boolean, isLaptop: boolean): 'desktop' | 'laptop' | 'mobile' {
  if (isDesktop) return 'desktop'
  if (isLaptop) return 'laptop'
  return 'mobile'
}

export function ReviewPageClient({
  fileId,
  projectId,
  tenantId,
  initialData,
}: ReviewPageClientProps) {
  const resetForFile = useReviewStore((s) => s.resetForFile)
  const setFindings = useReviewStore((s) => s.setFindings)
  const findingsMap = useReviewStore((s) => s.findingsMap)
  const currentScore = useReviewStore((s) => s.currentScore)
  const layerCompleted = useReviewStore((s) => s.layerCompleted)
  const scoreStatus = useReviewStore((s) => s.scoreStatus)
  const updateScore = useReviewStore((s) => s.updateScore)
  const storeL2ConfidenceMin = useReviewStore((s) => s.l2ConfidenceMin)
  const storeL3ConfidenceMin = useReviewStore((s) => s.l3ConfidenceMin)
  const selectedId = useReviewStore((s) => s.selectedId)
  const setSelectedFinding = useReviewStore((s) => s.setSelectedFinding)

  // Responsive breakpoint hooks
  const isDesktop = useIsDesktop()
  const isLaptop = useIsLaptop()
  const layoutMode = getLayoutMode(isDesktop, isLaptop)

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
  })

  // Story 4.3: dialog/popover state
  const [isNoteInputOpen, setIsNoteInputOpen] = useState(false)
  const [isOverrideMenuOpen, setIsOverrideMenuOpen] = useState(false)
  const [isAddFindingDialogOpen, setIsAddFindingDialogOpen] = useState(false)

  // CR-C1: Track active finding via ref (for hotkeys) + state (for action bar re-render)
  const activeFindingIdRef = useRef<string | null>(null)
  const [activeFindingState, setActiveFindingState] = useState<string | null>(null)
  // Ref to signal FindingList that selectedId change came from row click (not SegmentContext navigation)
  // FindingList's storeSelectedId effect should skip re-setting activeFindingId in this case.
  const selectedIdFromClickRef = useRef(false)

  const handleActiveFindingChange = useCallback(
    (id: string | null) => {
      activeFindingIdRef.current = id
      setActiveFindingState(id)
      // Desktop only: sync selectedId for aside detail panel.
      // Laptop/mobile: do NOT auto-set selectedId — Sheet would open and block finding list.
      // (H3 viewport-resize edge case accepted as TD — users don't resize dev tools in production)
      if (isDesktop) {
        selectedIdFromClickRef.current = true
        setSelectedFinding(id)
        queueMicrotask(() => {
          selectedIdFromClickRef.current = false
        })
      }
    },
    [isDesktop, setSelectedFinding],
  )

  // Story 4.3: selectedId synced from handleActiveFindingChange on all viewports (H3 fix).
  // Infinite loop prevented by skipStoreSyncRef passed to FindingList.

  // Register review hotkeys — A/R/F wired to real handlers (Story 4.2)
  // CR-C1: use ref (synchronous, no re-render dependency) for hotkey dispatch
  const getSelectedId = useCallback(() => activeFindingIdRef.current, [])
  // Story 4.3: Note two-path handler for hotkey
  const handleNoteHotkey = useCallback(
    (findingId: string) => {
      const result = handleNote(findingId)
      if (result === 'open-note-input') {
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
      override: () => setIsOverrideMenuOpen(true),
      add: () => setIsAddFindingDialogOpen(true),
    },
    getSelectedId,
  )

  // Capture initialData on first render only — use a ref so the effect below
  // does NOT re-run when Next.js RSC re-renders with a new initialData reference
  // (e.g. after Server Action cache revalidation). Re-running would overwrite
  // optimistic updates with stale pending state from SSR. (E-R1 root cause fix)
  // H1 fix: track which fileId was last initialized. When fileId changes (file navigation),
  // the effect re-initializes with new initialData. When RSC revalidates (same fileId,
  // new initialData reference), the guard skips re-initialization to protect optimistic state.
  const processedFileIdRef = useRef<string | null>(null)

  // Initialize store on fileId change. initialData is in deps so the effect runs when it
  // changes, but the guard ensures we only process once per unique fileId.
  useEffect(() => {
    if (processedFileIdRef.current === fileId) return // already initialized this file
    processedFileIdRef.current = fileId

    const data = initialData
    resetForFile(fileId)

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
        updatedAt: new Date().toISOString(),
        fileId,
        reviewSessionId: null,
        relatedFileIds: null,
      }
      initialMap.set(f.id, finding)
    }
    setFindings(initialMap)

    // Populate initial score
    if (data.score.mqmScore !== null) {
      updateScore(data.score.mqmScore, data.score.status, data.score.layerCompleted)
    }
    // initialData in deps: effect re-runs on RSC revalidation but processedFileIdRef guard
    // prevents re-initialization for the same file. Only genuine file navigation triggers init.
  }, [fileId, initialData, projectId, tenantId, resetForFile, setFindings, updateScore])

  // Retry AI analysis state
  const [isPending, startTransition] = useTransition()
  const [retryDispatched, setRetryDispatched] = useState(false)

  // Approve state
  const [isApproving, startApproveTransition] = useTransition()

  // Wire Realtime subscriptions (TD-TENANT-003: pass tenantId for compound filter)
  useScoreSubscription(fileId, tenantId)
  useFindingsSubscription(fileId, tenantId)
  // Threshold subscription — only if language pair is available
  const sourceLang = initialData.sourceLang
  const targetLang = initialData.targetLang
  useThresholdSubscription(sourceLang, targetLang ?? '', tenantId)

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
    startApproveTransition(async () => {
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
      })),
    [allFindings],
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

  // Selected finding for detail panel
  // Desktop: derive from activeFindingState (synced via selectedId in handleActiveFindingChange).
  // Laptop/mobile: derive from selectedId (set by autoAdvance or explicit user action).
  const detailFindingId = isDesktop ? activeFindingState : selectedId
  const selectedFinding = detailFindingId
    ? (findingsForDisplay.find((f) => f.id === detailFindingId) ?? null)
    : null

  // Toggle button for mobile drawer (visible when finding selected but sheet closed)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const showToggleButton = !isDesktop && !isLaptop && selectedId !== null && !mobileDrawerOpen

  function handleToggleDrawer() {
    setMobileDrawerOpen(true)
  }

  // Derive Sheet open state for non-desktop: laptop auto-opens on select, mobile uses toggle
  const sheetOpen = isDesktop
    ? false
    : isLaptop
      ? selectedId !== null
      : mobileDrawerOpen && selectedId !== null

  function handleSheetChange(open: boolean) {
    if (!open) {
      if (!isLaptop) {
        setMobileDrawerOpen(false)
      }
      setSelectedFinding(null)
    }
  }

  return (
    <div className="flex h-full" data-testid="review-3-zone" data-layout-mode={layoutMode}>
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
        {/* Laptop dropdown nav — replaces sidebar */}
        {!isDesktop && isLaptop && (
          <div className="mb-4">
            <FileNavigationDropdown currentFileName={initialData.file.fileName} />
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
                disabled={!canApprove}
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

        {/* Findings list — grid role moved to FindingList (Story 4.1b, Guardrail #29, #38) */}
        <div data-testid="finding-list" className="mt-4 space-y-2">
          <FindingList
            findings={findingsForDisplay}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            sourceLang={sourceLang}
            targetLang={targetLang ?? undefined}
            l2ConfidenceMin={storeL2ConfidenceMin ?? initialData.l2ConfidenceMin}
            l3ConfidenceMin={storeL3ConfidenceMin ?? initialData.l3ConfidenceMin}
            onAccept={handleAccept}
            onReject={handleReject}
            isActionInFlight={isActionInFlight}
            onActiveFindingChange={handleActiveFindingChange}
            skipStoreSyncRef={selectedIdFromClickRef}
          />
        </div>
        {/* Action Bar (Task 5 — below finding list) */}
        <ReviewActionBar
          onAccept={() => activeFindingState && handleAccept(activeFindingState)}
          onReject={() => activeFindingState && handleReject(activeFindingState)}
          onFlag={() => activeFindingState && handleFlag(activeFindingState)}
          onNote={() => {
            if (!activeFindingState) return
            const result = handleNote(activeFindingState)
            if (result === 'open-note-input') setIsNoteInputOpen(true)
          }}
          onSource={() => activeFindingState && handleSourceIssue(activeFindingState)}
          onOverride={() => setIsOverrideMenuOpen(true)}
          onAdd={() => setIsAddFindingDialogOpen(true)}
          isDisabled={!activeFindingState || isActionInFlight}
          isInFlight={isActionInFlight}
          activeAction={activeAction}
          findingNumber={activeFindingNumber}
          isManualFinding={
            activeFindingState
              ? findingsMap.get(activeFindingState)?.detectedByLayer === 'Manual'
              : false
          }
        />

        {/* Story 4.3: NoteInput popover (AC1 Path 2) */}
        <NoteInput
          open={isNoteInputOpen}
          onSubmit={(noteText) => {
            setIsNoteInputOpen(false)
            if (!activeFindingState) return
            void updateNoteText({ findingId: activeFindingState, fileId, projectId, noteText })
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
            onOverride={(newSeverity) => {
              setIsOverrideMenuOpen(false)
              if (!activeFindingState) return
              // Optimistic store update
              const store = useReviewStore.getState()
              const f = store.findingsMap.get(activeFindingState)
              if (f) {
                store.setFinding(activeFindingState, {
                  ...f,
                  originalSeverity: f.originalSeverity ?? f.severity,
                  severity: newSeverity,
                  updatedAt: new Date().toISOString(),
                })
              }
              void overrideSeverity({
                findingId: activeFindingState,
                fileId,
                projectId,
                newSeverity,
              })
                .then((result) => {
                  if (result.success) {
                    toast.success(`Severity overridden to ${newSeverity}`)
                  } else {
                    // Rollback optimistic update
                    if (f) {
                      const curr = useReviewStore.getState().findingsMap.get(activeFindingState)
                      if (curr)
                        useReviewStore
                          .getState()
                          .setFinding(activeFindingState, {
                            ...curr,
                            severity: f.severity,
                            originalSeverity: f.originalSeverity,
                          })
                    }
                    toast.error(result.error ?? 'Override failed')
                  }
                })
                .catch(() => toast.error('Override failed'))
            }}
            onReset={() => {
              setIsOverrideMenuOpen(false)
              if (!activeFindingState || !activeFinding) return
              const orig = activeFinding.originalSeverity
              if (!orig) return
              // Optimistic store update for reset
              const store = useReviewStore.getState()
              const f = store.findingsMap.get(activeFindingState)
              if (f) {
                store.setFinding(activeFindingState, {
                  ...f,
                  severity: orig,
                  originalSeverity: null,
                  updatedAt: new Date().toISOString(),
                })
              }
              void overrideSeverity({
                findingId: activeFindingState,
                fileId,
                projectId,
                newSeverity: orig,
              })
                .then((result) => {
                  if (result.success) {
                    toast.success('Severity reset to original')
                  } else {
                    // Rollback
                    if (f) {
                      const curr = useReviewStore.getState().findingsMap.get(activeFindingState)
                      if (curr)
                        useReviewStore
                          .getState()
                          .setFinding(activeFindingState, {
                            ...curr,
                            severity: f.severity,
                            originalSeverity: f.originalSeverity,
                          })
                    }
                    toast.error(result.error ?? 'Reset failed')
                  }
                })
                .catch(() => toast.error('Reset failed'))
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
          onSubmit={(data) => {
            setIsAddFindingDialogOpen(false)
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
                } else {
                  toast.error(result.error ?? 'Failed to add finding')
                }
              })
              .catch(() => toast.error('Failed to add finding'))
          }}
        />
      </div>

      {/* Zone 3: Detail Panel — desktop: static aside, non-desktop: Sheet */}
      {isDesktop ? (
        <aside
          role="complementary"
          aria-label="Finding detail"
          className="w-[var(--detail-panel-width)] shrink-0 border-l border-border overflow-y-auto"
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
            contextRange={undefined}
            onNavigateToFinding={setSelectedFinding}
            onAccept={handleAccept}
            onReject={handleReject}
            onFlag={handleFlag}
            onDelete={(findingId) => {
              void deleteFinding({ findingId, fileId, projectId })
                .then((result) => {
                  if (result.success) {
                    // Atomic remove from store (M1 fix: use removeFinding, not manual Map copy)
                    useReviewStore.getState().removeFinding(findingId)
                    setSelectedFinding(null)
                    toast.success('Finding deleted')
                  } else {
                    toast.error(result.error ?? 'Delete failed')
                  }
                })
                .catch(() => toast.error('Delete failed'))
            }}
            isActionInFlight={isActionInFlight}
          />
        </aside>
      ) : (
        <FindingDetailSheet
          open={sheetOpen}
          onOpenChange={handleSheetChange}
          finding={selectedFinding}
          sourceLang={sourceLang}
          targetLang={targetLang ?? ''}
          fileId={fileId}
          onNavigateToFinding={setSelectedFinding}
          onAccept={handleAccept}
          onReject={handleReject}
          onFlag={handleFlag}
          onDelete={(findingId) => {
            void deleteFinding({ findingId, fileId, projectId })
              .then((result) => {
                if (result.success) {
                  useReviewStore.getState().removeFinding(findingId)
                  setSelectedFinding(null)
                  toast.success('Finding deleted')
                } else {
                  toast.error(result.error ?? 'Delete failed')
                }
              })
              .catch(() => toast.error('Delete failed'))
          }}
          isActionInFlight={isActionInFlight}
        />
      )}

      {/* Mobile toggle button — opens drawer when finding selected */}
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
    </div>
  )
}
