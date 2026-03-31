import { z } from 'zod'

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
  projectId: z.string().uuid(),
  targetLanguage: z.string().min(2).max(10),
})

export type GetEligibleReviewersInput = z.infer<typeof getEligibleReviewersSchema>
