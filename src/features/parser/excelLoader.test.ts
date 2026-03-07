import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { MAX_EXCEL_DECOMPRESSED_BYTES } from './constants'
import { loadExcelWorkbook } from './excelLoader'

const FIXTURES = join(process.cwd(), 'src', 'test', 'fixtures', 'excel')

function readFixture(name: string): ArrayBuffer {
  const buf = readFileSync(join(FIXTURES, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

describe('loadExcelWorkbook — zip bomb guard (R-007)', () => {
  it('should accept valid xlsx files within size limit', async () => {
    const buffer = readFixture('bilingual-with-headers.xlsx')
    const workbook = await loadExcelWorkbook(buffer)
    expect(workbook).toBeDefined()
    const sheet = workbook.getWorksheet(1)
    expect(sheet).toBeDefined()
  })

  it('should accept empty-sheet.xlsx (small decompressed size)', async () => {
    const buffer = readFixture('empty-sheet.xlsx')
    const workbook = await loadExcelWorkbook(buffer)
    expect(workbook).toBeDefined()
  })

  it('should reject zip bomb with declared decompressed size over 100MB', async () => {
    const zipBomb = createZipBombBuffer(MAX_EXCEL_DECOMPRESSED_BYTES + 1)
    await expect(loadExcelWorkbook(zipBomb)).rejects.toThrow(/decompressed size.*exceeds maximum/)
  })

  it('should mention zip bomb in error message', async () => {
    const zipBomb = createZipBombBuffer(MAX_EXCEL_DECOMPRESSED_BYTES + 1)
    await expect(loadExcelWorkbook(zipBomb)).rejects.toThrow(/zip bomb/)
  })

  it('should include actual and max bytes in error message', async () => {
    const declaredSize = MAX_EXCEL_DECOMPRESSED_BYTES + 12345
    const zipBomb = createZipBombBuffer(declaredSize)
    await expect(loadExcelWorkbook(zipBomb)).rejects.toThrow(
      `Excel file decompressed size (${declaredSize} bytes) exceeds maximum allowed (${MAX_EXCEL_DECOMPRESSED_BYTES} bytes)`,
    )
  })

  it('should reject when multiple entries combined exceed limit', async () => {
    const perEntry = Math.floor(MAX_EXCEL_DECOMPRESSED_BYTES / 2) + 1
    const zipBomb = createMultiEntryZipBombBuffer(perEntry, perEntry)
    await expect(loadExcelWorkbook(zipBomb)).rejects.toThrow(/decompressed size.*exceeds maximum/)
  })

  it('should throw on invalid ZIP (no EOCD signature)', async () => {
    const garbage = new ArrayBuffer(100)
    await expect(loadExcelWorkbook(garbage)).rejects.toThrow(/End of Central Directory/)
  })
})

// ─── ZIP bomb test fixture builders ──────────────────────────────────────────

/**
 * Create a minimal valid ZIP file with one entry declaring a given uncompressed size.
 * The actual content is empty — only the central directory declares the size.
 * This simulates a zip bomb where headers claim massive decompressed sizes.
 */
function createZipBombBuffer(declaredUncompressedSize: number): ArrayBuffer {
  const fileName = 'bomb.xml'
  const nameBytes = new TextEncoder().encode(fileName)

  // Local file header (30 + name length bytes)
  const localHeaderSize = 30 + nameBytes.length
  // Central directory entry (46 + name length bytes)
  const cdEntrySize = 46 + nameBytes.length
  // End of central directory (22 bytes)
  const eocdSize = 22

  const totalSize = localHeaderSize + cdEntrySize + eocdSize
  const buf = new ArrayBuffer(totalSize)
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  let offset = 0

  // === Local file header ===
  view.setUint32(offset, 0x04034b50, true) // signature
  view.setUint16(offset + 4, 20, true) // version needed
  view.setUint16(offset + 6, 0, true) // flags
  view.setUint16(offset + 8, 0, true) // compression (stored)
  view.setUint32(offset + 22, declaredUncompressedSize, true) // uncompressed size
  view.setUint16(offset + 26, nameBytes.length, true) // file name length
  bytes.set(nameBytes, offset + 30)
  offset += localHeaderSize

  // === Central directory entry ===
  const cdOffset = offset
  view.setUint32(offset, 0x02014b50, true) // signature
  view.setUint16(offset + 4, 20, true) // version made by
  view.setUint16(offset + 6, 20, true) // version needed
  view.setUint32(offset + 24, declaredUncompressedSize, true) // uncompressed size (THE KEY FIELD)
  view.setUint16(offset + 28, nameBytes.length, true) // file name length
  bytes.set(nameBytes, offset + 46)
  offset += cdEntrySize

  // === End of central directory ===
  view.setUint32(offset, 0x06054b50, true) // EOCD signature
  view.setUint16(offset + 8, 1, true) // entries on disk
  view.setUint16(offset + 10, 1, true) // total entries
  view.setUint32(offset + 12, cdEntrySize, true) // CD size
  view.setUint32(offset + 16, cdOffset, true) // CD offset

  return buf
}

/**
 * Create a ZIP with two entries, each declaring a given uncompressed size.
 */
function createMultiEntryZipBombBuffer(size1: number, size2: number): ArrayBuffer {
  const name1 = new TextEncoder().encode('entry1.xml')
  const name2 = new TextEncoder().encode('entry2.xml')

  const lh1 = 30 + name1.length
  const lh2 = 30 + name2.length
  const cd1 = 46 + name1.length
  const cd2 = 46 + name2.length
  const eocdSize = 22
  const totalSize = lh1 + lh2 + cd1 + cd2 + eocdSize

  const buf = new ArrayBuffer(totalSize)
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  let offset = 0

  // Local headers
  writeLocalHeader(view, bytes, offset, name1, size1)
  offset += lh1
  writeLocalHeader(view, bytes, offset, name2, size2)
  offset += lh2

  const cdStart = offset

  // CD entries
  writeCDEntry(view, bytes, offset, name1, size1, 0)
  offset += cd1
  writeCDEntry(view, bytes, offset, name2, size2, lh1)
  offset += cd2

  // EOCD
  view.setUint32(offset, 0x06054b50, true)
  view.setUint16(offset + 8, 2, true)
  view.setUint16(offset + 10, 2, true)
  view.setUint32(offset + 12, cd1 + cd2, true)
  view.setUint32(offset + 16, cdStart, true)

  return buf
}

function writeLocalHeader(
  view: DataView,
  bytes: Uint8Array,
  offset: number,
  name: Uint8Array,
  uncompressedSize: number,
): void {
  view.setUint32(offset, 0x04034b50, true)
  view.setUint16(offset + 4, 20, true)
  view.setUint32(offset + 22, uncompressedSize, true)
  view.setUint16(offset + 26, name.length, true)
  bytes.set(name, offset + 30)
}

function writeCDEntry(
  view: DataView,
  bytes: Uint8Array,
  offset: number,
  name: Uint8Array,
  uncompressedSize: number,
  localHeaderOffset: number,
): void {
  view.setUint32(offset, 0x02014b50, true)
  view.setUint16(offset + 4, 20, true)
  view.setUint16(offset + 6, 20, true)
  view.setUint32(offset + 24, uncompressedSize, true)
  view.setUint16(offset + 28, name.length, true)
  view.setUint32(offset + 42, localHeaderOffset, true)
  bytes.set(name, offset + 46)
}
