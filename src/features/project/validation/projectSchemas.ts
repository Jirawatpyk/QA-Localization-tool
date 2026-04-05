import { z } from 'zod'

import { bcp47LanguageSchema, canonicalizeLanguages } from '@/lib/language/bcp47'
import { PROCESSING_MODES } from '@/types/pipeline'

// F7: use the shared `bcp47LanguageSchema` from `@/lib/language/bcp47`.
// Previously this file had its own local variant with different length
// clamping — the divergence was a latent "rolling-bug pattern" hazard.
const bcp47Schema = bcp47LanguageSchema

export const createProjectSchema = z
  .object({
    name: z.string().min(1, 'Project name is required').max(255, 'Project name too long'),
    description: z.string().max(1000).optional(),
    sourceLang: bcp47Schema,
    targetLangs: z
      .array(bcp47Schema)
      .min(1, 'At least one target language required')
      // F8: reject case-insensitive duplicates explicitly so users see an error
      // instead of silently collapsing `['th-TH','th-th']` into one entry via
      // the transform. Refine runs on per-item-canonicalized values.
      .refine((langs) => new Set(langs).size === langs.length, {
        message: 'Duplicate target languages are not allowed',
      })
      // Canonical array: sort after per-tag canonicalization. Downstream
      // parseFile reads targetLangs[0] and stores it in segments — without this
      // transform, uppercase tags propagate into the segment layer and break
      // every language comparison in flagForNative, scoreFile, ruleEngine.
      .transform((langs) => canonicalizeLanguages(langs)),
    processingMode: z.enum(PROCESSING_MODES).default('economy'),
  })
  // F5: sourceLang must differ from every target after canonicalization.
  // Without this check, `sourceLang: 'en'` + `targetLangs: ['EN']` would
  // silently pass (both canonicalize to 'en') and corrupt the project.
  .refine((data) => !data.targetLangs.includes(data.sourceLang), {
    message: 'Source language cannot also be a target language',
    path: ['targetLangs'],
  })

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  processingMode: z.enum(PROCESSING_MODES).optional(),
  autoPassThreshold: z.number().int().min(0).max(100).optional(),
  aiBudgetMonthlyUsd: z.number().min(0).nullable().optional(), // null = unlimited
  budgetAlertThresholdPct: z.number().int().min(1).max(100).optional(), // default 80
})

export const updateLanguagePairConfigSchema = z
  .object({
    projectId: z.string().uuid('Invalid project ID'),
    // Both sides flow through `bcp47Schema` which canonicalizes via transform —
    // `languagePairConfigs.sourceLang` / `targetLang` are always stored canonical.
    sourceLang: bcp47Schema,
    targetLang: bcp47Schema,
    autoPassThreshold: z.number().int().min(0).max(100).optional(),
    l2ConfidenceMin: z.number().int().min(0).max(100).optional(),
    l3ConfidenceMin: z.number().int().min(0).max(100).optional(),
    mutedCategories: z.array(z.string()).optional(),
    wordSegmenter: z.enum(['intl', 'space']).optional(),
  })
  // F5: reject same source/target after canonicalization. `sourceLang='en'` +
  // `targetLang='EN'` would otherwise collapse to the same tag and corrupt
  // the `UNIQUE(tenant_id, source_lang, target_lang)` key.
  .refine((data) => data.sourceLang !== data.targetLang, {
    message: 'Source and target languages must differ',
    path: ['targetLang'],
  })

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
export type UpdateLanguagePairConfigInput = z.infer<typeof updateLanguagePairConfigSchema>
