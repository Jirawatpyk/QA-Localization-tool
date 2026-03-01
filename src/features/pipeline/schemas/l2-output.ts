import { z } from 'zod'

// ── L2 Semantic Categories ──
// Reference array for the 6 primary semantic categories that L2 focuses on.
// NOT used in the Zod schema as z.enum() — category is z.string() because
// the AI uses taxonomy-driven categories from the project's MQM taxonomy.

export const L2_SEMANTIC_CATEGORIES = [
  'mistranslation',
  'omission',
  'addition',
  'fluency',
  'register',
  'cultural',
] as const

// ── L2 Finding Schema ──
// Guardrail #17: .nullable() only — OpenAI rejects .optional() and .nullish()
// category: z.string() — taxonomy-driven, NOT hardcoded enum

export const l2FindingSchema = z.object({
  segmentId: z.string(),
  category: z.string(),
  severity: z.enum(['critical', 'major', 'minor']),
  description: z.string(),
  suggestion: z.string().nullable(),
  confidence: z.number().min(0).max(100),
})

// ── L2 Output Schema ──

export const l2OutputSchema = z.object({
  findings: z.array(l2FindingSchema),
  summary: z.string(),
})

// ── Inferred Types ──

export type L2Finding = z.infer<typeof l2FindingSchema>
export type L2Output = z.infer<typeof l2OutputSchema>
