import { z } from 'zod'

import { bcp47LanguageSchema } from '@/lib/language/bcp47'
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
  // G4: use the shared `bcp47LanguageSchema` (length + regex + canonicalize
  // transform) instead of a hand-rolled `z.string().min(2).max(35)` — single
  // source of truth per F7. Previously this field accepted malformed input
  // like `'!!bad!!'` which would lowercase and produce a silent zero-match
  // query; now it rejects non-BCP-47 strings at the validation boundary.
  targetLanguage: bcp47LanguageSchema,
  includeAll: z.boolean().default(false),
})

export type GetEligibleReviewersInput = z.infer<typeof getEligibleReviewersSchema>

export const getFileAssignmentSchema = z.object({
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})

export type GetFileAssignmentInput = z.infer<typeof getFileAssignmentSchema>
