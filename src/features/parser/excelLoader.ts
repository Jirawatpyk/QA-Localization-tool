import 'server-only'

import ExcelJS from 'exceljs'

/**
 * Load an ExcelJS Workbook from an ArrayBuffer.
 *
 * Centralises the @ts-expect-error needed for the Node.js 20+ Buffer<ArrayBufferLike>
 * type mismatch with ExcelJS's legacy Buffer type definition. Both excelParser.ts and
 * previewExcelColumns.action.ts use this helper to avoid duplicating the suppression.
 */
export async function loadExcelWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  // @ts-expect-error — ExcelJS types expect legacy Buffer; Node.js 20+ returns Buffer<ArrayBufferLike>
  await workbook.xlsx.load(Buffer.from(new Uint8Array(buffer)))
  return workbook
}
