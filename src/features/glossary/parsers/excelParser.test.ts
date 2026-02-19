import { describe, expect, it, vi } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

import type { ColumnMappingInput } from '@/features/glossary/validation/glossarySchemas'

// Mock exceljs
const mockCells: Map<number, Map<number, { value: string | null }>> = new Map()
const mockWorksheet = {
  getRow: vi.fn((rowNum: number) => ({
    eachCell: vi.fn((callback: (cell: { value: string | null }, colNumber: number) => void) => {
      const row = mockCells.get(rowNum)
      if (row) {
        row.forEach((cell, colNum) => callback(cell, colNum))
      }
    }),
    getCell: vi.fn((colNum: number) => {
      const row = mockCells.get(rowNum)
      return row?.get(colNum) ?? { value: null }
    }),
  })),
  eachRow: vi.fn(
    (
      callback: (
        row: { getCell: (col: number) => { value: string | null } },
        rowNumber: number,
      ) => void,
    ) => {
      const sortedRows = [...mockCells.keys()].sort((a, b) => a - b)
      for (const rowNum of sortedRows) {
        const row = mockCells.get(rowNum)
        if (!row) continue
        callback(
          {
            getCell: (col: number) => row.get(col) ?? { value: null },
          },
          rowNum,
        )
      }
    },
  ),
}

vi.mock('exceljs', () => ({
  default: {
    Workbook: class MockWorkbook {
      xlsx = { load: vi.fn().mockResolvedValue(undefined) }
      getWorksheet = vi.fn().mockReturnValue(mockWorksheet)
    },
  },
}))

import { parseExcel } from './excelParser'

function setMockRows(rows: Array<Array<string | null>>) {
  mockCells.clear()
  rows.forEach((row, rowIdx) => {
    const rowMap = new Map<number, { value: string | null }>()
    row.forEach((cell, colIdx) => {
      rowMap.set(colIdx + 1, { value: cell })
    })
    mockCells.set(rowIdx + 1, rowMap)
  })
}

describe('parseExcel', () => {
  const defaultMapping: ColumnMappingInput = {
    sourceColumn: 'source',
    targetColumn: 'target',
    hasHeader: true,
    delimiter: ',',
  }

  it('should parse valid Excel with headers correctly', async () => {
    setMockRows([
      ['source', 'target', 'notes'],
      ['System', 'ระบบ', 'IT term'],
      ['Database', 'ฐานข้อมูล', 'IT term'],
    ])

    const buffer = new ArrayBuffer(8)
    const result = await parseExcel(buffer, defaultMapping)

    expect(result.terms).toHaveLength(2)
    expect(result.terms[0]).toEqual(
      expect.objectContaining({ sourceTerm: 'System', targetTerm: 'ระบบ' }),
    )
    expect(result.terms[1]).toEqual(
      expect.objectContaining({ sourceTerm: 'Database', targetTerm: 'ฐานข้อมูล' }),
    )
  })

  it('should use specific column mapping (non-default columns)', async () => {
    setMockRows([
      ['id', 'en_term', 'th_term'],
      ['1', 'cloud computing', 'คลาวด์คอมพิวติ้ง'],
    ])
    const mapping: ColumnMappingInput = {
      sourceColumn: 'en_term',
      targetColumn: 'th_term',
      hasHeader: true,
      delimiter: ',',
    }

    const buffer = new ArrayBuffer(8)
    const result = await parseExcel(buffer, mapping)

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]?.sourceTerm).toBe('cloud computing')
    expect(result.terms[0]?.targetTerm).toBe('คลาวด์คอมพิวติ้ง')
  })

  it('should return EMPTY_SOURCE for empty cells', async () => {
    setMockRows([
      ['source', 'target'],
      ['', 'ระบบ'],
      ['Database', 'ฐานข้อมูล'],
    ])

    const buffer = new ArrayBuffer(8)
    const result = await parseExcel(buffer, defaultMapping)

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]?.sourceTerm).toBe('Database')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.code).toBe('EMPTY_SOURCE')
  })

  it('should normalize terms with NFKC', async () => {
    const halfwidthKatakana = '\uFF8C\uFF9F\uFF9B\uFF78\uFF9E\uFF97\uFF90\uFF9D\uFF78\uFF9E'
    setMockRows([
      ['source', 'target'],
      ['programming', halfwidthKatakana],
    ])

    const buffer = new ArrayBuffer(8)
    const result = await parseExcel(buffer, defaultMapping)

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]?.targetTerm).toBe(halfwidthKatakana.normalize('NFKC'))
  })
})
