/**
 * Generate synthetic 500-segment SDLXLIFF test file with deliberately injected errors
 * for Story 4.8 verification baseline.
 *
 * Run: node scripts/generate-verification-data.mjs
 * Output:
 *   docs/test-data/verification-baseline/verification-500.sdlxliff
 *   docs/test-data/verification-baseline/baseline-annotations.json
 */

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'docs', 'test-data', 'verification-baseline')

// ============================================================
// Thai training content templates (realistic localization data)
// ============================================================

const SOURCE_TEMPLATES = [
  'Please ensure that all {0} participants have completed the registration form before the training session begins.',
  'The quarterly report shows a {0}% increase in customer satisfaction scores compared to last year.',
  'Click the "Submit" button to save your changes and proceed to the next step.',
  'Warning: This action cannot be undone. Are you sure you want to delete {0} items?',
  'The system requires a minimum of {0} characters for the password field.',
  'For more information, please contact our support team at {0} or visit our help center.',
  'Step {0}: Review the document carefully before signing the agreement.',
  'The total cost including tax is ${0} for {1} units.',
  'Please note that the deadline for submission is {0} business days from today.',
  'Error code {0}: The server encountered an unexpected condition that prevented it from fulfilling the request.',
  'The training module covers {0} key topics including safety protocols and emergency procedures.',
  'Users with admin privileges can access the settings panel by navigating to Settings > Administration > User Management.',
  'The barista trainer program has been updated to include {0} new modules for the current quarter.',
  'All team members must complete the certification exam with a minimum score of {0}%.',
  'The inventory system shows {0} items in stock across {1} warehouse locations.',
  'Please review the attached document ({0} pages) and provide your feedback by end of day.',
  'The application supports {0} languages including Thai, Chinese, Japanese, and Korean.',
  'Performance metrics indicate that response time has improved by {0}ms since the last update.',
  'The new feature allows users to export data in {0} formats: PDF, Excel, and CSV.',
  'Security notice: Your session will expire in {0} minutes due to inactivity.',
  'The company achieved record revenue of ${0} million in the fiscal year {1}.',
  'Employees are required to complete {0} hours of professional development training annually.',
  'The database backup was completed successfully at {0} with {1} records processed.',
  'Click "Next" to continue or "Back" to return to the previous page.',
  'The quality assurance process involves {0} stages of review before final approval.',
  'Welcome to the learning management system. You have {0} pending courses and {1} completed certifications.',
  'The project timeline has been extended by {0} weeks to accommodate the additional requirements.',
  'Important: All changes must be saved before navigating away from this page.',
  'The report generated on {0} contains {1} findings across {2} categories.',
  'For optimal performance, we recommend using the latest version of Chrome, Firefox, or Edge browser.',
]

