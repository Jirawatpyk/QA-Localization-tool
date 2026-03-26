/**
 * Test fixtures for AI integration tests.
 *
 * Contains segments with KNOWN quality issues that any competent AI model
 * should detect. These are intentionally obvious to ensure the test validates
 * the full pipeline (prompt → AI → parse → findings) rather than AI quality.
 *
 * Each fixture documents:
 *   - What the quality issue is
 *   - Why an AI model should detect it
 *   - Expected severity range
 */

import type {
  PromptSegment,
  ProjectContext,
  TaxonomyCategoryContext,
} from '@/features/pipeline/prompts/types'

// ── Segment Fixtures with Known Issues ──

/**
 * Segments with OBVIOUS translation errors for L2 screening.
 * These should produce findings with high confidence.
 */
export const L2_TEST_SEGMENTS: PromptSegment[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    segmentNumber: 1,
    sourceText: 'Click the Save button to save your changes.',
    targetText: 'คลิกปุ่มลบเพื่อบันทึกการเปลี่ยนแปลง',
    // Issue: "Save" is translated as "ลบ" (Delete) — clear mistranslation
    sourceLang: 'en-US',
    targetLang: 'th-TH',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    segmentNumber: 2,
    sourceText: 'The system will automatically back up your data every 24 hours.',
    targetText: 'ระบบจะสำรองข้อมูลของคุณ',
    // Issue: "automatically" and "every 24 hours" are omitted — incomplete translation
    sourceLang: 'en-US',
    targetLang: 'th-TH',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    segmentNumber: 3,
    sourceText: 'Warning: This action cannot be undone.',
    targetText: 'คำเตือน: การดำเนินการนี้ไม่สามารถยกเลิกได้',
    // No issue — correct translation (control segment)
    sourceLang: 'en-US',
    targetLang: 'th-TH',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    segmentNumber: 4,
    sourceText: 'Enter your email address to receive notifications.',
    targetText: 'ป้อนหมายเลขโทรศัพท์ของคุณเพื่อรับการแจ้งเตือน',
    // Issue: "email address" translated as "หมายเลขโทรศัพท์" (phone number) — meaning change
    sourceLang: 'en-US',
    targetLang: 'th-TH',
  },
]

/**
 * Segments with SUBTLE issues for L3 deep analysis.
 * L3 should catch nuanced problems that require deeper reasoning.
 */
export const L3_TEST_SEGMENTS: PromptSegment[] = [
  {
    id: '00000000-0000-4000-8000-000000000010',
    segmentNumber: 1,
    sourceText: 'The patient must fast for 12 hours before the blood test.',
    targetText: 'ผู้ป่วยต้องรวดเร็วเป็นเวลา 12 ชั่วโมงก่อนการตรวจเลือด',
    // Issue: "fast" (abstain from food) translated as "รวดเร็ว" (quick/speedy) — wrong sense
    sourceLang: 'en-US',
    targetLang: 'th-TH',
  },
  {
    id: '00000000-0000-4000-8000-000000000011',
    segmentNumber: 2,
    sourceText: 'Please contact our support team if you experience any issues.',
    targetText: 'กรุณาติดต่อทีมสนับสนุนของเราหากคุณประสบปัญหาใดๆ',
    // No issue — correct translation (control segment)
    sourceLang: 'en-US',
    targetLang: 'th-TH',
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    segmentNumber: 3,
    sourceText: 'The bank will process your wire transfer within 3 business days.',
    targetText: 'ธนาคารจะดำเนินการโอนเงินผ่านสายของคุณภายใน 3 วันทำการ',
    // Issue: "wire transfer" translated literally as "โอนเงินผ่านสาย" (transfer through wire)
    // instead of the standard Thai banking term "โอนเงินทางธนาคาร"
    sourceLang: 'en-US',
    targetLang: 'th-TH',
  },
]

// ── Project Context Fixture ──

export const TEST_PROJECT: ProjectContext = {
  name: 'AI Integration Test Project',
  description:
    'Test project for verifying AI pipeline produces findings from segments with known issues.',
  sourceLang: 'en-US',
  targetLangs: ['th-TH'],
  processingMode: 'thorough',
}

// ── Taxonomy Fixture ──
// Minimal taxonomy to validate category matching

export const TEST_TAXONOMY: TaxonomyCategoryContext[] = [
  {
    category: 'Accuracy',
    parentCategory: null,
    severity: 'critical',
    description: 'Mistranslation or meaning change',
  },
  {
    category: 'Mistranslation',
    parentCategory: 'Accuracy',
    severity: 'critical',
    description: 'Wrong meaning conveyed',
  },
  {
    category: 'Omission',
    parentCategory: 'Accuracy',
    severity: 'major',
    description: 'Content missing from translation',
  },
  {
    category: 'Addition',
    parentCategory: 'Accuracy',
    severity: 'minor',
    description: 'Content added not in source',
  },
  {
    category: 'Fluency',
    parentCategory: null,
    severity: 'minor',
    description: 'Unnatural phrasing or grammar',
  },
  {
    category: 'Terminology',
    parentCategory: null,
    severity: 'major',
    description: 'Incorrect domain-specific terms',
  },
  {
    category: 'Style',
    parentCategory: null,
    severity: 'minor',
    description: 'Register or tone mismatch',
  },
  {
    category: 'false_positive_review',
    parentCategory: null,
    severity: null,
    description: 'L3: disagree with L2 finding',
  },
]
