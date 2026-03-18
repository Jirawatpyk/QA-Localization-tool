/**
 * Story 4.7: Add to Glossary from Review — updateGlossaryTerm Server Action Tests
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const { dbState, dbMockModule } = vi.hoisted(() => createDrizzleMock())

vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: vi.fn(),
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: vi.fn(),
}))

import { revalidateTag } from 'next/cache'

import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { updateGlossaryTerm } from '@/features/review/actions/updateGlossaryTerm.action'
import { requireRole } from '@/lib/auth/requireRole'

const mockUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'reviewer@test.com',
  tenantId: '00000000-0000-4000-8000-000000000010',
  role: 'qa_reviewer' as const,
}

const validInput = {
  termId: '00000000-0000-4000-8000-000000000100',
  targetTerm: 'สถาบันการเงิน',
  projectId: '00000000-0000-4000-8000-000000000200',
}

describe('updateGlossaryTerm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    vi.mocked(requireRole).mockResolvedValue(mockUser)
  })

  it('[P1] should update existing term target when reviewer chooses "Update existing" (AC3)', async () => {
    dbState.returnValues = [
      // 0: SELECT term+glossary JOIN
      [
        {
          id: validInput.termId,
          targetTerm: 'ธนาคาร',
          glossaryId: '00000000-0000-4000-8000-000000000300',
        },
      ],
      // 1: UPDATE returning
      [{ id: validInput.termId, targetTerm: 'สถาบันการเงิน' }],
      // 2: audit log
      [],
    ]

    const result = await updateGlossaryTerm(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.termId).toBe(validInput.termId)
      expect(result.data.targetTerm).toBe('สถาบันการเงิน')
    }
  })

  it('[P1] should write audit log with oldValue and newValue on update (AC3)', async () => {
    dbState.returnValues = [
      [
        {
          id: validInput.termId,
          targetTerm: 'ธนาคาร',
          glossaryId: '00000000-0000-4000-8000-000000000300',
        },
      ],
      [{ id: validInput.termId, targetTerm: 'สถาบันการเงิน' }],
      [],
    ]

    await updateGlossaryTerm(validInput)

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'glossary_term.updated_from_review',
        oldValue: { targetTerm: 'ธนาคาร' },
        newValue: { targetTerm: 'สถาบันการเงิน' },
      }),
    )
  })

  it('[P1] should invalidate glossary cache after update (AC3)', async () => {
    dbState.returnValues = [
      [
        {
          id: validInput.termId,
          targetTerm: 'ธนาคาร',
          glossaryId: '00000000-0000-4000-8000-000000000300',
        },
      ],
      [{ id: validInput.termId, targetTerm: 'สถาบันการเงิน' }],
      [],
    ]

    await updateGlossaryTerm(validInput)

    expect(revalidateTag).toHaveBeenCalledWith(`glossary-${validInput.projectId}`, 'minutes')
  })

  it('[P2] should enforce tenant isolation — term not found for other tenant', async () => {
    // Term not found because withTenant filters it
    dbState.returnValues = [
      [], // JOIN returns nothing — different tenant
    ]

    const result = await updateGlossaryTerm(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  it('[P2] should return FORBIDDEN for non-qa_reviewer role', async () => {
    vi.mocked(requireRole).mockRejectedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Insufficient permissions',
    })

    const result = await updateGlossaryTerm(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })
})
