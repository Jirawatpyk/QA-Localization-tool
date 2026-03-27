// Back-translation types for the Language Bridge feature (Story 5.1)

import type { LanguageNote } from '@/types/bridge'

// Re-export shared types from @/types/bridge (canonical source for db/schema + features)
export type { LanguageNote, LanguageNoteType } from '@/types/bridge'

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
