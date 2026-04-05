import { z } from 'zod'

import { canonicalizeBcp47 } from '@/lib/language/bcp47'
import { FILE_ASSIGNMENT_PRIORITIES, FILE_ASSIGNMENT_STATUSES } from '@/types/assignment'

export const assignFileSchema = z.object({
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  assignedTo: z.string().uuid(),
  priority: z.enum(FILE_ASSIGNMENT_PRIORITIES).default('normal'),
  notes: z.string().max(500).nullable().default(null),
})

export type AssignFileInput = z.infer<typeof assignFileSchema>

export const takeOverFileSchema = z.object({
  currentAssignmentId: z.string().uuid(),
  projectId: z.string().uuid(),
})

export type TakeOverFileInput = z.infer<typeof takeOverFileSchema>

export const updateAssignmentStatusSchema = z.object({
  assignmentId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: z.enum(FILE_ASSIGNMENT_STATUSES),
})

export type UpdateAssignmentStatusInput = z.infer<typeof updateAssignmentStatusSchema>

export const heartbeatSchema = z.object({
  assignmentId: z.string().uuid(),
})

export type HeartbeatInput = z.infer<typeof heartbeatSchema>

export const getEligibleReviewersSchema = z.object({
  // F12: canonicalize at the schema boundary — RC-2 pattern. The R4-P1 manual
  // `normalizeBcp47(rawTargetLanguage)` in the action is redundant once schema
  // transforms, but kept for defence in depth.
  // Bumped `.max` from 10 to 35 to align with `bcp47LanguageSchema` in
  // `@/lib/language/bcp47` (10 was too tight for tags like `zh-Hant-HK`).
  targetLanguage: z.string().min(2).max(35).transform(canonicalizeBcp47),
  includeAll: z.boolean().default(false),
})

export type GetEligibleReviewersInput = z.infer<typeof getEligibleReviewersSchema>

export const getFileAssignmentSchema = z.object({
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})

export type GetFileAssignmentInput = z.infer<typeof getFileAssignmentSchema>
