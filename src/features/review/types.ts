import type { DetectedByLayer, FindingSeverity, FindingStatus } from '@/types/finding'

/** UI display shape for findings — used by FindingCard, FindingCardCompact, FindingList, FindingDetailSheet */
export type FindingForDisplay = {
  id: string
  segmentId: string | null
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
