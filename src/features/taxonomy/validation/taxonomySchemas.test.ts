import { describe, expect, it } from 'vitest'

import {
  createMappingSchema,
  reorderMappingsSchema,
  severityValues,
  updateMappingSchema,
} from './taxonomySchemas'

describe('createMappingSchema', () => {
  const validInput = {
    category: 'Accuracy',
    parentCategory: 'Omission',
    internalName: 'Missing text',
    severity: 'critical' as const,
    description: 'Text present in source is absent from translation.',
  }

  it('should accept valid input', () => {
    const result = createMappingSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('should accept null parentCategory', () => {
    const result = createMappingSchema.safeParse({ ...validInput, parentCategory: null })
    expect(result.success).toBe(true)
  })

  it('should accept undefined parentCategory', () => {
    const result = createMappingSchema.safeParse({ ...validInput, parentCategory: undefined })
    expect(result.success).toBe(true)
  })

  it('should reject empty category', () => {
    const result = createMappingSchema.safeParse({ ...validInput, category: '' })
    expect(result.success).toBe(false)
  })

  it('should reject category exceeding max length', () => {
    const result = createMappingSchema.safeParse({ ...validInput, category: 'A'.repeat(101) })
    expect(result.success).toBe(false)
  })

  it('should reject empty internalName', () => {
    const result = createMappingSchema.safeParse({ ...validInput, internalName: '' })
    expect(result.success).toBe(false)
  })

  it('should reject internalName exceeding max length', () => {
    const result = createMappingSchema.safeParse({ ...validInput, internalName: 'A'.repeat(201) })
    expect(result.success).toBe(false)
  })

  it('should reject invalid severity value', () => {
    const result = createMappingSchema.safeParse({ ...validInput, severity: 'fatal' })
    expect(result.success).toBe(false)
  })

  it('should accept all valid severity values', () => {
    for (const severity of severityValues) {
      const result = createMappingSchema.safeParse({ ...validInput, severity })
      expect(result.success, `severity "${severity}" should be valid`).toBe(true)
    }
  })

  it('should reject empty description', () => {
    const result = createMappingSchema.safeParse({ ...validInput, description: '' })
    expect(result.success).toBe(false)
  })

  it('should reject missing required fields', () => {
    const result = createMappingSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('updateMappingSchema', () => {
  it('should accept empty object (all optional)', () => {
    const result = updateMappingSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('should accept partial update with category only', () => {
    const result = updateMappingSchema.safeParse({ category: 'Fluency' })
    expect(result.success).toBe(true)
  })

  it('should accept isActive toggle', () => {
    const result = updateMappingSchema.safeParse({ isActive: false })
    expect(result.success).toBe(true)
  })

  it('should reject empty category string', () => {
    const result = updateMappingSchema.safeParse({ category: '' })
    expect(result.success).toBe(false)
  })

  it('should reject invalid severity in update', () => {
    const result = updateMappingSchema.safeParse({ severity: 'blocker' })
    expect(result.success).toBe(false)
  })

  it('should reject empty internalName in update', () => {
    const result = updateMappingSchema.safeParse({ internalName: '' })
    expect(result.success).toBe(false)
  })

  it('should accept null parentCategory in update', () => {
    const result = updateMappingSchema.safeParse({ parentCategory: null })
    expect(result.success).toBe(true)
  })
})

describe('reorderMappingsSchema', () => {
  // Valid UUID v4 format (RFC 4122 — version digit 4, variant bits 8-b)
  const UUID_A = 'a3bb189e-8bf9-4888-9912-ace4e6543002'
  const UUID_B = 'b4cc290f-9ca0-4999-aa23-bdf5f7654113'

  it('should accept valid reorder array', () => {
    const result = reorderMappingsSchema.safeParse([
      { id: UUID_A, displayOrder: 0 },
      { id: UUID_B, displayOrder: 1 },
    ])
    expect(result.success).toBe(true)
  })

  it('should reject empty array', () => {
    const result = reorderMappingsSchema.safeParse([])
    expect(result.success).toBe(false)
  })

  it('should reject invalid UUID', () => {
    const result = reorderMappingsSchema.safeParse([{ id: 'not-a-uuid', displayOrder: 0 }])
    expect(result.success).toBe(false)
  })

  it('should reject negative displayOrder', () => {
    const result = reorderMappingsSchema.safeParse([{ id: UUID_A, displayOrder: -1 }])
    // Zod .min(0) rejects negative values
    expect(result.success).toBe(false)
  })

  it('should reject non-integer displayOrder', () => {
    const result = reorderMappingsSchema.safeParse([{ id: UUID_A, displayOrder: 1.5 }])
    // Zod .int() rejects floats
    expect(result.success).toBe(false)
  })

  it('should accept displayOrder of 0', () => {
    const result = reorderMappingsSchema.safeParse([{ id: UUID_A, displayOrder: 0 }])
    expect(result.success).toBe(true)
  })
})
