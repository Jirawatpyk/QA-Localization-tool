import { beforeEach, describe, expect, it, vi } from 'vitest'

// 1. Mock server-only FIRST
vi.mock('server-only', () => ({}))

// Test UUIDs
const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const GLOSSARY_ID = '00000000-0000-4000-8000-000000000003'
const TERM_ID = '00000000-0000-4000-8000-000000000004'

// 2. Mock data
const mockCurrentUser = {
  id: USER_ID,
  email: 'reviewer@test.com',
  tenantId: TENANT_ID,
  role: 'qa_reviewer' as const,
}

const mockGlossary = {
  id: GLOSSARY_ID,
  tenantId: TENANT_ID,
  projectId: '00000000-0000-4000-8000-000000000005',
  name: 'Test Glossary',
  sourceLang: 'en',
  targetLang: 'th',
  createdAt: new Date(),
}

const mockTerms = [
  {
    id: TERM_ID,
    glossaryId: GLOSSARY_ID,
    sourceTerm: 'cloud computing',
    targetTerm: 'คลาวด์คอมพิวติ้ง',
    caseSensitive: false,
    createdAt: new Date('2026-01-01'),
  },
]

// 3. Mock DB — two sequential selects: glossary lookup, then terms
const mockSelectWhere = vi.fn()
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere })
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom })

vi.mock('@/db/client', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn(),
}))

vi.mock('@/db/schema/glossaries', () => ({
  glossaries: { id: 'id', tenantId: 'tenant_id' },
}))

vi.mock('@/db/schema/glossaryTerms', () => ({
  glossaryTerms: { glossaryId: 'glossary_id' },
}))

// 4. Mock getCurrentUser
const mockGetCurrentUser = vi.fn().mockResolvedValue(mockCurrentUser)
vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}))

describe('getGlossaryTerms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue(mockCurrentUser)
    mockSelectWhere.mockReset()
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
    mockSelectWhere
      .mockResolvedValueOnce([mockGlossary]) // glossary lookup
      .mockResolvedValueOnce(mockTerms) // terms query
  })

  it('should return VALIDATION_ERROR for invalid glossaryId', async () => {
    const { getGlossaryTerms } = await import('./getGlossaryTerms.action')
    const result = await getGlossaryTerms('not-a-uuid')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
    expect(mockGetCurrentUser).not.toHaveBeenCalled()
  })

  it('should return terms for authenticated user', async () => {
    const { getGlossaryTerms } = await import('./getGlossaryTerms.action')
    const result = await getGlossaryTerms(GLOSSARY_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0]?.sourceTerm).toBe('cloud computing')
      expect(result.data[0]?.targetTerm).toBe('คลาวด์คอมพิวติ้ง')
    }
  })

  it('should return UNAUTHORIZED when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    const { getGlossaryTerms } = await import('./getGlossaryTerms.action')
    const result = await getGlossaryTerms(GLOSSARY_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UNAUTHORIZED')
    }
  })

  it('should return NOT_FOUND for cross-tenant glossary', async () => {
    mockSelectWhere.mockReset()
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
    mockSelectWhere.mockResolvedValueOnce([]) // glossary not found (tenant filter)

    const { getGlossaryTerms } = await import('./getGlossaryTerms.action')
    const result = await getGlossaryTerms(GLOSSARY_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  it('should return empty array when glossary has no terms', async () => {
    mockSelectWhere.mockReset()
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
    mockSelectWhere
      .mockResolvedValueOnce([mockGlossary]) // glossary found
      .mockResolvedValueOnce([]) // no terms

    const { getGlossaryTerms } = await import('./getGlossaryTerms.action')
    const result = await getGlossaryTerms(GLOSSARY_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(0)
    }
  })
})
