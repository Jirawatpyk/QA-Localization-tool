import type { GoldenSegment } from './types'

/**
 * Golden test segments for prompt evaluation.
 *
 * Hand-crafted segments with KNOWN issues (positive) and CORRECT translations (negative).
 * These test the AI's ability to:
 * 1. Detect real quality issues (recall)
 * 2. Not over-flag correct translations (precision)
 *
 * Each segment represents a specific issue category or a known-good translation.
 * Language pairs: primarily EN→TH (Thai) as our primary use case,
 * with some EN→JA (Japanese) and EN→ZH-CN (Chinese) for coverage.
 */

// ── POSITIVE: Segments WITH issues (AI must detect) ──

const CRITICAL_MISTRANSLATION: GoldenSegment = {
  id: 'golden-001',
  label: 'Critical mistranslation — opposite meaning',
  source: 'Do NOT delete your account without backing up your data first.',
  target: 'ลบบัญชีของคุณก่อนที่จะสำรองข้อมูล',
  sourceLang: 'en',
  targetLang: 'th',
  expectedFindings: [
    {
      category: 'accuracy',
      severity: 'critical',
      descriptionKeywords: ['meaning', 'NOT', 'opposite', 'delete'],
    },
  ],
  expectNoFinding: false,
}

const OMISSION_SAFETY_INFO: GoldenSegment = {
  id: 'golden-002',
  label: 'Omission — safety warning removed',
  source:
    'Warning: This action is irreversible. All files will be permanently deleted. Please confirm.',
  target: 'คำเตือน: การกระทำนี้ไม่สามารถย้อนกลับได้ กรุณายืนยัน',
  sourceLang: 'en',
  targetLang: 'th',
  expectedFindings: [
    {
      category: 'accuracy',
      severity: 'major',
      descriptionKeywords: ['omit', 'permanently deleted', 'missing'],
    },
  ],
  expectNoFinding: false,
}

const SPELLING_ERROR: GoldenSegment = {
  id: 'golden-003',
  label: 'Spelling error in Thai target',
  source: 'Save your changes before continuing.',
  target: 'บันทักการเปลี่ยนแปลงก่อนดำเนินการต่อ',
  sourceLang: 'en',
  targetLang: 'th',
  expectedFindings: [
    {
      category: 'accuracy',
      severity: 'critical',
      descriptionKeywords: ['บันทัก', 'บันทึก', 'spell', 'typo'],
    },
  ],
  expectNoFinding: false,
}

const REGISTER_MISMATCH: GoldenSegment = {
  id: 'golden-004',
  label: 'Register mismatch — formal source, casual target',
  source:
    'We sincerely apologize for the inconvenience. Please allow 3-5 business days for processing.',
  target: 'ขอโทษนะ มีปัญหาหน่อย รอสัก 3-5 วันเน้อ',
  sourceLang: 'en',
  targetLang: 'th',
  expectedFindings: [
    {
      category: 'style',
      severity: 'major',
      descriptionKeywords: ['register', 'formal', 'casual', 'tone'],
    },
  ],
  expectNoFinding: false,
}

const ADDITION_EXTRA_INFO: GoldenSegment = {
  id: 'golden-005',
  label: 'Addition — extra content not in source',
  source: 'Enter your email address.',
  target: 'กรอกอีเมลของคุณ (ใช้อีเมลที่ลงทะเบียนกับธนาคารเท่านั้น)',
  sourceLang: 'en',
  targetLang: 'th',
  expectedFindings: [
    {
      category: 'accuracy',
      severity: 'major',
      descriptionKeywords: ['add', 'extra', 'not in source', 'ธนาคาร'],
    },
  ],
  expectNoFinding: false,
}

const FLUENCY_UNNATURAL: GoldenSegment = {
  id: 'golden-006',
  label: 'Fluency — overly literal translation',
  source: 'The system is currently undergoing scheduled maintenance.',
  target: 'ระบบอยู่ในช่วงระหว่างการบำรุงรักษาที่ถูกกำหนดเวลาไว้ในปัจจุบัน',
  sourceLang: 'en',
  targetLang: 'th',
  expectedFindings: [
    {
      category: 'fluency',
      severity: 'minor',
      descriptionKeywords: ['literal', 'unnatural', 'awkward'],
    },
  ],
  expectNoFinding: false,
}

const TERMINOLOGY_INCONSISTENT: GoldenSegment = {
  id: 'golden-007',
  label: 'Terminology — glossary term mistranslated',
  source: 'Upload your file to the dashboard.',
  target: 'อัปโหลดไฟล์ของคุณไปยังหน้าหลัก',
  sourceLang: 'en',
  targetLang: 'th',
  expectedFindings: [
    {
      category: 'terminology',
      severity: 'major',
      descriptionKeywords: ['dashboard', 'แดชบอร์ด', 'หน้าหลัก', 'terminology'],
    },
  ],
  expectNoFinding: false,
}

