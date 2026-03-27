import { z } from 'zod'

// ── L3 Finding Schema ──
// Guardrail #17: .nullable() only — OpenAI rejects .optional() and .nullish()
// L3 adds 'rationale' field for deep reasoning chain (not present in L2)
// category: z.string() — taxonomy-driven, NOT hardcoded enum

export const l3FindingSchema = z.object({
  segmentId: z.string(),
  category: z.string(),
  severity: z.enum(['critical', 'major', 'minor']),
  confidence: z.number(), // No .min/.max — Anthropic rejects minimum/maximum in structured output
  description: z.string(),
  suggestedFix: z.string().nullable(),
  rationale: z.string(),
})

// ── L3 Output Schema ──

export const l3OutputSchema = z.object({
  findings: z.array(l3FindingSchema),
  summary: z.string(),
})

// ── Inferred Types ──

export type L3Finding = z.infer<typeof l3FindingSchema>
export type L3Output = z.infer<typeof l3OutputSchema>
