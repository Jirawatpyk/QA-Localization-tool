import type { AssignmentStatus } from '@/types/assignment'
import type { DetectedByLayer, FindingSeverity, FindingStatus } from '@/types/finding'

/** UI display shape for findings — used by FindingCard, FindingCardCompact, FindingList, FindingDetailSheet */
export type FindingForDisplay = {
  id: string
  segmentId: string | null
  severity: FindingSeverity
  originalSeverity: FindingSeverity | null
  category: string
  description: string
  status: FindingStatus
  detectedByLayer: DetectedByLayer
  aiConfidence: number | null
  sourceTextExcerpt: string | null
  targetTextExcerpt: string | null
  suggestedFix: string | null
  aiModel: string | null
  /** Story 5.2a: Whether this finding has any review_action with non_native=true (not yet native_verified) */
  hasNonNativeAction: boolean
  /** Story 5.2c: Assignment fields (populated for flagged findings with assignments) */
  assignmentId?: string | undefined
  assignmentStatus?: AssignmentStatus | undefined
  assignedToName?: string | undefined
  assignedByName?: string | undefined
  flaggerComment?: string | undefined
}

// ── Native Reviewer Notification Types (Story 5.2c, Guardrail #3) ──

export const NATIVE_NOTIFICATION_TYPES = [
  'finding_flagged_for_native',
  'native_comment_added',
  'native_review_completed',
] as const

export type NativeNotificationType = (typeof NATIVE_NOTIFICATION_TYPES)[number]

// ── Suppression Types (Story 4.6) ──

export type SuppressionScope = 'file' | 'language_pair' | 'all'
export type SuppressionDuration = 'session' | 'permanent' | 'until_improved'

// R2-M4: runtime validation sets (Guardrail #3 — no bare string)
export const SUPPRESSION_SCOPES: ReadonlySet<string> = new Set<SuppressionScope>([
  'file',
  'language_pair',
  'all',
])
export const SUPPRESSION_DURATIONS: ReadonlySet<string> = new Set<SuppressionDuration>([
  'session',
  'permanent',
  'until_improved',
])

export type SuppressionRule = {
  id: string
  projectId: string
  tenantId: string
  pattern: string
  category: string
  scope: SuppressionScope
  duration: SuppressionDuration
  reason: string
  fileId: string | null
  sourceLang: string | null
  targetLang: string | null
  matchCount: number
  createdBy: string
  createdByName: string | null // JOIN from users table
  isActive: boolean
  createdAt: string
}

export type SuppressionConfig = {
  scope: SuppressionScope
  duration: SuppressionDuration
  fileId: string | null
  sourceLang: string | null
  targetLang: string | null
}

export type DetectedPattern = {
  category: string
  keywords: string[]
  patternName: string
  matchingFindingIds: string[]
  sourceLang: string
  targetLang: string
}
