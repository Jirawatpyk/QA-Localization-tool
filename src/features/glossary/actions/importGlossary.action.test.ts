import { beforeEach, describe, expect, it, vi } from 'vitest'

// 1. Mock server-only FIRST
vi.mock('server-only', () => ({}))

// Test UUIDs
const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const PROJECT_ID = '00000000-0000-4000-8000-000000000003'
const GLOSSARY_ID = '00000000-0000-4000-8000-000000000004'

// 2. Mock data
const mockCurrentUser = {
  id: USER_ID,
  email: 'admin@test.com',
  tenantId: TENANT_ID,
  role: 'admin' as const,
}

const mockProject = {
  id: PROJECT_ID,
  tenantId: TENANT_ID,
  name: 'Test Project',
  sourceLang: 'en',
  targetLangs: ['th'],
}

const mockGlossary = {
  id: GLOSSARY_ID,
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  name: 'Test Glossary',
  sourceLang: 'en',
  targetLang: 'th',
  createdAt: new Date(),
}

// 3. Mock DB
const mockReturning = vi.fn().mockResolvedValue([mockGlossary])
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
const mockInsert = vi.fn().mockReturnValue({ values: mockValues })

const mockSelectWhere = vi.fn()
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere })
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom })

vi.mock('@/db/client', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn(),
}))

vi.mock('@/db/schema/glossaries', () => ({
  glossaries: { tenantId: 'tenant_id', projectId: 'project_id', id: 'id' },
}))

vi.mock('@/db/schema/glossaryTerms', () => ({
  glossaryTerms: { glossaryId: 'glossary_id', sourceTerm: 'source_term' },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: { id: 'id', tenantId: 'tenant_id' },
}))

// 4. Mock requireRole
const mockRequireRole = vi.fn().mockResolvedValue(mockCurrentUser)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

// 5. Mock parsers
const mockParseGlossaryFile = vi.fn().mockResolvedValue({
  terms: [
    { sourceTerm: 'System', targetTerm: 'ระบบ', lineNumber: 2 },
    { sourceTerm: 'Database', targetTerm: 'ฐานข้อมูล', lineNumber: 3 },
  ],
  errors: [],
})
vi.mock('@/features/glossary/parsers', () => ({
  parseGlossaryFile: (...args: unknown[]) => mockParseGlossaryFile(...args),
}))

// 6. Mock audit + cache
const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

const mockRevalidateTag = vi.fn()
const mockRevalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}))

function makeFormData() {
  const fd = new FormData()
  fd.append(
    'file',
    new File(['source,target\nSystem,ระบบ\nDatabase,ฐานข้อมูล'], 'glossary.csv', {
      type: 'text/csv',
    }),
  )
  fd.append('name', 'Test Glossary')
  fd.append('projectId', PROJECT_ID)
  fd.append('format', 'csv')
  fd.append('sourceColumn', 'source')
  fd.append('targetColumn', 'target')
  fd.append('hasHeader', 'true')
  fd.append('delimiter', ',')
  return fd
}

describe('importGlossary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    mockReturning.mockResolvedValue([mockGlossary])
    // Project lookup (cross-DB dedup removed — glossary is always new)
    mockSelectWhere.mockResolvedValueOnce([mockProject])
    mockParseGlossaryFile.mockResolvedValue({
      terms: [
        { sourceTerm: 'System', targetTerm: 'ระบบ', lineNumber: 2 },
        { sourceTerm: 'Database', targetTerm: 'ฐานข้อมูล', lineNumber: 3 },
      ],
      errors: [],
    })
  })

  it('should import CSV glossary successfully', async () => {
    const { importGlossary } = await import('./importGlossary.action')
    const result = await importGlossary(makeFormData())

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.glossaryId).toBe(GLOSSARY_ID)
      expect(result.data.imported).toBe(2)
      expect(result.data.duplicates).toBe(0)
      expect(result.data.errors).toHaveLength(0)
    }
  })

  it('should return FORBIDDEN for non-admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { importGlossary } = await import('./importGlossary.action')
    const result = await importGlossary(makeFormData())

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should return VALIDATION_ERROR for invalid format', async () => {
    const fd = makeFormData()
    fd.set('format', 'pdf')

    const { importGlossary } = await import('./importGlossary.action')
    const result = await importGlossary(fd)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should write audit log with correct fields', async () => {
    const { importGlossary } = await import('./importGlossary.action')
    await importGlossary(makeFormData())

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        entityType: 'glossary',
        entityId: GLOSSARY_ID,
        action: 'glossary.created',
      }),
    )
  })

  it('should call revalidateTag with glossary-{projectId}', async () => {
    const { importGlossary } = await import('./importGlossary.action')
    await importGlossary(makeFormData())

    expect(mockRevalidateTag).toHaveBeenCalledWith(`glossary-${PROJECT_ID}`, 'minutes')
  })

  it('should return VALIDATION_ERROR for missing fields', async () => {
    const fd = new FormData()
    fd.append('name', 'Test')

    const { importGlossary } = await import('./importGlossary.action')
    const result = await importGlossary(fd)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })
})
