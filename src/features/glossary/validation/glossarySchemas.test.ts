import { describe, expect, it } from 'vitest'

import {
  columnMappingSchema,
  createTermSchema,
  importGlossarySchema,
  updateTermSchema,
} from './glossarySchemas'

describe('glossarySchemas', () => {
  describe('importGlossarySchema', () => {
    it('should accept valid input', () => {
      const input = {
        name: 'Project Glossary',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        format: 'csv',
      }

      const result = importGlossarySchema.safeParse(input)

      expect(result.success).toBe(true)
    })

    it('should reject invalid format', () => {
      const input = {
        name: 'Test Glossary',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        format: 'pdf',
      }

      const result = importGlossarySchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('should reject missing project ID', () => {
      const input = {
        name: 'Test Glossary',
        format: 'csv',
      }

      const result = importGlossarySchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('should reject empty name', () => {
      const input = {
        name: '',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        format: 'csv',
      }

      const result = importGlossarySchema.safeParse(input)

      expect(result.success).toBe(false)
    })
  })

  describe('createTermSchema', () => {
    it('should accept valid term', () => {
      const input = {
        glossaryId: '550e8400-e29b-41d4-a716-446655440000',
        sourceTerm: 'cloud computing',
        targetTerm: 'คลาวด์คอมพิวติ้ง',
        caseSensitive: false,
      }

      const result = createTermSchema.safeParse(input)

      expect(result.success).toBe(true)
    })

    it('should reject empty source term', () => {
      const input = {
        glossaryId: '550e8400-e29b-41d4-a716-446655440000',
        sourceTerm: '',
        targetTerm: 'ระบบ',
      }

      const result = createTermSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('should default caseSensitive to false', () => {
      const input = {
        glossaryId: '550e8400-e29b-41d4-a716-446655440000',
        sourceTerm: 'cloud',
        targetTerm: 'คลาวด์',
      }

      const result = createTermSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.caseSensitive).toBe(false)
      }
    })
  })

  describe('updateTermSchema', () => {
    it('should accept partial update', () => {
      const input = {
        targetTerm: 'ระบบใหม่',
      }

      const result = updateTermSchema.safeParse(input)

      expect(result.success).toBe(true)
    })

    it('should accept empty object', () => {
      const result = updateTermSchema.safeParse({})

      expect(result.success).toBe(true)
    })
  })

  describe('importGlossarySchema boundary values', () => {
    const validBase = {
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      format: 'csv' as const,
    }

    it('should accept name at exactly 255 chars', () => {
      const result = importGlossarySchema.safeParse({
        ...validBase,
        name: 'a'.repeat(255),
      })
      expect(result.success).toBe(true)
    })

    it('should reject name at 256 chars', () => {
      const result = importGlossarySchema.safeParse({
        ...validBase,
        name: 'a'.repeat(256),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('createTermSchema boundary values', () => {
    const validBase = {
      glossaryId: '550e8400-e29b-41d4-a716-446655440000',
      targetTerm: 'ระบบ',
    }

    it('should accept sourceTerm at exactly 500 chars', () => {
      const result = createTermSchema.safeParse({
        ...validBase,
        sourceTerm: 'a'.repeat(500),
      })
      expect(result.success).toBe(true)
    })

    it('should reject sourceTerm at 501 chars', () => {
      const result = createTermSchema.safeParse({
        ...validBase,
        sourceTerm: 'a'.repeat(501),
      })
      expect(result.success).toBe(false)
    })

    it('should accept targetTerm at exactly 500 chars', () => {
      const result = createTermSchema.safeParse({
        ...validBase,
        sourceTerm: 'test',
        targetTerm: 'ก'.repeat(500),
      })
      expect(result.success).toBe(true)
    })

    it('should reject targetTerm at 501 chars', () => {
      const result = createTermSchema.safeParse({
        ...validBase,
        sourceTerm: 'test',
        targetTerm: 'ก'.repeat(501),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('columnMappingSchema', () => {
    it('should accept valid mapping', () => {
      const input = {
        sourceColumn: 'source',
        targetColumn: 'target',
        hasHeader: true,
        delimiter: ',',
      }

      const result = columnMappingSchema.safeParse(input)

      expect(result.success).toBe(true)
    })

    it('should default hasHeader to true', () => {
      const input = {
        sourceColumn: 'source',
        targetColumn: 'target',
        delimiter: ',',
      }

      const result = columnMappingSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.hasHeader).toBe(true)
      }
    })

    it('should default delimiter to comma', () => {
      const input = {
        sourceColumn: 'source',
        targetColumn: 'target',
      }

      const result = columnMappingSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.delimiter).toBe(',')
      }
    })
  })
})
