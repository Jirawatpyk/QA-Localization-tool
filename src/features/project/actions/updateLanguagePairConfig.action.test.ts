import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/types/tenant'

vi.mock('server-only', () => ({}))

const TEST_TENANT_ID = asTenantId(faker.string.uuid())

const mockCurrentUser = {
  id: 'user-1',
  email: 'admin@test.com',
  tenantId: TEST_TENANT_ID,
  role: 'admin' as const,
}

const mockExistingConfig = {
  id: 'config-1',
  tenantId: TEST_TENANT_ID,
  sourceLang: 'en',
  targetLang: 'th',
  autoPassThreshold: 93,
  l2ConfidenceMin: 70,
  l3ConfidenceMin: 80,
  mutedCategories: null,
  wordSegmenter: 'intl',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockInsertedConfig = {
  ...mockExistingConfig,
  id: 'config-new',
  targetLang: 'ja',
  autoPassThreshold: 95,
  l3ConfidenceMin: 70,
}

// DB mock chain
const mockReturning = vi.fn().mockResolvedValue([mockExistingConfig])
const mockOnConflictDoUpdate = vi.fn().mockReturnValue({ returning: mockReturning })
const mockInsertValues = vi
  .fn()
  .mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate, returning: mockReturning })
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues })

const mockUpdateReturning = vi.fn().mockResolvedValue([mockExistingConfig])
const mockUpdateSetWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning })
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateSetWhere })
const mockUpdateFn = vi.fn().mockReturnValue({ set: mockUpdateSet })

const mockLimit = vi.fn().mockResolvedValue([mockExistingConfig])
const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockLimit })
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere })
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom })

const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdateFn(...args),
  }
  return fn(tx)
})

vi.mock('@/db/client', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdateFn(...args),
    transaction: (...args: unknown[]) => mockTransaction(...(args as [never])),
  },
}))

vi.mock('@/db/schema/languagePairConfigs', () => ({
  languagePairConfigs: {
    name: 'language_pair_configs',
    id: 'id',
    tenantId: 'tenant_id',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
  },
}))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn().mockReturnValue('tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
}))

const mockRequireRole = vi.fn().mockResolvedValue(mockCurrentUser)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

const mockRevalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}))

describe('updateLanguagePairConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    mockLimit.mockResolvedValue([mockExistingConfig])
    mockUpdateReturning.mockResolvedValue([mockExistingConfig])
    mockReturning.mockResolvedValue([mockInsertedConfig])
  })

  it('should upsert existing config successfully', async () => {
    const { updateLanguagePairConfig } = await import('./updateLanguagePairConfig.action')

    const result = await updateLanguagePairConfig({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      sourceLang: 'en',
      targetLang: 'th',
      autoPassThreshold: 90,
    })

    expect(result.success).toBe(true)
    // Uses upsert (insert.onConflictDoUpdate) not separate update
    expect(mockInsert).toHaveBeenCalled()
    expect(mockOnConflictDoUpdate).toHaveBeenCalled()
  })

  it('should insert new config for unseen language pair', async () => {
    mockLimit.mockResolvedValue([]) // no existing config

    const { updateLanguagePairConfig } = await import('./updateLanguagePairConfig.action')

    const result = await updateLanguagePairConfig({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      sourceLang: 'en',
      targetLang: 'ja',
      autoPassThreshold: 93,
    })

    expect(result.success).toBe(true)
    expect(mockInsert).toHaveBeenCalled()
  })

  it('should provide fallback values for NOT NULL fields on insert', async () => {
    mockLimit.mockResolvedValue([]) // no existing config

    const { updateLanguagePairConfig } = await import('./updateLanguagePairConfig.action')

    await updateLanguagePairConfig({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      sourceLang: 'en',
      targetLang: 'ko',
    })

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        autoPassThreshold: 95,
        l2ConfidenceMin: 70,
        l3ConfidenceMin: 70,
      }),
    )
  })

  it('should return FORBIDDEN for non-admin', async () => {
    mockRequireRole.mockRejectedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Insufficient permissions',
    })

    const { updateLanguagePairConfig } = await import('./updateLanguagePairConfig.action')

    const result = await updateLanguagePairConfig({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      sourceLang: 'en',
      targetLang: 'th',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should return VALIDATION_ERROR for invalid threshold', async () => {
    const { updateLanguagePairConfig } = await import('./updateLanguagePairConfig.action')

    const result = await updateLanguagePairConfig({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      sourceLang: 'en',
      targetLang: 'th',
      autoPassThreshold: 150,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should write audit log with action created for new config', async () => {
    mockLimit.mockResolvedValue([]) // no existing

    const { updateLanguagePairConfig } = await import('./updateLanguagePairConfig.action')

    await updateLanguagePairConfig({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      sourceLang: 'en',
      targetLang: 'ja',
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'language_pair_config',
        action: 'language_pair_config.created',
      }),
    )
  })

  it('should write audit log with action updated for existing config', async () => {
    const { updateLanguagePairConfig } = await import('./updateLanguagePairConfig.action')

    await updateLanguagePairConfig({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      sourceLang: 'en',
      targetLang: 'th',
      autoPassThreshold: 90,
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'language_pair_config',
        action: 'language_pair_config.updated',
      }),
    )
  })

  it('should return UPSERT_FAILED when returning() is empty', async () => {
    mockReturning.mockResolvedValue([]) // empty upsert returning

    const { updateLanguagePairConfig } = await import('./updateLanguagePairConfig.action')

    const result = await updateLanguagePairConfig({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      sourceLang: 'en',
      targetLang: 'th',
      autoPassThreshold: 90,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UPSERT_FAILED')
    }
  })
})
