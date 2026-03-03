// ── Prompt Context Types ──
// Pure data types passed INTO prompt builders (no DB imports)
// DB queries happen in runL2ForFile / runL3ForFile, then pass data here.

import type { DetectedByLayer, FindingSeverity } from '@/types/finding'

export type PromptSegment = {
  id: string
  sourceText: string
  targetText: string
  segmentNumber: number
  sourceLang: string
  targetLang: string
}

export type PriorFinding = {
  id: string
  segmentId: string | null
  category: string
  severity: FindingSeverity
  description: string
  detectedByLayer: DetectedByLayer
}

export type GlossaryTermContext = {
  sourceTerm: string
  targetTerm: string
  caseSensitive: boolean
}

export type TaxonomyCategoryContext = {
  category: string
  parentCategory: string | null
  severity: string | null // varchar column — Drizzle infers string
  description: string
}

export type ProjectContext = {
  name: string
  description: string | null
  sourceLang: string
  targetLangs: string[]
  processingMode: string // varchar column — Drizzle infers string
}

export type L2PromptInput = {
  segments: PromptSegment[]
  l1Findings: PriorFinding[]
  glossaryTerms: GlossaryTermContext[]
  taxonomyCategories: TaxonomyCategoryContext[]
  project: ProjectContext
}

export type L3PromptInput = {
  segments: PromptSegment[]
  priorFindings: PriorFinding[]
  glossaryTerms: GlossaryTermContext[]
  taxonomyCategories: TaxonomyCategoryContext[]
  project: ProjectContext
}
