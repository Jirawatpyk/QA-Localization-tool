// Back-translation types for the Language Bridge feature (Story 5.1)

export type LanguageNoteType =
  | 'tone_marker'
  | 'politeness_particle'
  | 'compound_word'
  | 'cultural_adaptation'
  | 'register'
  | 'idiom'
  | 'ambiguity'

export type LanguageNote = {
  noteType: LanguageNoteType
  originalText: string
  explanation: string
}

export type BackTranslationResult = {
  backTranslation: string
  contextualExplanation: string
  confidence: number
  languageNotes: LanguageNote[]
  translationApproach: string | null
}

export type BackTranslationOutput = BackTranslationResult & {
  cached: boolean
  latencyMs: number
}

/** Visual state for the LanguageBridge panel (AC4) */
export type BridgePanelState = 'standard' | 'hidden' | 'confidence-warning' | 'loading' | 'error'
