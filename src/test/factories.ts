import { faker } from '@faker-js/faker'

import type { segments } from '@/db/schema/segments'
import type { AppNotification, DashboardData, RecentFileRow } from '@/features/dashboard/types'
import type { ExcelPreview } from '@/features/parser/actions/previewExcelColumns.action'
import type { ExcelColumnMapping } from '@/features/parser/validation/excelMappingSchema'
import type { BatchRecord, UploadFileResult } from '@/features/upload/types'
import type { Finding } from '@/types/finding'
import type { PipelineRun } from '@/types/pipeline'
import type { ReviewSession } from '@/types/review'

type SegmentRecord = typeof segments.$inferSelect

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
