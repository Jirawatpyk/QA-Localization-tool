/**
 * Story 5.2c: Native Reviewer Workflow — Zod Validation Schemas
 * Tests: flagForNativeSchema, confirmNativeSchema, overrideNativeSchema, addFindingCommentSchema
 * Includes boundary value tests for string lengths (Guardrail — mandatory).
 */
import { describe, it, expect } from 'vitest'

import {
  flagForNativeSchema,
  confirmNativeSchema,
  overrideNativeSchema,
  addFindingCommentSchema,
} from '@/features/review/validation/reviewAction.schema'

const VALID_UUID = '11111111-1111-4111-8111-111111111111'

const validFlagBase = {
  findingId: VALID_UUID,
  fileId: VALID_UUID,
  projectId: VALID_UUID,
  assignedTo: VALID_UUID,
  flaggerComment: 'This needs native review for Thai idiom',
}

const validBaseIds = {
  findingId: VALID_UUID,
  fileId: VALID_UUID,
  projectId: VALID_UUID,
}

describe('flagForNativeSchema', () => {
  it('should accept valid input with all required fields', () => {
    expect(flagForNativeSchema.safeParse(validFlagBase).success).toBe(true)
  })

  it('should reject flaggerComment shorter than 10 chars', () => {
    const input = { ...validFlagBase, flaggerComment: 'short' }
    expect(flagForNativeSchema.safeParse(input).success).toBe(false)
  })

  it('should accept flaggerComment at exactly 10 chars (lower boundary)', () => {
    const input = { ...validFlagBase, flaggerComment: 'a'.repeat(10) }
    expect(flagForNativeSchema.safeParse(input).success).toBe(true)
  })

  it('should accept flaggerComment at exactly 500 chars (upper boundary)', () => {
    const input = { ...validFlagBase, flaggerComment: 'a'.repeat(500) }
    expect(flagForNativeSchema.safeParse(input).success).toBe(true)
  })

  it('should reject flaggerComment longer than 500 chars', () => {
    const input = { ...validFlagBase, flaggerComment: 'a'.repeat(501) }
    expect(flagForNativeSchema.safeParse(input).success).toBe(false)
  })

  it('should reject non-UUID assignedTo', () => {
    const input = { ...validFlagBase, assignedTo: 'not-a-uuid' }
    expect(flagForNativeSchema.safeParse(input).success).toBe(false)
  })
})

describe('confirmNativeSchema', () => {
  it('should accept valid findingId UUID', () => {
    expect(confirmNativeSchema.safeParse(validBaseIds).success).toBe(true)
  })

  it('should reject missing findingId', () => {
    const input = { fileId: VALID_UUID, projectId: VALID_UUID }
    expect(confirmNativeSchema.safeParse(input).success).toBe(false)
  })
})

describe('overrideNativeSchema', () => {
  it('should accept newStatus = accepted', () => {
    const input = { ...validBaseIds, newStatus: 'accepted' }
    expect(overrideNativeSchema.safeParse(input).success).toBe(true)
  })

  it('should accept newStatus = rejected', () => {
    const input = { ...validBaseIds, newStatus: 'rejected' }
    expect(overrideNativeSchema.safeParse(input).success).toBe(true)
  })

  it('should reject newStatus = flagged', () => {
    const input = { ...validBaseIds, newStatus: 'flagged' }
    expect(overrideNativeSchema.safeParse(input).success).toBe(false)
  })

  it('should reject newStatus = pending', () => {
    const input = { ...validBaseIds, newStatus: 'pending' }
    expect(overrideNativeSchema.safeParse(input).success).toBe(false)
  })
})

describe('addFindingCommentSchema', () => {
  const validComment = {
    findingId: VALID_UUID,
    findingAssignmentId: VALID_UUID,
    body: 'This is a comment',
  }

  it('should accept valid comment input', () => {
    expect(addFindingCommentSchema.safeParse(validComment).success).toBe(true)
  })

  it('should reject empty body (0 chars)', () => {
    const input = { ...validComment, body: '' }
    expect(addFindingCommentSchema.safeParse(input).success).toBe(false)
  })

  it('should accept body at exactly 1 char (lower boundary)', () => {
    const input = { ...validComment, body: 'x' }
    expect(addFindingCommentSchema.safeParse(input).success).toBe(true)
  })

  it('should accept body at exactly 1000 chars (upper boundary)', () => {
    const input = { ...validComment, body: 'a'.repeat(1000) }
    expect(addFindingCommentSchema.safeParse(input).success).toBe(true)
  })

  it('should reject body longer than 1000 chars', () => {
    const input = { ...validComment, body: 'a'.repeat(1001) }
    expect(addFindingCommentSchema.safeParse(input).success).toBe(false)
  })

  it('should reject non-UUID findingAssignmentId', () => {
    const input = { findingId: VALID_UUID, findingAssignmentId: 'bad', body: 'test' }
    expect(addFindingCommentSchema.safeParse(input).success).toBe(false)
  })
})
