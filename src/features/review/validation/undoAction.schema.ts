import { z } from 'zod'

import { DETECTED_BY_LAYERS, FINDING_SEVERITIES, FINDING_STATUSES } from '@/types/finding'

const findingStatusEnum = z.enum(FINDING_STATUSES)
const findingSeverityEnum = z.enum(FINDING_SEVERITIES)
const detectedByLayerEnum = z.enum(DETECTED_BY_LAYERS)

// ── Single Undo (status revert) ──

export const undoActionSchema = z.object({
  findingId: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  previousState: findingStatusEnum,
  expectedCurrentState: findingStatusEnum,
  force: z.boolean().default(false),
})

export type UndoActionInput = z.infer<typeof undoActionSchema>

// ── Bulk Undo ──

export const undoBulkActionSchema = z.object({
  findings: z
    .array(
      z.object({
        findingId: z.string().uuid(),
        previousState: findingStatusEnum,
        expectedCurrentState: findingStatusEnum,
      }),
    )
    .min(1)
    .max(200),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  force: z.boolean().default(false),
})

export type UndoBulkActionInput = z.infer<typeof undoBulkActionSchema>

// ── Undo Severity Override ──

export const undoSeverityOverrideSchema = z.object({
  findingId: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  previousSeverity: findingSeverityEnum,
  previousOriginalSeverity: findingSeverityEnum.nullable(),
  expectedCurrentSeverity: findingSeverityEnum,
})

export type UndoSeverityOverrideInput = z.infer<typeof undoSeverityOverrideSchema>

// ── Undo Add Finding (= delete the manually added finding) ──

export const undoAddFindingSchema = z.object({
  findingId: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})

export type UndoAddFindingInput = z.infer<typeof undoAddFindingSchema>

// ── Undo Delete Finding (= re-insert from snapshot) ──

export const undoDeleteFindingSchema = z.object({
  snapshot: z.object({
    id: z.string().uuid(),
    segmentId: z.string().uuid().nullable(),
    fileId: z.string().uuid(),
    projectId: z.string().uuid(),
    // tenantId intentionally excluded — server derives from requireRole() (tenant isolation)
    reviewSessionId: z.string().uuid().nullable(),
    status: findingStatusEnum,
    severity: findingSeverityEnum,
    originalSeverity: findingSeverityEnum.nullable(),
    category: z.string(),
    description: z.string(),
    detectedByLayer: detectedByLayerEnum,
    aiModel: z.string().nullable(),
    aiConfidence: z.number().nullable(),
    suggestedFix: z.string().nullable(),
    sourceTextExcerpt: z.string().nullable(),
    targetTextExcerpt: z.string().nullable(),
    scope: z.enum(['per-file', 'cross-file']),
    relatedFileIds: z.array(z.string()).nullable(),
    segmentCount: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})

export type UndoDeleteFindingInput = z.infer<typeof undoDeleteFindingSchema>

// ── Single Redo (re-apply action) ──

export const redoActionSchema = z.object({
  findingId: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  targetState: findingStatusEnum,
  expectedCurrentState: findingStatusEnum,
})

export type RedoActionInput = z.infer<typeof redoActionSchema>

// ── Bulk Redo ──

export const redoBulkActionSchema = z.object({
  findings: z
    .array(
      z.object({
        findingId: z.string().uuid(),
        targetState: findingStatusEnum,
        expectedCurrentState: findingStatusEnum,
      }),
    )
    .min(1)
    .max(200),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})

export type RedoBulkActionInput = z.infer<typeof redoBulkActionSchema>