const TARGET_TEMPLATES = [
  'กรุณาตรวจสอบให้แน่ใจว่าผู้เข้าร่วม {0} คนทั้งหมดได้กรอกแบบฟอร์มลงทะเบียนก่อนเริ่มการฝึกอบรม',
  'รายงานรายไตรมาสแสดงให้เห็นว่าคะแนนความพึงพอใจของลูกค้าเพิ่มขึ้น {0}% เมื่อเทียบกับปีที่แล้ว',
  'คลิกปุ่ม "ส่ง" เพื่อบันทึกการเปลี่ยนแปลงของคุณและดำเนินการขั้นตอนถัดไป',
  'คำเตือน: การดำเนินการนี้ไม่สามารถย้อนกลับได้ คุณแน่ใจหรือไม่ว่าต้องการลบ {0} รายการ?',
  'ระบบต้องการอักขระขั้นต่ำ {0} ตัวสำหรับช่องรหัสผ่าน',
  'สำหรับข้อมูลเพิ่มเติม กรุณาติดต่อทีมสนับสนุนของเราที่ {0} หรือเยี่ยมชมศูนย์ช่วยเหลือ',
  'ขั้นตอนที่ {0}: ตรวจสอบเอกสารอย่างละเอียดก่อนลงนามในข้อตกลง',
  'ค่าใช้จ่ายทั้งหมดรวมภาษีคือ ${0} สำหรับ {1} หน่วย',
  'โปรดทราบว่ากำหนดเวลาในการส่งคือ {0} วันทำการนับจากวันนี้',
  'รหัสข้อผิดพลาด {0}: เซิร์ฟเวอร์พบสถานการณ์ที่ไม่คาดคิดซึ่งป้องกันไม่ให้ทำตามคำขอ',
  'โมดูลการฝึกอบรมครอบคลุม {0} หัวข้อหลักรวมถึงระเบียบปฏิบัติด้านความปลอดภัยและขั้นตอนฉุกเฉิน',
  'ผู้ใช้ที่มีสิทธิ์ผู้ดูแลระบบสามารถเข้าถึงแผงการตั้งค่าโดยไปที่ การตั้งค่า > การจัดการ > การจัดการผู้ใช้',
  'โปรแกรมฝึกอบรมบาริสต้าได้รับการอัปเดตให้รวม {0} โมดูลใหม่สำหรับไตรมาสปัจจุบัน',
  'สมาชิกทีมทุกคนต้องสอบผ่านการรับรองด้วยคะแนนขั้นต่ำ {0}%',
  'ระบบสินค้าคงคลังแสดง {0} รายการในสต็อกใน {1} สถานที่คลังสินค้า',
  'กรุณาตรวจสอบเอกสารแนบ ({0} หน้า) และให้ข้อเสนอแนะภายในสิ้นวัน',
  'แอปพลิเคชันรองรับ {0} ภาษา รวมถึงไทย จีน ญี่ปุ่น และเกาหลี',
  'ตัวชี้วัดประสิทธิภาพระบุว่าเวลาตอบสนองดีขึ้น {0}ms ตั้งแต่การอัปเดตครั้งล่าสุด',
  'ฟีเจอร์ใหม่ช่วยให้ผู้ใช้สามารถส่งออกข้อมูลในรูปแบบ {0}: PDF, Excel และ CSV',
  'แจ้งเตือนความปลอดภัย: เซสชันของคุณจะหมดอายุใน {0} นาทีเนื่องจากไม่มีกิจกรรม',
  'บริษัทมีรายได้ทำลายสถิติ ${0} ล้านในปีงบประมาณ {1}',
  'พนักงานจำเป็นต้องเข้าร่วมการฝึกอบรมพัฒนาวิชาชีพ {0} ชั่วโมงต่อปี',
  'การสำรองฐานข้อมูลเสร็จสมบูรณ์ที่ {0} โดยมี {1} รายการที่ประมวลผล',
  'คลิก "ถัดไป" เพื่อดำเนินการต่อ หรือ "ย้อนกลับ" เพื่อกลับไปยังหน้าก่อนหน้า',
  'กระบวนการประกันคุณภาพประกอบด้วย {0} ขั้นตอนของการตรวจสอบก่อนการอนุมัติขั้นสุดท้าย',
  'ยินดีต้อนรับสู่ระบบจัดการเรียนรู้ คุณมี {0} หลักสูตรที่รอดำเนินการและ {1} การรับรองที่เสร็จสมบูรณ์',
  'ไทม์ไลน์ของโครงการได้รับการขยายออกไป {0} สัปดาห์เพื่อรองรับข้อกำหนดเพิ่มเติม',
  'สำคัญ: การเปลี่ยนแปลงทั้งหมดต้องถูกบันทึกก่อนออกจากหน้านี้',
  'รายงานที่สร้างเมื่อ {0} ประกอบด้วย {1} ข้อค้นพบใน {2} หมวดหมู่',
  'เพื่อประสิทธิภาพสูงสุด เราแนะนำให้ใช้เวอร์ชันล่าสุดของเบราว์เซอร์ Chrome, Firefox หรือ Edge',
]

// ============================================================
// Error injection configuration
// ============================================================

