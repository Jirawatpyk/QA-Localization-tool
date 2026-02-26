import { faker } from '@faker-js/faker'

import type { findings } from '@/db/schema/findings'
import type { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import type { scores } from '@/db/schema/scores'
import type { segments } from '@/db/schema/segments'
import type { severityConfigs } from '@/db/schema/severityConfigs'
import type {
  BatchSummaryData,
  CrossFileFindingSummary,
  FileHistoryRow,
  FileInBatch,
} from '@/features/batch/types'
import type { AppNotification, DashboardData, RecentFileRow } from '@/features/dashboard/types'
import type { ParityComparisonResult, XbenchFinding } from '@/features/parity/types'
import type { ExcelPreview } from '@/features/parser/actions/previewExcelColumns.action'
import type { ExcelColumnMapping } from '@/features/parser/validation/excelMappingSchema'
import type { ContributingFinding } from '@/features/scoring/types'
import type { BatchRecord, UploadFileResult } from '@/features/upload/types'
import type { Finding } from '@/types/finding'
import type { ProcessingMode, PipelineRun } from '@/types/pipeline'
import type { ReviewSession } from '@/types/review'

type SegmentRecord = typeof segments.$inferSelect
type DbFindingInsert = typeof findings.$inferInsert

export function buildFinding(overrides?: Partial<Finding>): Finding {
  return {
    id: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    projectId: faker.string.uuid(),
    sessionId: faker.string.uuid(),
    segmentId: faker.string.uuid(),
    severity: 'major',
    category: 'accuracy',
    status: 'pending',
    source: 'L1-rule',
    description: faker.lorem.sentence(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

export function buildReviewSession(overrides?: Partial<ReviewSession>): ReviewSession {
  return {
    id: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    projectId: faker.string.uuid(),
    status: 'active',
    reviewerId: faker.string.uuid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

export function buildPipelineRun(overrides?: Partial<PipelineRun>): PipelineRun {
  return {
    id: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    projectId: faker.string.uuid(),
    sessionId: faker.string.uuid(),
    mode: 'economy',
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

export function buildNotification(overrides?: Partial<AppNotification>): AppNotification {
  return {
    id: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    userId: faker.string.uuid(),
    type: 'glossary_updated',
    title: faker.lorem.words(3),
    body: faker.lorem.sentence(),
    isRead: false,
    metadata: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

export function buildRecentFileRow(overrides?: Partial<RecentFileRow>): RecentFileRow {
  return {
    id: faker.string.uuid(),
    fileName: `${faker.word.noun()}.xlf`,
    projectId: faker.string.uuid(),
    projectName: faker.company.name(),
    status: 'parsed',
    createdAt: new Date().toISOString(),
    mqmScore: faker.number.float({ min: 70, max: 100, fractionDigits: 1 }),
    findingsCount: faker.number.int({ min: 0, max: 50 }),
    ...overrides,
  }
}

export function buildDashboardData(overrides?: Partial<DashboardData>): DashboardData {
  return {
    recentFiles: Array.from({ length: 3 }, () => buildRecentFileRow()),
    pendingReviewsCount: faker.number.int({ min: 0, max: 10 }),
    teamActivityCount: faker.number.int({ min: 0, max: 100 }),
    ...overrides,
  }
}

export function buildFile(overrides?: Partial<UploadFileResult>): UploadFileResult {
  const fileHash = faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' })
  const tenantId = faker.string.uuid()
  const projectId = faker.string.uuid()
  const fileType = overrides?.fileType ?? 'sdlxliff'
  const ext = fileType === 'xlsx' ? 'xlsx' : fileType === 'xliff' ? 'xlf' : 'sdlxliff'
  const fileName = overrides?.fileName ?? `${faker.word.noun()}.${ext}`
  return {
    fileId: faker.string.uuid(),
    fileName,
    fileSizeBytes: faker.number.int({ min: 1024, max: 5 * 1024 * 1024 }),
    fileType,
    fileHash,
    storagePath: `${tenantId}/${projectId}/${fileHash}/${fileName}`,
    status: 'uploaded',
    batchId: faker.string.uuid(),
    ...overrides,
  }
}

export function buildUploadBatch(overrides?: Partial<BatchRecord>): BatchRecord {
  return {
    id: faker.string.uuid(),
    projectId: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    fileCount: faker.number.int({ min: 1, max: 50 }),
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

export function buildExcelColumnMapping(
  overrides?: Partial<ExcelColumnMapping>,
): ExcelColumnMapping {
  return {
    sourceColumn: 'Source',
    targetColumn: 'Target',
    hasHeader: true,
    segmentIdColumn: undefined,
    contextColumn: undefined,
    languageColumn: undefined,
    ...overrides,
  }
}

export function buildExcelPreview(overrides?: Partial<ExcelPreview>): ExcelPreview {
  return {
    headers: ['Source', 'Target', 'Segment ID', 'Notes'],
    previewRows: [
      ['Hello', 'สวัสดี', 'TU-001', 'Greeting'],
      ['Goodbye', 'ลาก่อน', 'TU-002', 'Farewell'],
    ],
    suggestedSourceColumn: 'Source',
    suggestedTargetColumn: 'Target',
    totalRows: 10,
    columnCount: 4,
    ...overrides,
  }
}

export function buildSegment(overrides?: Partial<SegmentRecord>): SegmentRecord {
  return {
    id: faker.string.uuid(),
    fileId: faker.string.uuid(),
    projectId: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    segmentNumber: faker.number.int({ min: 1, max: 1000 }),
    sourceText: faker.lorem.sentence(),
    targetText: faker.lorem.sentence(),
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    wordCount: faker.number.int({ min: 1, max: 50 }),
    confirmationState: 'Translated',
    matchPercentage: null,
    translatorComment: null,
    inlineTags: null,
    createdAt: new Date(),
    ...overrides,
  }
}

/**
 * Factory for DB findings inserts (Drizzle schema type).
 * Use this for rule engine tests that need the DB insert type.
 * Do NOT modify buildFinding() above — it uses the Finding UI type (26+ existing tests).
 */
export function buildDbFinding(overrides?: Partial<DbFindingInsert>): DbFindingInsert {
  return {
    segmentId: faker.string.uuid(),
    projectId: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    fileId: faker.string.uuid(),
    severity: 'major',
    category: 'completeness',
    description: faker.lorem.sentence(),
    detectedByLayer: 'L1',
    status: 'pending',
    aiModel: null,
    aiConfidence: null,
    suggestedFix: null,
    sourceTextExcerpt: null,
    targetTextExcerpt: null,
    reviewSessionId: null,
    segmentCount: 1,
    scope: 'per-file',
    relatedFileIds: null,
    ...overrides,
  }
}

export function buildFileInBatch(overrides?: Partial<FileInBatch>): FileInBatch {
  return {
    fileId: faker.string.uuid(),
    fileName: `${faker.word.noun()}.sdlxliff`,
    status: 'l1_completed',
    createdAt: new Date(),
    updatedAt: new Date(),
    mqmScore: faker.number.float({ min: 70, max: 100, fractionDigits: 2 }),
    scoreStatus: 'calculated',
    criticalCount: 0,
    majorCount: faker.number.int({ min: 0, max: 5 }),
    minorCount: faker.number.int({ min: 0, max: 10 }),
    ...overrides,
  }
}

export function buildBatchSummaryData(overrides?: Partial<BatchSummaryData>): BatchSummaryData {
  const recommendedPass = overrides?.recommendedPass ?? [buildFileInBatch({ mqmScore: 98 })]
  const needsReview = overrides?.needsReview ?? [
    buildFileInBatch({ mqmScore: 72, criticalCount: 1 }),
  ]
  return {
    batchId: faker.string.uuid(),
    projectId: faker.string.uuid(),
    totalFiles: recommendedPass.length + needsReview.length,
    passedCount: recommendedPass.length,
    needsReviewCount: needsReview.length,
    processingTimeMs: faker.number.int({ min: 1000, max: 60000 }),
    recommendedPass,
    needsReview,
    crossFileFindings: [],
    ...overrides,
  }
}

export function buildFileHistoryRow(overrides?: Partial<FileHistoryRow>): FileHistoryRow {
  return {
    id: faker.string.uuid(),
    fileName: `${faker.word.noun()}.sdlxliff`,
    uploadDate: new Date(),
    processingStatus: 'l1_completed',
    mqmScore: faker.number.float({ min: 70, max: 100, fractionDigits: 2 }),
    scoreStatus: 'calculated',
    criticalCount: 0,
    lastReviewerName: null,
    decisionStatus: null,
    ...overrides,
  }
}

export function buildCrossFileFinding(
  overrides?: Partial<CrossFileFindingSummary>,
): CrossFileFindingSummary {
  return {
    id: faker.string.uuid(),
    description: `Inconsistent translation: '${faker.lorem.word()}' translated differently`,
    sourceTextExcerpt: faker.lorem.words(5),
    relatedFileIds: [faker.string.uuid(), faker.string.uuid()],
    ...overrides,
  }
}

export function buildXbenchFinding(overrides?: Partial<XbenchFinding>): XbenchFinding {
  return {
    file: `${faker.word.noun()}.sdlxliff`,
    segment: String(faker.number.int({ min: 1, max: 500 })),
    sourceText: faker.lorem.sentence(),
    targetText: faker.lorem.sentence(),
    checkType: 'Numeric Mismatch',
    description: faker.lorem.sentence(),
    severity: 'Warning',
    ...overrides,
  }
}

export function buildParityComparisonResult(
  overrides?: Partial<ParityComparisonResult>,
): ParityComparisonResult {
  return {
    toolOnly: [],
    bothFound: [],
    xbenchOnly: [],
    summary: {
      toolFindingCount: 0,
      xbenchFindingCount: 0,
      bothFoundCount: 0,
      toolOnlyCount: 0,
      xbenchOnlyCount: 0,
    },
    ...overrides,
  }
}

type ScoreRecord = typeof scores.$inferSelect
type SeverityConfigRecord = typeof severityConfigs.$inferSelect
type LanguagePairConfigRecord = typeof languagePairConfigs.$inferSelect

export function buildScoreRecord(overrides?: Partial<ScoreRecord>): ScoreRecord {
  return {
    id: faker.string.uuid(),
    fileId: faker.string.uuid(),
    projectId: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    mqmScore: faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
    totalWords: faker.number.int({ min: 1, max: 5000 }),
    criticalCount: faker.number.int({ min: 0, max: 5 }),
    majorCount: faker.number.int({ min: 0, max: 10 }),
    minorCount: faker.number.int({ min: 0, max: 20 }),
    npt: faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
    layerCompleted: 'L1',
    status: 'calculated',
    autoPassRationale: null,
    calculatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  }
}

export function buildSeverityConfigRecord(
  overrides?: Partial<SeverityConfigRecord>,
): SeverityConfigRecord {
  return {
    id: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    severity: 'major',
    penaltyWeight: 5,
    createdAt: new Date(),
    ...overrides,
  }
}

export function buildLanguagePairConfigRecord(
  overrides?: Partial<LanguagePairConfigRecord>,
): LanguagePairConfigRecord {
  return {
    id: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    autoPassThreshold: 95,
    l2ConfidenceMin: 70,
    l3ConfidenceMin: 80,
    mutedCategories: null,
    wordSegmenter: 'intl',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/**
 * Factory for scoring-relevant findings (ContributingFinding shape).
 * Composes with buildDbFinding() for full DB insert type when needed.
 */
export function buildScoringFinding(overrides?: Partial<ContributingFinding>): ContributingFinding {
  return {
    severity: 'major',
    status: 'pending',
    segmentCount: 1,
    ...overrides,
  }
}

/**
 * Builds a pipeline.process-file event data object for testing Inngest handlers.
 */
export function buildPipelineEvent(
  overrides?: Partial<{
    fileId: string
    projectId: string
    tenantId: string
    userId: string
    mode: ProcessingMode
    uploadBatchId: string
  }>,
) {
  return {
    fileId: faker.string.uuid(),
    projectId: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    userId: faker.string.uuid(),
    mode: 'economy' as const,
    uploadBatchId: faker.string.uuid(),
    ...overrides,
  }
}

/**
 * Builds a pipeline.batch-started event data object for testing Inngest batch handlers.
 */
export function buildPipelineBatchEvent(
  overrides?: Partial<{
    batchId: string
    fileIds: string[]
    projectId: string
    tenantId: string
    userId: string
    mode: ProcessingMode
    uploadBatchId: string
  }>,
) {
  return {
    batchId: faker.string.uuid(),
    fileIds: [faker.string.uuid(), faker.string.uuid()],
    projectId: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    userId: faker.string.uuid(),
    mode: 'economy' as const,
    uploadBatchId: faker.string.uuid(),
    ...overrides,
  }
}

// ── Performance Test Segment Factory ──
// Deterministic: same output every call (seeded, no randomness)
// Mix: 60% normal, 10% tags, 10% numbers, 5% placeholders, 10% Thai/CJK, 5% edge cases

const PERF_TEMPLATES = {
  normal: [
    { source: 'Click the button to continue.', target: 'คลิกปุ่มเพื่อดำเนินการต่อ' },
    { source: 'Save your changes before closing.', target: 'บันทึกการเปลี่ยนแปลงก่อนปิด' },
    { source: 'Welcome to the application.', target: 'ยินดีต้อนรับสู่แอปพลิเคชัน' },
    { source: 'Please enter your password.', target: 'กรุณาใส่รหัสผ่านของคุณ' },
    {
      source: 'The file has been uploaded successfully.',
      target: 'ไฟล์ได้รับการอัปโหลดเรียบร้อยแล้ว',
    },
    { source: 'An error occurred. Please try again.', target: 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง' },
  ],
  withTags: [
    {
      source: '<g id="1">Bold text</g> and normal.',
      target: '<g id="1">ข้อความตัวหนา</g> และปกติ',
    },
    { source: 'Start <x id="2"/>here<x id="3"/>.', target: 'เริ่ม <x id="2"/>ที่นี่<x id="3"/>' },
    {
      source: '<g id="5">Step 1:</g> Configure settings.',
      target: '<g id="5">ขั้นตอนที่ 1:</g> กำหนดค่า',
    },
  ],
  withNumbers: [
    {
      source: 'Version 2.5.1 released on 2024-01-15.',
      target: 'เวอร์ชัน 2.5.1 เผยแพร่เมื่อ 2024-01-15',
    },
    { source: 'Total: $1,234.56 for 100 items.', target: 'รวม: $1,234.56 สำหรับ 100 รายการ' },
    { source: 'Page 3 of 50 results.', target: 'หน้า 3 จาก 50 ผลลัพธ์' },
  ],
  withPlaceholders: [
    { source: 'Hello {0}, welcome to {1}.', target: 'สวัสดี {0} ยินดีต้อนรับสู่ {1}' },
    { source: 'Error %s: %d files failed.', target: 'ข้อผิดพลาด %s: %d ไฟล์ล้มเหลว' },
  ],
  thaiCjk: [
    { source: 'Training plan for barista.', target: 'แผนการฝึกอบรมสำหรับบาริสต้า' },
    { source: 'Customer experience standards.', target: 'มาตรฐานประสบการณ์ลูกค้า' },
    { source: 'Quality assurance checklist.', target: '品質保証チェックリスト' },
    { source: 'User interface guidelines.', target: '用户界面指南' },
  ],
  edgeCases: [
    { source: 'Simple text.', target: '' }, // empty target
    { source: 'A'.repeat(500), target: 'B'.repeat(500) }, // very long
    { source: '©™®℠', target: '©™®℠' }, // special chars
  ],
} as const

/**
 * Generate deterministic synthetic segments for performance testing.
 * Mix: 60% normal, 10% tags, 10% numbers, 5% placeholders, 10% Thai/CJK, 5% edge cases.
 * Uses modulo cycling — same count always produces same output.
 */
export function buildPerfSegments(count: number): SegmentRecord[] {
  if (count === 0) return []

  const fileId = '00000000-0000-4000-8000-000000000001'
  const projectId = '00000000-0000-4000-8000-000000000002'
  const tenantId = '00000000-0000-4000-8000-000000000003'
  const segments: SegmentRecord[] = []

  for (let i = 0; i < count; i++) {
    // Deterministic category assignment based on index
    const pct = (i * 100) / count
    let templates: readonly { source: string; target: string }[]
    if (pct < 60) templates = PERF_TEMPLATES.normal
    else if (pct < 70) templates = PERF_TEMPLATES.withTags
    else if (pct < 80) templates = PERF_TEMPLATES.withNumbers
    else if (pct < 85) templates = PERF_TEMPLATES.withPlaceholders
    else if (pct < 95) templates = PERF_TEMPLATES.thaiCjk
    else templates = PERF_TEMPLATES.edgeCases

    const template = templates[i % templates.length]!

    segments.push({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      fileId,
      projectId,
      tenantId,
      segmentNumber: i + 1,
      sourceText: template.source,
      targetText: template.target,
      sourceLang: 'en-US',
      targetLang: 'th-TH',
      wordCount: template.source.split(' ').length,
      confirmationState: 'Translated',
      matchPercentage: null,
      translatorComment: null,
      inlineTags: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
  }

  return segments
}
