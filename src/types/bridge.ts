// Shared types for Language Bridge / Back-translation (Story 5.1)
// Located in @/types/ so db/schema and features can both import without circular dependency.

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
