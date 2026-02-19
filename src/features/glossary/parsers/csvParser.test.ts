import { describe, expect, it } from 'vitest'

import type { ColumnMappingInput } from '@/features/glossary/validation/glossarySchemas'

import { parseCsv } from './csvParser'

describe('parseCsv', () => {
  const defaultMapping: ColumnMappingInput = {
    sourceColumn: 'source',
    targetColumn: 'target',
    hasHeader: true,
    delimiter: ',',
  }

  it('should parse valid CSV with headers correctly', () => {
    const csv = 'source,target\nSystem,ระบบ\nDatabase,ฐานข้อมูล\nCloud,คลาวด์'

    const result = parseCsv(csv, defaultMapping)

    expect(result.terms).toHaveLength(3)
    expect(result.terms[0]).toEqual({ sourceTerm: 'System', targetTerm: 'ระบบ', lineNumber: 2 })
    expect(result.terms[1]).toEqual({
      sourceTerm: 'Database',
      targetTerm: 'ฐานข้อมูล',
      lineNumber: 3,
    })
    expect(result.terms[2]).toEqual({ sourceTerm: 'Cloud', targetTerm: 'คลาวด์', lineNumber: 4 })
    expect(result.errors).toHaveLength(0)
  })

  it('should return EMPTY_SOURCE error for empty source term', () => {
    const csv = 'source,target\n,ระบบ\nDatabase,ฐานข้อมูล'

    const result = parseCsv(csv, defaultMapping)

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]?.sourceTerm).toBe('Database')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.code).toBe('EMPTY_SOURCE')
    expect(result.errors[0]?.line).toBe(2)
  })

  it('should return MISSING_TARGET error for empty target term', () => {
    const csv = 'source,target\nSystem,\nDatabase,ฐานข้อมูล'

    const result = parseCsv(csv, defaultMapping)

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]?.sourceTerm).toBe('Database')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.code).toBe('MISSING_TARGET')
  })

  it('should normalize terms with NFKC (halfwidth to fullwidth katakana)', () => {
    const halfwidthKatakana = '\uFF8C\uFF9F\uFF9B\uFF78\uFF9E\uFF97\uFF90\uFF9D\uFF78\uFF9E'
    const csv = `source,target\nprogramming,${halfwidthKatakana}`

    const result = parseCsv(csv, defaultMapping)

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]?.targetTerm).toBe(halfwidthKatakana.normalize('NFKC'))
  })

  it('should parse CSV without headers using column indices', () => {
    const csv = 'System,ระบบ\nDatabase,ฐานข้อมูล'
    const mapping: ColumnMappingInput = {
      sourceColumn: '0',
      targetColumn: '1',
      hasHeader: false,
      delimiter: ',',
    }

    const result = parseCsv(csv, mapping)

    expect(result.terms).toHaveLength(2)
    expect(result.terms[0]).toEqual({ sourceTerm: 'System', targetTerm: 'ระบบ', lineNumber: 1 })
  })

  it('should handle semicolon delimiter', () => {
    const csv = 'source;target\ncloud computing;คลาวด์คอมพิวติ้ง\nserver;เซิร์ฟเวอร์'
    const mapping: ColumnMappingInput = {
      sourceColumn: 'source',
      targetColumn: 'target',
      hasHeader: true,
      delimiter: ';',
    }

    const result = parseCsv(csv, mapping)

    expect(result.terms).toHaveLength(2)
    expect(result.terms[0]?.sourceTerm).toBe('cloud computing')
    expect(result.terms[0]?.targetTerm).toBe('คลาวด์คอมพิวติ้ง')
  })

  it('should handle tab delimiter', () => {
    const csv = 'source\ttarget\nSystem\tระบบ'
    const mapping: ColumnMappingInput = {
      sourceColumn: 'source',
      targetColumn: 'target',
      hasHeader: true,
      delimiter: '\t',
    }

    const result = parseCsv(csv, mapping)

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]?.sourceTerm).toBe('System')
  })

  it('should handle quoted fields with embedded commas', () => {
    const csv = 'source,target\n"cloud computing, server",คลาวด์คอมพิวติ้ง\nDatabase,ฐานข้อมูล'

    const result = parseCsv(csv, defaultMapping)

    expect(result.terms).toHaveLength(2)
    expect(result.terms[0]?.sourceTerm).toBe('cloud computing, server')
  })

  it('should return empty array for empty CSV', () => {
    const result = parseCsv('', defaultMapping)

    expect(result.terms).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('should preserve Unicode terms (Thai, CJK)', () => {
    const csv = 'source,target\nserver,เซิร์ฟเวอร์\ndatabase,数据库'

    const result = parseCsv(csv, defaultMapping)

    expect(result.terms).toHaveLength(2)
    expect(result.terms[0]?.targetTerm).toBe('เซิร์ฟเวอร์')
    expect(result.terms[1]?.targetTerm).toBe('数据库')
  })
})