// Error types and their segment positions (deterministic)
const ERRORS = {
  number_mismatch: [], // ~20: source number != target number
  tag_error: [],       // ~15: missing/extra inline tags
  glossary_violation: [], // ~15: known term translated wrong
  consistency_error: [], // ~10: same source, different target
  whitespace_issue: [],  // ~10: double spaces, trailing spaces
  placeholder_mismatch: [], // ~10: missing {0} placeholders
}

// Assign error positions deterministically (spread across 500 segments)
function assignErrorPositions() {
  // Number mismatches: segments 12, 25, 38, 51, 72, 95, 118, 141, 164, 187,
  // 210, 233, 256, 279, 302, 325, 348, 371, 394, 417
  for (let i = 0; i < 20; i++) {
    ERRORS.number_mismatch.push(12 + i * 23 - (i > 10 ? i - 10 : 0))
  }

  // Tag errors: segments 7, 33, 59, 85, 111, 137, 163, 189, 215, 241, 267, 293, 319, 345, 440
  for (let i = 0; i < 15; i++) {
    ERRORS.tag_error.push(7 + i * 26 + (i > 12 ? (i - 12) * 20 : 0))
  }

  // Glossary violations: segments 15, 45, 75, 105, 135, 165, 195, 225, 255, 285, 315, 345, 375, 405, 435
  for (let i = 0; i < 15; i++) {
    ERRORS.glossary_violation.push(15 + i * 30)
  }

  // Consistency errors: pairs — same source, different target
  // Segments: (20,120), (50,150), (80,180), (100,200), (130,230),
  //           (160,260), (190,290), (220,320), (250,350), (280,380)
  for (let i = 0; i < 10; i++) {
    ERRORS.consistency_error.push(20 + i * 30)
    ERRORS.consistency_error.push(120 + i * 30)
  }

  // Whitespace issues: segments 18, 48, 78, 108, 168, 198, 268, 338, 408, 478
  ERRORS.whitespace_issue.push(18, 48, 78, 108, 168, 198, 268, 338, 408, 478)

  // Placeholder mismatches: segments 22, 62, 102, 142, 182, 222, 262, 342, 422, 462
  ERRORS.placeholder_mismatch.push(22, 62, 102, 142, 182, 222, 262, 342, 422, 462)
}

assignErrorPositions()

// Flatten all error positions into a lookup
function getErrorType(segNum) {
  if (ERRORS.number_mismatch.includes(segNum)) return 'number_mismatch'
  if (ERRORS.tag_error.includes(segNum)) return 'tag_error'
  if (ERRORS.glossary_violation.includes(segNum)) return 'glossary_violation'
  if (ERRORS.whitespace_issue.includes(segNum)) return 'whitespace_issue'
  if (ERRORS.placeholder_mismatch.includes(segNum)) return 'placeholder_mismatch'
  // Consistency errors are tracked as pairs
  if (ERRORS.consistency_error.includes(segNum)) return 'consistency_error'
  return null
}

function getExpectedSeverity(errorType) {
  switch (errorType) {
    case 'number_mismatch': return 'critical'
    case 'tag_error': return 'major'
    case 'glossary_violation': return 'major'
    case 'consistency_error': return 'minor'
    case 'whitespace_issue': return 'minor'
    case 'placeholder_mismatch': return 'critical'
    default: return null
  }
}

function getExpectedCategory(errorType) {
  switch (errorType) {
    case 'number_mismatch': return 'accuracy'
    case 'tag_error': return 'markup'
    case 'glossary_violation': return 'terminology'
    case 'consistency_error': return 'consistency'
    case 'whitespace_issue': return 'whitespace'
    case 'placeholder_mismatch': return 'accuracy'
    default: return null
  }
}

function getInjectedLayer(errorType) {
  // L1 detectable: number_mismatch, tag_error, whitespace_issue, placeholder_mismatch
  // L2 detectable: glossary_violation, consistency_error (need AI to catch)
  switch (errorType) {
    case 'number_mismatch': return 'L1'
    case 'tag_error': return 'L1'
    case 'whitespace_issue': return 'L1'
    case 'placeholder_mismatch': return 'L1'
    case 'glossary_violation': return 'L2'
    case 'consistency_error': return 'L2'
    default: return null
  }
}

