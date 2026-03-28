import { z } from 'zod'

// Base schema shared by all review actions
const reviewActionBaseSchema = z.object({
  findingId: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})

export const acceptFindingSchema = reviewActionBaseSchema
export const rejectFindingSchema = reviewActionBaseSchema
export const flagFindingSchema = reviewActionBaseSchema
export const noteFindingSchema = reviewActionBaseSchema
export const sourceIssueFindingSchema = reviewActionBaseSchema

// Story 4.3: Update note text (Path 2 — already-noted finding)
export const updateNoteTextSchema = z.object({
  findingId: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  noteText: z.string().min(1).max(500),
})

// Story 4.3: Severity Override
export const overrideSeveritySchema = z.object({
  findingId: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  newSeverity: z.enum(['critical', 'major', 'minor']),
})

// Story 4.3: Add Finding
export const addFindingSchema = z.object({
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  segmentId: z.string().uuid(),
  category: z.string().min(1).max(100),
  severity: z.enum(['critical', 'major', 'minor']),
  description: z.string().min(10).max(1000),
  suggestion: z.string().max(1000).nullable(),
})

// Story 4.3: Delete Finding
export const deleteFindingSchema = reviewActionBaseSchema

// Story 4.4a: Bulk Operations
export const bulkActionSchema = z.object({
  findingIds: z
    .array(z.string().uuid())
    .min(1)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate IDs'),
  action: z.union([z.literal('accept'), z.literal('reject')]),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})

// Story 5.2c: Native Reviewer Workflow schemas

// Flag for native review (AC1): QA reviewer flags a finding for native review
export const flagForNativeSchema = z.object({
  findingId: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  assignedTo: z.string().uuid(),
  flaggerComment: z.string().min(10).max(500),
})

// Confirm native review (AC3): Native reviewer confirms finding
export const confirmNativeSchema = z.object({
  findingId: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})

// Override native review (AC3): Native reviewer overrides with new status
export const overrideNativeSchema = z.object({
  findingId: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  newStatus: z.enum(['accepted', 'rejected']),
})

// Add finding comment (AC4): Comment on a finding assignment
export const addFindingCommentSchema = z.object({
  findingId: z.string().uuid(),
  findingAssignmentId: z.string().uuid(),
  body: z.string().min(1).max(1000),
})

// Inferred input types
export type AcceptFindingInput = z.infer<typeof acceptFindingSchema>
export type RejectFindingInput = z.infer<typeof rejectFindingSchema>
export type FlagFindingInput = z.infer<typeof flagFindingSchema>
export type NoteFindingInput = z.infer<typeof noteFindingSchema>
export type SourceIssueFindingInput = z.infer<typeof sourceIssueFindingSchema>
export type UpdateNoteTextInput = z.infer<typeof updateNoteTextSchema>
export type OverrideSeverityInput = z.infer<typeof overrideSeveritySchema>
export type AddFindingInput = z.infer<typeof addFindingSchema>
export type DeleteFindingInput = z.infer<typeof deleteFindingSchema>
export type BulkActionInput = z.infer<typeof bulkActionSchema>
export type FlagForNativeInput = z.infer<typeof flagForNativeSchema>
export type ConfirmNativeInput = z.infer<typeof confirmNativeSchema>
export type OverrideNativeInput = z.infer<typeof overrideNativeSchema>
export type AddFindingCommentInput = z.infer<typeof addFindingCommentSchema>
