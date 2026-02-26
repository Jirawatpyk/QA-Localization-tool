// ── Prompt Context Types ──
// Pure data types passed INTO prompt builders (no DB imports)
// DB queries happen in runL2ForFile / runL3ForFile, then pass data here.

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
  severity: string
  description: string
  detectedByLayer: string
}

export type GlossaryTermContext = {
  sourceTerm: string
  targetTerm: string
  caseSensitive: boolean
}

export type TaxonomyCategoryContext = {
  category: string
  parentCategory: string | null
  severity: string | null
  description: string
}

export type ProjectContext = {
  name: string
  description: string | null
  sourceLang: string
  targetLangs: string[]
  processingMode: string
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