// ============================================================
// Segment content generation
// ============================================================

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function generateNumbers(segNum) {
  // Deterministic "random" based on segment number
  const n1 = ((segNum * 7 + 13) % 900) + 100
  const n2 = ((segNum * 3 + 7) % 50) + 1
  return { n1, n2 }
}

function generateSegment(segNum) {
  const templateIdx = (segNum - 1) % SOURCE_TEMPLATES.length
  const { n1, n2 } = generateNumbers(segNum)
  const errorType = getErrorType(segNum)

  let sourceText = SOURCE_TEMPLATES[templateIdx]
    .replace('{0}', String(n1))
    .replace('{1}', String(n2))
    .replace('{2}', String(((segNum * 11) % 8) + 2))

  let targetText = TARGET_TEMPLATES[templateIdx]
    .replace('{0}', String(n1))
    .replace('{1}', String(n2))
    .replace('{2}', String(((segNum * 11) % 8) + 2))

  let sourceHasTag = false
  let targetHasTag = false

  // Inject errors based on type
  switch (errorType) {
    case 'number_mismatch': {
      // Change a number in the target
      const wrongNum = n1 + ((segNum % 5) + 1) * 10
      targetText = targetText.replace(String(n1), String(wrongNum))
      break
    }
    case 'tag_error': {
      // Add tag to source but omit in target
      sourceText = `<g id="${segNum}">${sourceText}</g>`
      sourceHasTag = true
      // Target does NOT have the tag — this is the error
      break
    }
    case 'glossary_violation': {
      // Replace a known term with wrong translation
      const glossaryErrors = [
        { src: 'training', wrongTgt: 'การเรียน', correctTgt: 'การฝึกอบรม' },
        { src: 'system', wrongTgt: 'เครื่อง', correctTgt: 'ระบบ' },
        { src: 'report', wrongTgt: 'เอกสาร', correctTgt: 'รายงาน' },
        { src: 'performance', wrongTgt: 'ผลงาน', correctTgt: 'ประสิทธิภาพ' },
        { src: 'application', wrongTgt: 'โปรแกรม', correctTgt: 'แอปพลิเคชัน' },
      ]
      const ge = glossaryErrors[(segNum - 1) % glossaryErrors.length]
      if (targetText.includes(ge.correctTgt)) {
        targetText = targetText.replace(ge.correctTgt, ge.wrongTgt)
      }
      break
    }
    case 'consistency_error': {
      // For the second segment in a consistency pair, alter the target slightly
      if (segNum >= 120) {
        targetText = targetText + ' (ฉบับแก้ไข)'
      }
      break
    }
    case 'whitespace_issue': {
      // Introduce double space or trailing space
      if (segNum % 2 === 0) {
        targetText = targetText.replace(' ', '  ') // double space
      } else {
        targetText = targetText + '   ' // trailing spaces
      }
      break
    }
    case 'placeholder_mismatch': {
      // Remove a placeholder from target
      targetText = targetText.replace(String(n1), '')
      break
    }
  }

  return { sourceText, targetText, sourceHasTag, targetHasTag, errorType }
}

// ============================================================
// SDLXLIFF generation
// ============================================================

