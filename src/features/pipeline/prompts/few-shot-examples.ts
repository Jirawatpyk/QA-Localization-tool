/**
 * Few-shot examples for AI prompt calibration.
 *
 * Includes BOTH positive (has finding) and negative (no finding) examples
 * to teach the model:
 * - What a real issue looks like
 * - What a correct translation looks like (avoid over-flagging)
 *
 * Examples are language-agnostic (using EN→TH as reference) and focus
 * on the CATEGORIES of issues, not specific languages.
 */

type FewShotExample = {
  source: string
  target: string
  sourceLang: string
  targetLang: string
  finding: {
    category: string
    severity: 'critical' | 'major' | 'minor'
    description: string
  } | null // null = correct translation, no issue
}

// ── Positive Examples (issues that SHOULD be flagged) ──

const ACCURACY_EXAMPLE: FewShotExample = {
  source: 'Click "Save" to apply your changes.',
  target: 'คลิก "บันทัก" เพื่อดำเนินการต่อ',
  sourceLang: 'en',
  targetLang: 'th',
  finding: {
    category: 'accuracy',
    severity: 'critical',
    description:
      'Two issues: (1) "บันทัก" is misspelled — should be "บันทึก". (2) "to apply your changes" was translated as "เพื่อดำเนินการต่อ" (to continue) — meaning changed.',
  },
}

const OMISSION_EXAMPLE: FewShotExample = {
  source: 'Warning: This action cannot be undone. All data will be permanently deleted.',
  target: 'คำเตือน: การดำเนินการนี้ไม่สามารถย้อนกลับได้',
  sourceLang: 'en',
  targetLang: 'th',
  finding: {
    category: 'accuracy',
    severity: 'major',
    description:
      'Second sentence "All data will be permanently deleted" was omitted from translation. Critical safety information missing.',
  },
}

const FLUENCY_EXAMPLE: FewShotExample = {
  source: 'The system is currently undergoing scheduled maintenance.',
  target: 'ระบบอยู่ในช่วงระหว่างการบำรุงรักษาที่ถูกกำหนดเวลาไว้ในปัจจุบัน',
  sourceLang: 'en',
  targetLang: 'th',
  finding: {
    category: 'fluency',
    severity: 'minor',
    description:
      'Translation is overly literal and unnatural. "ในปัจจุบัน" at end is redundant. More natural: "ระบบอยู่ระหว่างการบำรุงรักษาตามกำหนดการ"',
  },
}

const REGISTER_EXAMPLE: FewShotExample = {
  source: 'Please contact our support team for assistance.',
  target: 'ติดต่อทีมซัพพอร์ตถ้ามีปัญหาอะไรนะ',
  sourceLang: 'en',
  targetLang: 'th',
  finding: {
    category: 'style',
    severity: 'major',
    description:
      'Register mismatch: source is formal ("Please contact...") but translation uses casual/colloquial tone ("ถ้ามีปัญหาอะไรนะ"). For formal UI text, should use "กรุณาติดต่อทีมสนับสนุนเพื่อขอความช่วยเหลือ"',
  },
}

const TERMINOLOGY_EXAMPLE: FewShotExample = {
  source: 'Upload your file to the cloud storage.',
  target: 'อัปโหลดไฟล์ของคุณไปยังที่เก็บข้อมูลบนคลาวด์',
  sourceLang: 'en',
  targetLang: 'th',
  finding: null, // Correct — no issue
}

// ── Negative Examples (correct translations that should NOT be flagged) ──

const CORRECT_FORMAL: FewShotExample = {
  source: 'Your subscription has been successfully renewed.',
  target: 'การสมัครสมาชิกของคุณได้รับการต่ออายุเรียบร้อยแล้ว',
  sourceLang: 'en',
  targetLang: 'th',
  finding: null, // Correct
}

const CORRECT_WITH_ADAPTATION: FewShotExample = {
  source: 'File size: {0} MB',
  target: 'ขนาดไฟล์: {0} MB',
  sourceLang: 'en',
  targetLang: 'th',
  finding: null, // Correct — placeholder preserved, unit kept as-is
}

// ── All Examples ──

const ALL_EXAMPLES: FewShotExample[] = [
  ACCURACY_EXAMPLE,
  OMISSION_EXAMPLE,
  FLUENCY_EXAMPLE,
  REGISTER_EXAMPLE,
  TERMINOLOGY_EXAMPLE,
  CORRECT_FORMAL,
  CORRECT_WITH_ADAPTATION,
]

/**
 * Format few-shot examples into a prompt section.
 *
 * Includes both positive and negative examples to calibrate AI behavior:
 * - Positive: examples with findings → teaches what to flag
 * - Negative: correct translations with no findings → teaches what NOT to flag
 *
 * @param maxExamples - Maximum examples to include (default: all 7)
 */
export function formatFewShotExamples(maxExamples?: number): string {
  const examples = maxExamples ? ALL_EXAMPLES.slice(0, maxExamples) : ALL_EXAMPLES

  const formatted = examples.map((ex, i) => {
    const header = `### Example ${i + 1}`
    const pair = `Source (${ex.sourceLang}): "${ex.source}"\nTarget (${ex.targetLang}): "${ex.target}"`

    if (ex.finding) {
      return `${header}\n${pair}\n**Finding:** ${ex.finding.category} (${ex.finding.severity}) — ${ex.finding.description}`
    }

    return `${header}\n${pair}\n**Finding:** None — this translation is correct. Do NOT flag it.`
  })

  return `## Calibration Examples

Study these examples to understand what issues to flag and what is acceptable:

${formatted.join('\n\n')}

KEY PRINCIPLE: Only flag genuine quality issues. A translation that conveys the correct meaning in natural target language — even if structured differently from the source — is acceptable. Do NOT over-flag stylistic preferences.`
}
