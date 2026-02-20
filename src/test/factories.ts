import { faker } from '@faker-js/faker'

import type { AppNotification, DashboardData, RecentFileRow } from '@/features/dashboard/types'
import type { Finding } from '@/types/finding'
import type { PipelineRun } from '@/types/pipeline'
import type { ReviewSession } from '@/types/review'

export function buildFinding(overrides?: Partial<Finding>): Finding {
  return {
    id: faker.string.uuid(),
    tenantId: 'test-tenant',
    projectId: 'test-project',
    sessionId: 'test-session',
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
    tenantId: 'test-tenant',
    projectId: 'test-project',
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
    tenantId: 'test-tenant',
    projectId: 'test-project',
    sessionId: 'test-session',
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
    tenantId: 'test-tenant',
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
