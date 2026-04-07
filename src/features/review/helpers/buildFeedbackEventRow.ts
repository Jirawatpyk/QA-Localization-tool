import { determineNonNative } from '@/lib/auth/determineNonNative'

type FeedbackAction =
  | 'manual_add'
  | 'reject'
  | 'undo_reject'
  | 'accept'
  | 'edit'
  | 'change_severity'
  | 'flag'
  | 'note'
  | 'source_issue'

interface BuildFeedbackEventRowParams {
  tenantId: string
  fileId: string
  projectId: string
  findingId: string
  reviewerId: string
  action: FeedbackAction
  isFalsePositive: boolean
  findingCategory: string
  originalSeverity: string
  layer: string
  detectedByLayer: string
  sourceLang: string
  targetLang: string
  sourceText: string
  originalTarget: string
  /** Reviewer's native languages (BCP-47). Used to compute reviewerIsNative. */
  reviewerNativeLanguages: string[]
}

/**
 * Build a feedback_events row for AI training data collection.
 *
 * Pure function -- caller handles language resolution and DB insert.
 * Encapsulates the 16-field schema contract + reviewerIsNative computation.
 *
 * Used by: addFinding, bulkAction, undoAction
 */
export function buildFeedbackEventRow(params: BuildFeedbackEventRowParams) {
  const sourceLang = params.sourceLang || 'unknown'
  const targetLang = params.targetLang || 'unknown'

  return {
    tenantId: params.tenantId,
    fileId: params.fileId,
    projectId: params.projectId,
    findingId: params.findingId,
    reviewerId: params.reviewerId,
    action: params.action,
    findingCategory: params.findingCategory,
    originalSeverity: params.originalSeverity,
    isFalsePositive: params.isFalsePositive,
    reviewerIsNative: !determineNonNative(params.reviewerNativeLanguages, targetLang),
    layer: params.layer,
    detectedByLayer: params.detectedByLayer,
    sourceLang,
    targetLang,
    sourceText: params.sourceText,
    originalTarget: params.originalTarget,
  }
}

export type { BuildFeedbackEventRowParams, FeedbackAction }
