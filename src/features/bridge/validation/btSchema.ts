import { z } from 'zod'

/**
 * Zod schema for AI structured output — back-translation result.
 *
 * Guardrail #17/#54: `.nullable()` only — OpenAI rejects `.optional()` and `.nullish()`.
 * Required fields: no modifier. Optional fields: `.nullable()`.
 */
export const backTranslationSchema = z.object({
  backTranslation: z.string(),
  contextualExplanation: z.string(),
  confidence: z.number(),
  languageNotes: z.array(
    z.object({
      noteType: z.enum([
        'tone_marker',
        'politeness_particle',
        'compound_word',
        'cultural_adaptation',
        'register',
        'idiom',
        'ambiguity',
      ]),
      originalText: z.string(),
      explanation: z.string(),
    }),
  ),
  translationApproach: z.string().nullable(), // Guardrail #17: nullable, not optional
})

export type BackTranslationSchemaOutput = z.infer<typeof backTranslationSchema>
