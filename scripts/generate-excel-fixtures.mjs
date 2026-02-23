/**
 * Generate Excel (.xlsx) test fixtures for Story 2.3
 * Run: node scripts/generate-excel-fixtures.mjs
 */

import { createRequire } from 'module'
import { existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const ExcelJS = require('exceljs')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = join(__dirname, '..')

const UNIT_FIXTURES_DIR = join(root, 'src', 'test', 'fixtures', 'excel')
const E2E_FIXTURES_DIR = join(root, 'e2e', 'fixtures', 'excel')

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

async function createBilingualWithHeaders() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(['Source', 'Target', 'Segment ID', 'Notes'])
  ws.addRow(['Hello', 'สวัสดี', 'TU-001', 'Greeting'])
  ws.addRow(['Goodbye', 'ลาก่อน', 'TU-002', 'Farewell'])
  ws.addRow(['Thank you', 'ขอบคุณ', 'TU-003', 'Courtesy'])
  ws.addRow(['Yes', 'ใช่', 'TU-004', ''])
  ws.addRow(['No', 'ไม่', 'TU-005', ''])
  ws.addRow(['Please', 'กรุณา', 'TU-006', ''])
  ws.addRow(['Sorry', 'ขอโทษ', 'TU-007', ''])
  ws.addRow(['Help', 'ช่วยด้วย', 'TU-008', ''])
  ws.addRow(['Good morning', 'อรุณสวัสดิ์', 'TU-009', ''])
  ws.addRow(['Good night', 'ราตรีสวัสดิ์', 'TU-010', ''])
  await wb.xlsx.writeFile(join(UNIT_FIXTURES_DIR, 'bilingual-with-headers.xlsx'))
  console.log('Created: bilingual-with-headers.xlsx (10 rows, EN→TH)')
}

async function createBilingualNoHeaders() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(['Hello', 'สวัสดี'])
  ws.addRow(['Goodbye', 'ลาก่อน'])
  ws.addRow(['Thank you', 'ขอบคุณ'])
  ws.addRow(['Yes', 'ใช่'])
  ws.addRow(['No', 'ไม่'])
  ws.addRow(['Please', 'กรุณา'])
  ws.addRow(['Sorry', 'ขอโทษ'])
  ws.addRow(['Help', 'ช่วยด้วย'])
  ws.addRow(['Good morning', 'อรุณสวัสดิ์'])
  ws.addRow(['Good night', 'ราตรีสวัสดิ์'])
  await wb.xlsx.writeFile(join(UNIT_FIXTURES_DIR, 'bilingual-no-headers.xlsx'))
  console.log('Created: bilingual-no-headers.xlsx (10 rows, no headers)')
}

async function createBilingualAutoDetect() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(['Original', 'Translation', 'ID'])
  ws.addRow(['Hello', 'สวัสดี', '001'])
  ws.addRow(['Goodbye', 'ลาก่อน', '002'])
  ws.addRow(['Thank you', 'ขอบคุณ', '003'])
  ws.addRow(['Yes', 'ใช่', '004'])
  ws.addRow(['No', 'ไม่', '005'])
  await wb.xlsx.writeFile(join(UNIT_FIXTURES_DIR, 'bilingual-auto-detect.xlsx'))
  console.log('Created: bilingual-auto-detect.xlsx (Original/Translation headers)')
}

async function createEmptyRows() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(['Source', 'Target'])
  ws.addRow(['Hello', 'สวัสดี'])
  ws.addRow(['', '']) // empty row — should be skipped
  ws.addRow(['Thank you', 'ขอบคุณ'])
  ws.addRow([null, null]) // null row — should be skipped
  ws.addRow(['Yes', 'ใช่'])
  ws.addRow(['   ', '   ']) // whitespace-only — should be skipped
  ws.addRow(['No', 'ไม่'])
  await wb.xlsx.writeFile(join(UNIT_FIXTURES_DIR, 'empty-rows.xlsx'))
  console.log('Created: empty-rows.xlsx (rows with gaps)')
}

async function createSingleRow() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(['Source', 'Target'])
  ws.addRow(['Hello world', 'สวัสดีโลก'])
  await wb.xlsx.writeFile(join(UNIT_FIXTURES_DIR, 'single-row.xlsx'))
  console.log('Created: single-row.xlsx (header + 1 data row)')
}

async function createCjkThaiContent() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(['Source', 'Target'])
  // Thai text
  ws.addRow(['สวัสดีครับ ผมชื่อสมชาย', 'Hello, my name is Somchai'])
  // CJK text
  ws.addRow(['这是一个测试文本', '這是一個測試文本'])
  // Japanese
  ws.addRow(['テスト文字列', 'Test string'])
  // Korean
  ws.addRow(['테스트 텍스트', 'Test text'])
  // Mixed
  ws.addRow(['Hello สวัสดี 你好', 'Greetings in multiple languages'])
  await wb.xlsx.writeFile(join(UNIT_FIXTURES_DIR, 'cjk-thai-content.xlsx'))
  console.log('Created: cjk-thai-content.xlsx (Thai and CJK text)')
}

