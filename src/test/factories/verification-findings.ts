/**
 * Factory for seeding 300+ findings for performance benchmark testing (Story 4.8, Task 6).
 * Generates realistic finding data with word_count >= 100 per segment to avoid MQM score = 0.
 */

import { faker } from '@faker-js/faker'

import type { FindingForDisplay } from '@/features/review/types'
import type { FindingSeverity, FindingStatus, DetectedByLayer } from '@/types/finding'

const SEVERITIES: FindingSeverity[] = ['critical', 'major', 'minor']
const CATEGORIES = [
  'accuracy',
  'terminology',
  'consistency',
  'markup',
  'whitespace',
  'style',
  'fluency',
  'locale-convention',
]
const LAYERS: DetectedByLayer[] = ['L1', 'L2', 'L3']

const DESCRIPTIONS = [
  'Number mismatch between source and target text',
  'Missing inline tag in target translation',
  'Glossary term translated incorrectly',
  'Inconsistent translation for repeated source text',
  'Extra whitespace detected in target segment',
  'Placeholder missing in target translation',
  'Style does not match project guidelines',
  'Fluency issue: unnatural phrasing in target language',
  'Date format does not follow locale convention',
  'Untranslated content detected in target segment',
]

const SOURCE_EXCERPTS = [
  'Please ensure that all 150 participants have completed the registration form before the training session begins. The quarterly report shows improvement across all departments.',
  'The system requires a minimum of 8 characters for the password field. Security protocols mandate regular updates to ensure compliance with current standards.',
  'Click the Submit button to save your changes and proceed to the next step. All modifications will be recorded in the audit trail automatically.',
  'The training module covers 12 key topics including safety protocols and emergency procedures. Certification requires passing all assessments with 80% minimum score.',
  'Performance metrics indicate that response time has improved by 45ms since the last update. Server load has decreased by 20% during peak hours.',
]

const TARGET_EXCERPTS = [
  'กรุณาตรวจสอบให้แน่ใจว่าผู้เข้าร่วม 150 คนทั้งหมดได้กรอกแบบฟอร์มลงทะเบียนก่อนเริ่มการฝึกอบรม รายงานรายไตรมาสแสดงให้เห็นการปรับปรุงในทุกแผนก',
  'ระบบต้องการอักขระขั้นต่ำ 8 ตัวสำหรับช่องรหัสผ่าน ระเบียบปฏิบัติด้านความปลอดภัยกำหนดให้มีการอัปเดตเป็นประจำเพื่อให้สอดคล้องกับมาตรฐานปัจจุบัน',
  'คลิกปุ่ม ส่ง เพื่อบันทึกการเปลี่ยนแปลงของคุณและดำเนินการขั้นตอนถัดไป การแก้ไขทั้งหมดจะถูกบันทึกในบันทึกการตรวจสอบโดยอัตโนมัติ',
  'โมดูลการฝึกอบรมครอบคลุม 12 หัวข้อหลักรวมถึงระเบียบปฏิบัติด้านความปลอดภัยและขั้นตอนฉุกเฉิน การรับรองต้องผ่านการประเมินทั้งหมดด้วยคะแนนขั้นต่ำ 80%',
  'ตัวชี้วัดประสิทธิภาพระบุว่าเวลาตอบสนองดีขึ้น 45 มิลลิวินาทีตั้งแต่การอัปเดตครั้งล่าสุด โหลดเซิร์ฟเวอร์ลดลง 20% ในช่วงเวลาที่มีการใช้งานสูงสุด',
]

type BuildVerificationFindingsOptions = {
  count: number
  fileId: string
  sessionId: string
  projectId: string
  tenantId: string
  /** Ratio of pending findings (default 0.7 = 70% pending) */
  pendingRatio?: number
}

/**
 * Generate an array of `count` realistic FindingForDisplay objects.
 * All findings have word_count >= 100 source excerpts (required for MQM non-zero scores).
 */
export function buildVerificationFindings(
  options: BuildVerificationFindingsOptions,
): FindingForDisplay[] {
  const {
    count,
    fileId: _fileId,
    sessionId: _sessionId,
    projectId: _projectId,
    tenantId: _tenantId,
    pendingRatio = 0.7,
  } = options

  const findings: FindingForDisplay[] = []

  for (let i = 0; i < count; i++) {
    const severity = SEVERITIES[i % SEVERITIES.length]!
    const category = CATEGORIES[i % CATEGORIES.length]!
    const layer = LAYERS[i % LAYERS.length]!
    const isPending = i < count * pendingRatio

    const status: FindingStatus = isPending
      ? 'pending'
      : (['accepted', 'rejected', 'flagged'] as const)[i % 3]!

    findings.push({
      id: faker.string.uuid(),
      segmentId: faker.string.uuid(),
      severity,
      originalSeverity: null,
      category,
      description: DESCRIPTIONS[i % DESCRIPTIONS.length]!,
      status,
      detectedByLayer: layer,
      aiConfidence: layer === 'L1' ? null : Number((0.5 + (i % 50) / 100).toFixed(2)),
      sourceTextExcerpt: SOURCE_EXCERPTS[i % SOURCE_EXCERPTS.length]!,
      targetTextExcerpt: TARGET_EXCERPTS[i % TARGET_EXCERPTS.length]!,
      suggestedFix:
        i % 4 === 0 ? 'Consider revising the target translation to match source intent' : null,
      aiModel:
        layer === 'L1' ? null : layer === 'L2' ? 'gpt-4o-mini' : 'claude-sonnet-4-5-20250929',
    })
  }

  return findings
}
