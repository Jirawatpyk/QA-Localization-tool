import type { DetectedByLayer, FindingSeverity, FindingStatus } from '@/types/finding'

/** UI display shape for findings — used by FindingCard, FindingCardCompact, FindingList */
export type FindingForDisplay = {
  id: string
  severity: FindingSeverity
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
