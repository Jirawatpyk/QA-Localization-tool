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
}

// ── Suppression Types (Story 4.6) ──

export type SuppressionScope = 'file' | 'language_pair' | 'all'
export type SuppressionDuration = 'session' | 'permanent' | 'until_improved'

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
