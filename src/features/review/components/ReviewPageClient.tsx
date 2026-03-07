'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'

import { ScoreBadge } from '@/features/batch/components/ScoreBadge'
import { retryAiAnalysis } from '@/features/pipeline/actions/retryAiAnalysis.action'
import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { FindingListItem } from '@/features/review/components/FindingListItem'
import { ReviewProgress } from '@/features/review/components/ReviewProgress'
import { useFindingsSubscription } from '@/features/review/hooks/use-findings-subscription'
import { useScoreSubscription } from '@/features/review/hooks/use-score-subscription'
import { useReviewStore } from '@/features/review/stores/review.store'
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
  // Partial status takes priority over layer-derived state (PM-B finding)
  if (scoreStatus === 'partial') return 'partial'
  if (!layerCompleted) return undefined
  if (layerCompleted === 'L1') return 'rule-only'
  if (layerCompleted === 'L1L2') return 'ai-screened'
  if (layerCompleted === 'L1L2L3') return 'deep-analyzed'
  return undefined
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { critical: 0, major: 1, minor: 2 }

export function ReviewPageClient({ fileId, projectId, initialData }: ReviewPageClientProps) {
  const resetForFile = useReviewStore((s) => s.resetForFile)
  const setFinding = useReviewStore((s) => s.setFinding)
  const findingsMap = useReviewStore((s) => s.findingsMap)
  const currentScore = useReviewStore((s) => s.currentScore)
  const layerCompleted = useReviewStore((s) => s.layerCompleted)
  const scoreStatus = useReviewStore((s) => s.scoreStatus)
  const updateScore = useReviewStore((s) => s.updateScore)

  // Initialize store on mount
  useEffect(() => {
    resetForFile(fileId)

    // Populate initial findings — map server action subset to full Finding type
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
      setFinding(f.id, finding)
    }

    // Populate initial score
    if (initialData.score.mqmScore !== null) {
      updateScore(
        initialData.score.mqmScore,
        initialData.score.status,
        initialData.score.layerCompleted,
      )
    }
  }, [fileId, resetForFile, setFinding, updateScore, initialData])

  // Retry AI analysis state
  const [isPending, startTransition] = useTransition()
  const [retryDispatched, setRetryDispatched] = useState(false)

  // Wire Realtime subscriptions
  useScoreSubscription(fileId)
  useFindingsSubscription(fileId)

  // Derive display values
  const effectiveScore = currentScore ?? initialData.score.mqmScore
  const effectiveLayerCompleted = layerCompleted ?? initialData.score.layerCompleted
  const effectiveScoreStatus = scoreStatus ?? initialData.score.status
  const badgeState = deriveScoreBadgeState(
    effectiveLayerCompleted,
    effectiveScoreStatus as ScoreStatus | null,
  )

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
    const counts: Record<string, number> = { critical: 0, major: 0, minor: 0 }
    for (const f of findingsMap.values()) {
      counts[f.severity] = (counts[f.severity] ?? 0) + 1
    }
    return counts
  }, [findingsMap])

  return (
    <div className="space-y-6">
      {/* Header: file name + score badge */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{initialData.file.fileName}</h1>
          <p className="text-sm text-muted-foreground mt-1">Project Review</p>
        </div>
        <div className="flex items-center gap-3">
          <ScoreBadge score={effectiveScore ?? null} size="md" state={badgeState} />
          {showRetryButton && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium bg-warning/10 text-warning border-warning/20 hover:bg-warning/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Retrying...' : 'Retry AI Analysis'}
            </button>
          )}
        </div>
      </div>

      {/* Partial status warning */}
      {partialWarningText && (
        <p className="text-sm text-warning bg-warning/5 border border-warning/20 rounded-md px-3 py-2">
          {partialWarningText}
        </p>
      )}

      {/* Layer progress */}
      <ReviewProgress
        layerCompleted={effectiveLayerCompleted}
        fileStatus={initialData.file.status}
        processingMode={initialData.processingMode}
      />

      {/* Finding count summary */}
      <div data-testid="finding-count-summary" className="flex gap-4 text-sm">
        <span className="text-severity-critical font-medium">
          Critical: {severityCounts.critical}
        </span>
        <span className="text-severity-major font-medium">Major: {severityCounts.major}</span>
        <span className="text-severity-minor font-medium">Minor: {severityCounts.minor}</span>
        <span className="text-muted-foreground">Total: {findingsMap.size}</span>
      </div>

      {/* Findings list */}
      <div data-testid="finding-list" className="space-y-2">
        {sortedFindings.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">No findings for this file.</p>
        ) : (
          sortedFindings.map((finding) => (
            <FindingListItem
              key={finding.id}
              finding={finding}
              l2ConfidenceMin={initialData.l2ConfidenceMin}
            />
          ))
        )}
      </div>
    </div>
  )
}