const CJK_PUNCTUATION_ERROR: GoldenSegment = {
  id: 'golden-008',
  label: 'Japanese fullwidth punctuation error',
  source: 'Are you sure? This cannot be undone!',
  target: 'よろしいですか?元に戻すことはできません!',
  sourceLang: 'en',
  targetLang: 'ja',
  expectedFindings: [
    {
      category: 'style',
      severity: 'minor',
      descriptionKeywords: ['fullwidth', 'punctuation', '？', '！', 'halfwidth'],
    },
  ],
  expectNoFinding: false,
}

const NUMBER_MEANING_CHANGE: GoldenSegment = {
  id: 'golden-009',
  label: 'Number in context changes meaning',
  source: 'Your trial expires in 30 days.',
  target: 'ช่วงทดลองใช้งานจะหมดใน 3 วัน',
  sourceLang: 'en',
  targetLang: 'th',
  expectedFindings: [
    {
      category: 'accuracy',
      severity: 'critical',
      descriptionKeywords: ['30', '3', 'number', 'incorrect'],
    },
  ],
  expectNoFinding: false,
}

const CHINESE_TRADITIONAL_MIXED: GoldenSegment = {
  id: 'golden-010',
  label: 'Simplified Chinese with Traditional characters mixed',
  source: 'Click the settings button.',
  target: '點擊设置按钮。',
  sourceLang: 'en',
  targetLang: 'zh-CN',
  expectedFindings: [
    {
      category: 'style',
      severity: 'major',
      descriptionKeywords: ['Traditional', 'Simplified', '點擊', '点击', 'mixed'],
    },
  ],
  expectNoFinding: false,
}

// ── NEGATIVE: CORRECT translations (AI must NOT flag) ──

const CORRECT_FORMAL_TH: GoldenSegment = {
  id: 'golden-011',
  label: 'Correct formal Thai translation',
  source: 'Your subscription has been successfully renewed.',
  target: 'การสมัครสมาชิกของคุณได้รับการต่ออายุเรียบร้อยแล้ว',
  sourceLang: 'en',
  targetLang: 'th',
  expectedFindings: [],
  expectNoFinding: true,
}

const CORRECT_WITH_PLACEHOLDER: GoldenSegment = {
  id: 'golden-012',
  label: 'Correct translation with placeholder preserved',
  source: 'File size: {0} MB',
  target: 'ขนาดไฟล์: {0} MB',
  sourceLang: 'en',
  targetLang: 'th',
  expectedFindings: [],
  expectNoFinding: true,
}

const CORRECT_NATURAL_ADAPTATION: GoldenSegment = {
  id: 'golden-013',
  label: 'Correct natural adaptation (not literal)',
  source: 'We look forward to hearing from you.',
  target: 'หากมีข้อสงสัยเพิ่มเติม สามารถติดต่อเราได้ตลอดเวลา',
  sourceLang: 'en',
  targetLang: 'th',
  expectedFindings: [],
  expectNoFinding: true,
}

const CORRECT_JAPANESE: GoldenSegment = {
  id: 'golden-014',
  label: 'Correct Japanese desu/masu form',
  source: 'Please enter your password.',
  target: 'パスワードを入力してください。',
  sourceLang: 'en',
  targetLang: 'ja',
  expectedFindings: [],
  expectNoFinding: true,
}

const CORRECT_WITH_UNITS: GoldenSegment = {
  id: 'golden-015',
  label: 'Correct translation with units and numbers',
  source: 'Maximum upload size is 25 MB per file.',
  target: 'ขนาดไฟล์อัปโหลดสูงสุดคือ 25 MB ต่อไฟล์',
  sourceLang: 'en',
  targetLang: 'th',
  expectedFindings: [],
  expectNoFinding: true,
}

// ── Export all golden segments ──

export const GOLDEN_SEGMENTS: GoldenSegment[] = [
  // Positive (10 segments with known issues)
  CRITICAL_MISTRANSLATION,
  OMISSION_SAFETY_INFO,
  SPELLING_ERROR,
  REGISTER_MISMATCH,
  ADDITION_EXTRA_INFO,
  FLUENCY_UNNATURAL,
  TERMINOLOGY_INCONSISTENT,
  CJK_PUNCTUATION_ERROR,
  NUMBER_MEANING_CHANGE,
  CHINESE_TRADITIONAL_MIXED,
  // Negative (5 correct translations)
  CORRECT_FORMAL_TH,
  CORRECT_WITH_PLACEHOLDER,
  CORRECT_NATURAL_ADAPTATION,
  CORRECT_JAPANESE,
  CORRECT_WITH_UNITS,
]

export const POSITIVE_SEGMENTS = GOLDEN_SEGMENTS.filter((s) => !s.expectNoFinding)
export const NEGATIVE_SEGMENTS = GOLDEN_SEGMENTS.filter((s) => s.expectNoFinding)