async function createMalformed() {
  // Write a non-xlsx binary to simulate a corrupted file
  const { writeFileSync } = await import('fs')
  const corruptedData = Buffer.from('This is not a valid Excel file! PK garbage data \x00\xFF\xFE', 'utf8')
  writeFileSync(join(UNIT_FIXTURES_DIR, 'malformed.xlsx'), corruptedData)
  console.log('Created: malformed.xlsx (corrupted binary)')
}

async function createPasswordProtected() {
  // ExcelJS does NOT support writing password-protected files natively.
  // We simulate by writing a file that uses the OOXML encrypted format header.
  // In practice, we create a valid xlsx but with a special marker, and the test
  // mocks ExcelJS to throw the password error.
  // For CI/integration testing, we write a file that mimics the CFBF format header
  // used by password-protected .xlsx files (Office Open XML encrypted container).
  const { writeFileSync } = await import('fs')
  // CFBF magic bytes (D0 CF 11 E0 A1 B1 1A E1) = OLE2 compound file (used for encrypted xlsx)
  const cfbfMagic = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...Array(512 - 8).fill(0)])
  writeFileSync(join(UNIT_FIXTURES_DIR, 'password-protected.xlsx'), cfbfMagic)
  console.log('Created: password-protected.xlsx (CFBF/encrypted header)')
}

async function createMultipleSheets() {
  const wb = new ExcelJS.Workbook()
  // Sheet 1 (should be parsed)
  const ws1 = wb.addWorksheet('Main')
  ws1.addRow(['Source', 'Target'])
  ws1.addRow(['Hello', 'สวัสดี'])
  ws1.addRow(['World', 'โลก'])
  // Sheet 2 (should NOT be parsed)
  const ws2 = wb.addWorksheet('Reference')
  ws2.addRow(['Notes'])
  ws2.addRow(['This sheet should be ignored'])
  // Sheet 3 (should NOT be parsed)
  const ws3 = wb.addWorksheet('Metadata')
  ws3.addRow(['Key', 'Value'])
  ws3.addRow(['version', '1.0'])
  await wb.xlsx.writeFile(join(UNIT_FIXTURES_DIR, 'multiple-sheets.xlsx'))
  console.log('Created: multiple-sheets.xlsx (3 sheets, only sheet 1 used)')
}

async function createMergedCells() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(['Source', 'Target'])
  ws.addRow(['Hello', 'สวัสดี'])
  // Merge cells A3:A4 (merged source) — ExcelJS puts value only in A3, A4 is null
  ws.getCell('A3').value = 'Merged source'
  ws.getCell('B3').value = 'คำแปล'
  ws.mergeCells('A3:A4')
  ws.getCell('B4').value = 'another'
  ws.addRow(['Normal row', 'ปกติ'])
  await wb.xlsx.writeFile(join(UNIT_FIXTURES_DIR, 'merged-cells.xlsx'))
  console.log('Created: merged-cells.xlsx (merged cells in source column)')
}

async function createLarge5000Rows() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(['Source', 'Target'])
  for (let i = 1; i <= 5000; i++) {
    ws.addRow([
      `Source segment number ${i} with some text content for testing`,
      `เนื้อหาเป้าหมาย ${i} สำหรับการทดสอบประสิทธิภาพ`,
    ])
  }
  await wb.xlsx.writeFile(join(UNIT_FIXTURES_DIR, 'large-5000-rows.xlsx'))
  console.log('Created: large-5000-rows.xlsx (5000 rows, performance fixture)')
}

async function createE2ESample() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(['Source', 'Target', 'Segment ID'])
  ws.addRow(['Hello', 'สวัสดี', 'SEG-001'])
  ws.addRow(['Good morning', 'อรุณสวัสดิ์', 'SEG-002'])
  ws.addRow(['Thank you', 'ขอบคุณ', 'SEG-003'])
  ws.addRow(['Goodbye', 'ลาก่อน', 'SEG-004'])
  ws.addRow(['Please wait', 'กรุณารอสักครู่', 'SEG-005'])
  await wb.xlsx.writeFile(join(E2E_FIXTURES_DIR, 'bilingual-sample.xlsx'))
  console.log('Created: e2e/fixtures/excel/bilingual-sample.xlsx (5 rows, E2E fixture)')
}

async function main() {
  console.log('Generating Excel test fixtures...\n')

  ensureDir(UNIT_FIXTURES_DIR)
  ensureDir(E2E_FIXTURES_DIR)

  await createBilingualWithHeaders()
  await createBilingualNoHeaders()
  await createBilingualAutoDetect()
  await createEmptyRows()
  await createSingleRow()
  await createCjkThaiContent()
  await createMalformed()
  await createPasswordProtected()
  await createMultipleSheets()
  await createMergedCells()
  await createLarge5000Rows()
  await createE2ESample()

  console.log('\nAll fixtures generated successfully!')
  console.log(`Unit fixtures: ${UNIT_FIXTURES_DIR}`)
  console.log(`E2E fixtures:  ${E2E_FIXTURES_DIR}`)
}

main().catch((err) => {
  console.error('Fixture generation failed:', err)
  process.exit(1)
})
