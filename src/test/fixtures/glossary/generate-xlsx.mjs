/**
 * Generates test-glossary.xlsx fixture for glossary Excel parser integration tests.
 * Run: node src/test/fixtures/glossary/generate-xlsx.mjs
 */
import path from 'path'
import { fileURLToPath } from 'url'

import ExcelJS from 'exceljs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function generate() {
  const workbook = new ExcelJS.Workbook()

  // Sheet 1: Standard glossary with headers
  const ws = workbook.addWorksheet('Glossary')
  ws.addRow(['source', 'target', 'notes'])

  // Normal EN-TH terms
  ws.addRow(['System', 'ระบบ', 'IT term'])
  ws.addRow(['Database', 'ฐานข้อมูล', 'IT term'])
  ws.addRow(['Cloud Computing', 'คลาวด์คอมพิวติ้ง', 'Technology'])
  ws.addRow(['Machine Learning', 'การเรียนรู้ของเครื่อง', 'AI domain'])
  ws.addRow(['Authentication', 'การยืนยันตัวตน', 'Security'])

  // Thai with sara am (U+0E33) — tests NFKC normalization behavior
  ws.addRow(['Participation', 'การมีส่วนร่วม', 'General'])

  // Extra whitespace in cells (should be trimmed)
  ws.addRow(['  User Interface  ', '  ส่วนติดต่อผู้ใช้  ', 'Whitespace test'])

  // Special characters
  ws.addRow(['C++ / C#', 'ซีพลัสพลัส / ซีชาร์ป', 'Programming languages'])

  // Half-width katakana → NFKC normalizes to full-width
  ws.addRow(['Programming', '\uFF8C\uFF9F\uFF9B\uFF78\uFF9E\uFF97\uFF90\uFF9D\uFF78\uFF9E', 'NFKC test'])

  // Empty source (should produce EMPTY_SOURCE error)
  ws.addRow(['', 'ค่าว่าง', 'Empty source test'])

  // Empty target (should produce MISSING_TARGET error)
  ws.addRow(['Empty Target Test', '', 'Empty target test'])

  // Row with only whitespace source (trims to empty → EMPTY_SOURCE)
  ws.addRow(['   ', 'ช่องว่าง', 'Whitespace-only source'])

  const outPath = path.join(__dirname, 'test-glossary.xlsx')
  await workbook.xlsx.writeFile(outPath)
  // eslint-disable-next-line no-console -- one-off CLI fixture generator
  console.log(`Generated: ${outPath}`)
}

generate().catch(console.error)
