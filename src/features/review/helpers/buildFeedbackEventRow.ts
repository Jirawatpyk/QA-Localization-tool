import type { feedbackEvents } from '@/db/schema/feedbackEvents'
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
  /** Pre-computed value. If provided, skips determineNonNative call. */
  reviewerIsNative?: boolean
}

/** Subset of feedback_events columns that this helper populates. */
type FeedbackEventRow = Pick<
  typeof feedbackEvents.$inferInsert,
  | 'tenantId'
  | 'fileId'
  | 'projectId'
  | 'findingId'
  | 'reviewerId'
  | 'action'
  | 'findingCategory'
  | 'originalSeverity'
  | 'isFalsePositive'
  | 'reviewerIsNative'
  | 'layer'
  | 'detectedByLayer'
  | 'sourceLang'
  | 'targetLang'
  | 'sourceText'
  | 'originalTarget'
>

/**
 * Build a feedback_events row for AI training data collection.
 *
 * Pure function -- caller handles language resolution and DB insert.
 * Encapsulates the 16-field schema contract + reviewerIsNative computation.
 *
 * Used by: addFinding, bulkAction, undoAction
 */
export function buildFeedbackEventRow(params: BuildFeedbackEventRowParams): FeedbackEventRow {
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
    reviewerIsNative:
      params.reviewerIsNative ?? !determineNonNative(params.reviewerNativeLanguages, targetLang),
    layer: params.layer,
    detectedByLayer: params.detectedByLayer,
    sourceLang,
    targetLang,
    sourceText: params.sourceText,
    originalTarget: params.originalTarget,
  }
}

export type { BuildFeedbackEventRowParams, FeedbackAction }
