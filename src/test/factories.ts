import { faker } from '@faker-js/faker'

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
