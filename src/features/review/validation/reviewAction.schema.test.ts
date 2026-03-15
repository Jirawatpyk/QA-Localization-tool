/**
 * TDD RED PHASE — Story 4.2: Core Review Actions
 * Validation: Zod schemas for accept/reject/flag actions
 * Tests: valid input passes, invalid UUID rejected
 */
import { describe, it, expect } from 'vitest'

// Will fail: module doesn't exist yet
import {
  acceptFindingSchema,
  rejectFindingSchema,
  flagFindingSchema,
  updateNoteTextSchema,
  addFindingSchema,
} from '@/features/review/validation/reviewAction.schema'

// ── Constants (valid v4 UUIDs — Zod v4 is strict) ──

const VALID_FINDING_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'

describe('reviewAction.schema', () => {
  describe('acceptFindingSchema', () => {
    it('[P1] U-V1: should pass validation with valid UUIDs', () => {
      const input = {
        findingId: VALID_FINDING_ID,
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }
      const result = acceptFindingSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('[P1] U-V2: should reject invalid UUID in findingId', () => {
      const input = {
        findingId: 'not-a-valid-uuid',
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }
      const result = acceptFindingSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('[P1] U-V2b: should reject missing findingId', () => {
      const input = {
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }
      const result = acceptFindingSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('[P1] U-V2c: should reject invalid UUID in fileId', () => {
      const input = {
        findingId: VALID_FINDING_ID,
        fileId: 'bad-uuid',
        projectId: VALID_PROJECT_ID,
      }
      const result = acceptFindingSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('[P1] U-V2d: should reject invalid UUID in projectId', () => {
      const input = {
        findingId: VALID_FINDING_ID,
        fileId: VALID_FILE_ID,
        projectId: 'bad-uuid',
      }
      const result = acceptFindingSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })

  describe('rejectFindingSchema', () => {
    it('[P1] U-V1b: should pass validation with valid UUIDs', () => {
      const input = {
        findingId: VALID_FINDING_ID,
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }
      const result = rejectFindingSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('[P1] U-V2e: should reject empty string findingId', () => {
      const input = {
        findingId: '',
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }
      const result = rejectFindingSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })

  describe('flagFindingSchema', () => {
    it('[P1] U-V1c: should pass validation with valid UUIDs', () => {
      const input = {
        findingId: VALID_FINDING_ID,
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }
      const result = flagFindingSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('[P1] U-V2f: should reject null findingId', () => {
      const input = {
        findingId: null,
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }
      const result = flagFindingSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })

  // ── Story 4.3 ATDD: Boundary value tests ──

  describe('updateNoteTextSchema — boundary values', () => {
    const base = { findingId: VALID_FINDING_ID, fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID }

    it('[P0] U-BV1: noteText boundary — 500 accepted, 501 rejected, null accepted', () => {
      // 500 chars: accepted
      expect(updateNoteTextSchema.safeParse({ ...base, noteText: 'a'.repeat(500) }).success).toBe(
        true,
      )
      // 499 chars: accepted
      expect(updateNoteTextSchema.safeParse({ ...base, noteText: 'a'.repeat(499) }).success).toBe(
        true,
      )
      // 501 chars: rejected
      expect(updateNoteTextSchema.safeParse({ ...base, noteText: 'a'.repeat(501) }).success).toBe(
        false,
      )
    })
  })

  describe('addFindingSchema — boundary values', () => {
    const base = {
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      segmentId: VALID_FINDING_ID,
      category: 'accuracy',
      severity: 'minor' as const,
      suggestion: null,
    }

    it('[P1] U-BV2: description min 10 — at 10 accepted, 9 rejected, 0 rejected', () => {
      expect(addFindingSchema.safeParse({ ...base, description: 'a'.repeat(10) }).success).toBe(
        true,
      )
      expect(addFindingSchema.safeParse({ ...base, description: 'a'.repeat(9) }).success).toBe(
        false,
      )
      expect(addFindingSchema.safeParse({ ...base, description: '' }).success).toBe(false)
    })

    it('[P1] U-BV3: description max 1000 — at 1000 accepted, 1001 rejected', () => {
      expect(addFindingSchema.safeParse({ ...base, description: 'a'.repeat(1000) }).success).toBe(
        true,
      )
      expect(addFindingSchema.safeParse({ ...base, description: 'a'.repeat(1001) }).success).toBe(
        false,
      )
    })

    it('[P1] U-BV4: suggestion boundary — 1000 accepted, 1001 rejected, null accepted', () => {
      expect(
        addFindingSchema.safeParse({
          ...base,
          description: 'a'.repeat(10),
          suggestion: 'a'.repeat(1000),
        }).success,
      ).toBe(true)
      expect(
        addFindingSchema.safeParse({
          ...base,
          description: 'a'.repeat(10),
          suggestion: 'a'.repeat(1001),
        }).success,
      ).toBe(false)
      expect(
        addFindingSchema.safeParse({ ...base, description: 'a'.repeat(10), suggestion: null })
          .success,
      ).toBe(true)
    })
  })
})
