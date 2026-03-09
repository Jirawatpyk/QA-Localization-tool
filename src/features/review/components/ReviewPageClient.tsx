'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { ScoreBadge } from '@/features/batch/components/ScoreBadge'
import { retryAiAnalysis } from '@/features/pipeline/actions/retryAiAnalysis.action'
import { approveFile } from '@/features/review/actions/approveFile.action'
import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { AutoPassRationale } from '@/features/review/components/AutoPassRationale'
import { FindingDetailSheet } from '@/features/review/components/FindingDetailSheet'
import { FindingListItem } from '@/features/review/components/FindingListItem'
import { KeyboardCheatSheet } from '@/features/review/components/KeyboardCheatSheet'
import { ReviewActionBar } from '@/features/review/components/ReviewActionBar'
import { ReviewProgress } from '@/features/review/components/ReviewProgress'
import { useFindingsSubscription } from '@/features/review/hooks/use-findings-subscription'
import { _resetRegistry } from '@/features/review/hooks/use-keyboard-actions'
import { useScoreSubscription } from '@/features/review/hooks/use-score-subscription'
import { useThresholdSubscription } from '@/features/review/hooks/use-threshold-subscription'
import { useReviewStore } from '@/features/review/stores/review.store'
import { mountAnnouncer } from '@/features/review/utils/announce'
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

const SEVERITY_ORDER: Record<FindingSeverity, number> = { critical: 0, major: 1, minor: 2 }

export function ReviewPageClient({ fileId, projectId, initialData }: ReviewPageClientProps) {
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

  // Mount announcer for screen reader (Guardrail #33 — pre-exist in DOM)
  useEffect(() => {
    mountAnnouncer()
  }, [])

  // Initialize store on mount
  useEffect(() => {
    resetForFile(fileId)
    // Reset keyboard registry to avoid phantom bindings from previous file (H1)
    _resetRegistry()

    // Populate initial findings — build batch Map for single store update (M5)
    const initialMap = new Map<string, Finding>()
    for (const f of initialData.findings) {
      const finding: Finding = {
        ...f,
        tenantId: '',
        projectId,
        sessionId: '',
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
    if (initialData.score.mqmScore !== null) {
      updateScore(
        initialData.score.mqmScore,
        initialData.score.status,
        initialData.score.layerCompleted,
      )
    }
  }, [fileId, projectId, resetForFile, setFindings, updateScore, initialData])

  // Retry AI analysis state
  const [isPending, startTransition] = useTransition()
  const [retryDispatched, setRetryDispatched] = useState(false)

  // Approve state
  const [isApproving, startApproveTransition] = useTransition()

  // Wire Realtime subscriptions
  useScoreSubscription(fileId)
  useFindingsSubscription(fileId)
  // Threshold subscription — only if language pair is available
  const sourceLang = initialData.sourceLang
  const targetLang = initialData.targetLang
  useThresholdSubscription(sourceLang, targetLang ?? '')

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
          toast.error(result.error)
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

  // Sort findings from store
  const sortedFindings = useMemo(() => {
    const arr = Array.from(findingsMap.values())
    return arr.sort((a, b) => {
      const severityDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
      if (severityDiff !== 0) return severityDiff
      if (a.aiConfidence === null && b.aiConfidence === null) return 0
      if (a.aiConfidence === null) return 1
      if (b.aiConfidence === null) return -1
      return b.aiConfidence - a.aiConfidence
    })
  }, [findingsMap])

  // Count findings per severity
  const severityCounts = useMemo(() => {
    const counts: Record<FindingSeverity, number> = { critical: 0, major: 0, minor: 0 }
    for (const f of findingsMap.values()) {
      counts[f.severity] = (counts[f.severity] ?? 0) + 1
    }
    return counts
  }, [findingsMap])

  // Sheet open state — driven by store selectedId
  const isSheetOpen = selectedId !== null
  function handleSheetOpenChange(open: boolean) {
    if (!open) {
      setSelectedFinding(null)
    }
  }

  return (
    <div className="flex h-full" data-testid="review-3-zone">
      {/* Zone 1: File Navigation (left, collapsible) — shell only, populated in Story 4.1a */}
      <nav aria-label="File navigation" className="w-60 border-r shrink-0 overflow-y-auto p-4">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Files</h2>
        <p className="text-xs text-muted-foreground">File list will be populated in Story 4.1a.</p>
      </nav>

      {/* Zone 2: Finding List (center) */}
      <div className="flex-1 overflow-y-auto p-6">
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

        {/* Partial status warning */}
        {partialWarningText && (
          <div aria-live="assertive" data-testid="error-live-region">
            <p className="text-sm text-warning bg-warning/5 border border-warning/20 rounded-md px-3 py-2">
              {partialWarningText}
            </p>
          </div>
        )}

        {/* Layer progress */}
        <ReviewProgress
          layerCompleted={effectiveLayerCompleted}
          fileStatus={initialData.file.status}
          processingMode={initialData.processingMode}
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

        {/* Findings list — grid role with ARIA (Guardrail #29, #38) */}
        <div
          role="grid"
          aria-label="Finding list"
          data-testid="finding-list"
          className="mt-4 space-y-2"
        >
          <div role="rowgroup">
            {sortedFindings.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">No findings for this file.</p>
            ) : (
              sortedFindings.map((finding) => (
                <FindingListItem
                  key={finding.id}
                  finding={finding}
                  l2ConfidenceMin={storeL2ConfidenceMin ?? initialData.l2ConfidenceMin}
                  l3ConfidenceMin={storeL3ConfidenceMin ?? initialData.l3ConfidenceMin}
                />
              ))
            )}
          </div>
        </div>
        {/* Action Bar (Task 5 — below finding list) */}
        <ReviewActionBar />
      </div>

      {/* Zone 3: Finding Detail Sheet (right, Radix Sheet via portal) */}
      <FindingDetailSheet
        open={isSheetOpen}
        onOpenChange={handleSheetOpenChange}
        findingId={selectedId}
      />

      {/* Keyboard Cheat Sheet Modal (Ctrl+?) */}
      <KeyboardCheatSheet />
    </div>
  )
}
