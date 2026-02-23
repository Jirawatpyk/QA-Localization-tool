import { describe, expect, it } from 'vitest'

import { EXCEL_AUTO_DETECT_KEYWORDS, EXCEL_PREVIEW_ROWS } from '@/features/parser/constants'

import { excelColumnMappingSchema } from './excelMappingSchema'

describe('excelColumnMappingSchema', () => {
  it('should parse valid mapping with required fields only', () => {
    const result = excelColumnMappingSchema.safeParse({
      sourceColumn: 'A',
      targetColumn: 'B',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sourceColumn).toBe('A')
      expect(result.data.targetColumn).toBe('B')
      expect(result.data.hasHeader).toBe(true) // default
    }
  })

  it('should parse valid mapping with all optional fields', () => {
    const result = excelColumnMappingSchema.safeParse({
      sourceColumn: 'Source',
      targetColumn: 'Target',
      hasHeader: false,
      segmentIdColumn: 'ID',
      contextColumn: 'Notes',
      languageColumn: 'Lang',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hasHeader).toBe(false)
      expect(result.data.segmentIdColumn).toBe('ID')
      expect(result.data.contextColumn).toBe('Notes')
      expect(result.data.languageColumn).toBe('Lang')
    }
  })

  it('should reject when sourceColumn is empty', () => {
    const result = excelColumnMappingSchema.safeParse({
      sourceColumn: '',
      targetColumn: 'B',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('sourceColumn'))).toBe(true)
    }
  })

  it('should reject when targetColumn is empty', () => {
    const result = excelColumnMappingSchema.safeParse({
      sourceColumn: 'A',
      targetColumn: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('targetColumn'))).toBe(true)
    }
  })

  it('should reject when sourceColumn === targetColumn (C7)', () => {
    const result = excelColumnMappingSchema.safeParse({
      sourceColumn: 'A',
      targetColumn: 'A',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('targetColumn'))
      expect(issue?.message).toBe('Source and Target columns must be different')
    }
  })

  it('should reject when sourceColumn is missing', () => {
    const result = excelColumnMappingSchema.safeParse({ targetColumn: 'B' })
    expect(result.success).toBe(false)
  })

  it('should reject when targetColumn is missing', () => {
    const result = excelColumnMappingSchema.safeParse({ sourceColumn: 'A' })
    expect(result.success).toBe(false)
  })

  it('should default hasHeader to true when not provided', () => {
    const result = excelColumnMappingSchema.safeParse({
      sourceColumn: 'A',
      targetColumn: 'B',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hasHeader).toBe(true)
    }
  })

  it('should allow hasHeader = false', () => {
    const result = excelColumnMappingSchema.safeParse({
      sourceColumn: '1',
      targetColumn: '2',
      hasHeader: false,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hasHeader).toBe(false)
    }
  })

  it('should allow optional fields to be undefined', () => {
    const result = excelColumnMappingSchema.safeParse({
      sourceColumn: 'A',
      targetColumn: 'B',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.segmentIdColumn).toBeUndefined()
      expect(result.data.contextColumn).toBeUndefined()
      expect(result.data.languageColumn).toBeUndefined()
    }
  })
})

describe('EXCEL_PREVIEW_ROWS', () => {
  it('should be 5', () => {
    expect(EXCEL_PREVIEW_ROWS).toBe(5)
  })
})

describe('EXCEL_AUTO_DETECT_KEYWORDS', () => {
  it('should include English source keywords', () => {
    expect(EXCEL_AUTO_DETECT_KEYWORDS.source).toContain('source')
    expect(EXCEL_AUTO_DETECT_KEYWORDS.source).toContain('original')
    expect(EXCEL_AUTO_DETECT_KEYWORDS.source).toContain('src')
  })

  it('should include Thai source keywords', () => {
    expect(EXCEL_AUTO_DETECT_KEYWORDS.source).toContain('ต้นฉบับ')
    expect(EXCEL_AUTO_DETECT_KEYWORDS.source).toContain('ภาษาต้นทาง')
  })

  it('should include English target keywords', () => {
    expect(EXCEL_AUTO_DETECT_KEYWORDS.target).toContain('target')
    expect(EXCEL_AUTO_DETECT_KEYWORDS.target).toContain('translation')
    expect(EXCEL_AUTO_DETECT_KEYWORDS.target).toContain('tgt')
  })

  it('should include Thai target keywords', () => {
    expect(EXCEL_AUTO_DETECT_KEYWORDS.target).toContain('คำแปล')
    expect(EXCEL_AUTO_DETECT_KEYWORDS.target).toContain('ภาษาปลายทาง')
  })
})
