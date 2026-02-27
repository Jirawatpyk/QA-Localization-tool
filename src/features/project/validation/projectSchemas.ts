import { z } from 'zod'

import { PROCESSING_MODES } from '@/types/pipeline'

const bcp47Schema = z
  .string()
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/, 'Invalid BCP-47 language code')

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(255, 'Project name too long'),
  description: z.string().max(1000).optional(),
  sourceLang: bcp47Schema,
  targetLangs: z.array(bcp47Schema).min(1, 'At least one target language required'),
  processingMode: z.enum(PROCESSING_MODES).default('economy'),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  processingMode: z.enum(PROCESSING_MODES).optional(),
  autoPassThreshold: z.number().int().min(0).max(100).optional(),
  aiBudgetMonthlyUsd: z.number().min(0).nullable().optional(), // null = unlimited
  budgetAlertThresholdPct: z.number().int().min(1).max(100).optional(), // default 80
})

export const updateLanguagePairConfigSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  sourceLang: bcp47Schema,
  targetLang: bcp47Schema,
  autoPassThreshold: z.number().int().min(0).max(100).optional(),
  l2ConfidenceMin: z.number().int().min(0).max(100).optional(),
  l3ConfidenceMin: z.number().int().min(0).max(100).optional(),
  mutedCategories: z.array(z.string()).optional(),
  wordSegmenter: z.enum(['intl', 'space']).optional(),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
export type UpdateLanguagePairConfigInput = z.infer<typeof updateLanguagePairConfigSchema>