function generateSdlxliff(segmentCount) {
  const lines = []
  lines.push('<?xml version="1.0" encoding="utf-8"?>')
  lines.push('<xliff xmlns:sdl="http://sdl.com/FileTypes/SdlXliff/1.0" xmlns="urn:oasis:names:tc:xliff:document:1.2" version="1.2" sdl:version="1.0">')
  lines.push('<file original="verification-500.docx" datatype="x-sdlfilterframework2" source-language="en-US" target-language="th-TH">')
  lines.push('<header/>')
  lines.push('<body>')

  for (let i = 1; i <= segmentCount; i++) {
    const { sourceText, targetText, sourceHasTag } = generateSegment(i)
    const mid = String(i)

    lines.push(`<trans-unit id="tu-${i}">`)

    // seg-source with mrk
    lines.push('<seg-source>')
    if (sourceHasTag) {
      lines.push(`<mrk mtype="seg" mid="${mid}">${escapeXml(sourceText)}</mrk>`)
    } else {
      lines.push(`<mrk mtype="seg" mid="${mid}">${escapeXml(sourceText)}</mrk>`)
    }
    lines.push('</seg-source>')

    // target with mrk
    lines.push('<target>')
    lines.push(`<mrk mtype="seg" mid="${mid}">${escapeXml(targetText)}</mrk>`)
    lines.push('</target>')

    // sdl:seg-defs (confirmation state)
    const confStates = ['Translated', 'Draft', 'ApprovedTranslation', 'Translated', 'Draft']
    const conf = confStates[(i - 1) % confStates.length]
    const percent = conf === 'ApprovedTranslation' ? 100 : ((i * 13) % 101)
    lines.push('<sdl:seg-defs>')
    lines.push(`<sdl:seg id="${mid}" conf="${conf}" percent="${percent}"/>`)
    lines.push('</sdl:seg-defs>')

    lines.push('</trans-unit>')
  }

  lines.push('</body>')
  lines.push('</file>')
  lines.push('</xliff>')

  return lines.join('\n')
}

// ============================================================
// Baseline annotations generation
// ============================================================

function generateAnnotations(segmentCount) {
  const annotations = { segments: {} }

  for (let i = 1; i <= segmentCount; i++) {
    const errorType = getErrorType(i)
    if (errorType) {
      const severity = getExpectedSeverity(errorType)
      const category = getExpectedCategory(errorType)
      const layer = getInjectedLayer(errorType)

      annotations.segments[String(i)] = {
        expected_category: category,
        expected_severity: severity,
        injected_type: layer,
        error_type: errorType,
        description: getErrorDescription(i, errorType),
      }
    }
  }

  return annotations
}

function getErrorDescription(segNum, errorType) {
  const { n1 } = generateNumbers(segNum)
  switch (errorType) {
    case 'number_mismatch': {
      const wrongNum = n1 + ((segNum % 5) + 1) * 10
      return `Number mismatch: source has "${n1}" but target has "${wrongNum}"`
    }
    case 'tag_error':
      return `Missing closing tag in target: source has <g id="${segNum}">...</g> but target has no tags`
    case 'glossary_violation':
      return 'Glossary term translated incorrectly (wrong synonym used)'
    case 'consistency_error':
      return segNum >= 120
        ? `Inconsistent translation: same source as segment ${segNum - 100} but different target`
        : `Consistency pair source segment (pair target at segment ${segNum + 100})`
    case 'whitespace_issue':
      return segNum % 2 === 0 ? 'Double space in target text' : 'Trailing whitespace in target text'
    case 'placeholder_mismatch':
      return `Placeholder missing in target: number "${n1}" removed from translation`
    default:
      return ''
  }
}

// ============================================================
// Main
// ============================================================

const SEGMENT_COUNT = 500

console.log(`Generating ${SEGMENT_COUNT}-segment SDLXLIFF...`)

const sdlxliff = generateSdlxliff(SEGMENT_COUNT)
const sdlxliffPath = join(OUT_DIR, 'verification-500.sdlxliff')
writeFileSync(sdlxliffPath, sdlxliff, 'utf-8')
console.log(`  Written: ${sdlxliffPath} (${(Buffer.byteLength(sdlxliff) / 1024).toFixed(1)} KB)`)

const annotations = generateAnnotations(SEGMENT_COUNT)
const annotationsPath = join(OUT_DIR, 'baseline-annotations.json')
writeFileSync(annotationsPath, JSON.stringify(annotations, null, 2), 'utf-8')
const errorCount = Object.keys(annotations.segments).length
console.log(`  Written: ${annotationsPath} (${errorCount} annotated errors)`)

// Summary
const errorCounts = {}
for (const seg of Object.values(annotations.segments)) {
  errorCounts[seg.error_type] = (errorCounts[seg.error_type] || 0) + 1
}
console.log('\nError injection summary:')
for (const [type, count] of Object.entries(errorCounts)) {
  console.log(`  ${type}: ${count}`)
}
console.log(`  TOTAL: ${errorCount}`)
