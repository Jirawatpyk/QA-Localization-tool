import 'server-only'

import ExcelJS from 'exceljs'

import { MAX_EXCEL_DECOMPRESSED_BYTES } from '@/features/parser/constants'

/**
 * Load an ExcelJS Workbook from an ArrayBuffer.
 *
 * Includes zip bomb guard: reads the ZIP central directory to check total
 * decompressed size before allowing ExcelJS to process the file. This prevents
 * OOM on serverless runtimes from malicious xlsx files that compress to small
 * sizes but decompress to gigabytes.
 *
 * Centralises the @ts-expect-error needed for the Node.js 20+ Buffer<ArrayBufferLike>
 * type mismatch with ExcelJS's legacy Buffer type definition.
 */
export async function loadExcelWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  // Zip bomb guard: sum uncompressed sizes from ZIP central directory headers
  checkDecompressedSize(buffer)

  const workbook = new ExcelJS.Workbook()
  // @ts-expect-error — ExcelJS types expect legacy Buffer; Node.js 20+ returns Buffer<ArrayBufferLike>
  await workbook.xlsx.load(Buffer.from(new Uint8Array(buffer)))
  return workbook
}

// ZIP format constants
const EOCD_SIGNATURE = 0x06054b50
const CD_ENTRY_SIGNATURE = 0x02014b50
const CD_ENTRY_MIN_SIZE = 46 // Fixed-size portion of a central directory entry

/**
 * Parse ZIP central directory to sum uncompressed file sizes.
 * This reads only metadata (no decompression), making it safe against zip bombs.
 *
 * ZIP format:
 * - End of Central Directory (EOCD) is at the end of the file
 * - EOCD contains offset + size of Central Directory
 * - Each CD entry has a 4-byte uncompressed size field at offset 24
 */
function checkDecompressedSize(buffer: ArrayBuffer): void {
  const view = new DataView(buffer)
  const size = buffer.byteLength

  // Find End of Central Directory record (scan backwards from end)
  // EOCD minimum size is 22 bytes, max comment length is 65535
  const searchStart = Math.max(0, size - 22 - 65535)
  let eocdOffset = -1

  for (let i = size - 22; i >= searchStart; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocdOffset = i
      break
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP file — End of Central Directory not found')
  }

  // EOCD layout (little-endian):
  // offset 12: size of central directory (4 bytes)
  // offset 16: offset of central directory (4 bytes)
  const cdSize = view.getUint32(eocdOffset + 12, true)
  const cdOffset = view.getUint32(eocdOffset + 16, true)

  if (cdOffset + cdSize > size) {
    throw new Error('Invalid ZIP file — Central Directory extends past file end')
  }

  // Walk central directory entries and sum uncompressed sizes
  let totalDecompressed = 0
  let pos = cdOffset

  while (pos < cdOffset + cdSize) {
    if (pos + CD_ENTRY_MIN_SIZE > size) break
    if (view.getUint32(pos, true) !== CD_ENTRY_SIGNATURE) break

    // CD entry layout (little-endian):
    // offset 24: uncompressed size (4 bytes)
    // offset 28: file name length (2 bytes)
    // offset 30: extra field length (2 bytes)
    // offset 32: file comment length (2 bytes)
    const uncompressedSize = view.getUint32(pos + 24, true)
    const fileNameLen = view.getUint16(pos + 28, true)
    const extraLen = view.getUint16(pos + 30, true)
    const commentLen = view.getUint16(pos + 32, true)

    totalDecompressed += uncompressedSize

    // Early termination — no need to scan remaining entries
    if (totalDecompressed > MAX_EXCEL_DECOMPRESSED_BYTES) {
      throw new Error(
        `Excel file decompressed size (${totalDecompressed} bytes) exceeds maximum allowed (${MAX_EXCEL_DECOMPRESSED_BYTES} bytes). File may be a zip bomb.`,
      )
    }

    // Advance to next CD entry
    pos += CD_ENTRY_MIN_SIZE + fileNameLen + extraLen + commentLen
  }
}
