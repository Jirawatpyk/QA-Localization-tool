import { z } from 'zod'

import { PIPELINE_LAYERS, PROCESSING_MODES } from '@/types/pipeline'

export const startProcessingSchema = z.object({
  fileIds: z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate file IDs are not allowed',
    }),
  projectId: z.string().uuid(),
  mode: z.enum(PROCESSING_MODES),
})

export type StartProcessingInput = z.infer<typeof startProcessingSchema>

export const getFilesWordCountSchema = z.object({
  fileIds: z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate file IDs are not allowed',
    }),
  projectId: z.string().uuid(),
})

export type GetFilesWordCountInput = z.infer<typeof getFilesWordCountSchema>

export const getProjectAiBudgetSchema = z.object({
  projectId: z.string().uuid(),
})

export type GetProjectAiBudgetInput = z.infer<typeof getProjectAiBudgetSchema>

export const updateBudgetAlertThresholdSchema = z.object({
  projectId: z.string().uuid(),
  thresholdPct: z.number().int().min(1).max(100),
})

export type UpdateBudgetAlertThresholdInput = z.infer<typeof updateBudgetAlertThresholdSchema>

export const updateModelPinningSchema = z.object({
  projectId: z.string().uuid(),
  layer: z.enum(PIPELINE_LAYERS),
  model: z.string().min(1).nullable(),
})

export type UpdateModelPinningInput = z.infer<typeof updateModelPinningSchema>
