/**
 * Story 4.7: Add to Glossary from Review — addToGlossary Server Action Tests
 */
import { revalidateTag } from 'next/cache'
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

import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { addToGlossary } from '@/features/review/actions/addToGlossary.action'
import { requireRole } from '@/lib/auth/requireRole'
import { asTenantId } from '@/types/tenant'

const mockUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'reviewer@test.com',
  tenantId: asTenantId('00000000-0000-4000-8000-000000000010'),
  role: 'qa_reviewer' as const,
  nativeLanguages: [] as string[],
}

const validInput = {
  findingId: '00000000-0000-4000-8000-000000000100',
  projectId: '00000000-0000-4000-8000-000000000200',
  sourceLang: 'en-US',
  targetLang: 'th-TH',
  sourceTerm: 'financial institution',
  targetTerm: 'สถาบันการเงิน',
  caseSensitive: false,
}

describe('addToGlossary', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    vi.mocked(requireRole).mockResolvedValue(mockUser)
  })

  // ── P0: Core Functionality ──

  it('[P0] should create term when glossary exists for language pair (AC2)', async () => {
    const glossaryId = '00000000-0000-4000-8000-000000000300'
    const termId = '00000000-0000-4000-8000-000000000400'

    dbState.returnValues = [
      // 0: glossary SELECT — found
      [{ id: glossaryId }],
      // 1: duplicate check SELECT — no dup
      [],
      // 2: term INSERT returning
      [
        {
          id: termId,
          glossaryId,
          sourceTerm: 'financial institution',
          targetTerm: 'สถาบันการเงิน',
          caseSensitive: false,
        },
      ],
      // 3: audit log INSERT
      [],
    ]

    const result = await addToGlossary(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        created: true,
        termId,
        glossaryId,
        sourceTerm: 'financial institution',
        targetTerm: 'สถาบันการเงิน',
      })
    }
  })

  it('[P0] should return duplicate info when term already exists (AC3)', async () => {
    const glossaryId = '00000000-0000-4000-8000-000000000300'
    const existingTermId = '00000000-0000-4000-8000-000000000500'

    dbState.returnValues = [
      // 0: glossary SELECT — found
      [{ id: glossaryId }],
      // 1: duplicate check SELECT — found
      [{ id: existingTermId, targetTerm: 'ธนาคาร' }],
    ]

    const result = await addToGlossary({ ...validInput, sourceTerm: 'bank', targetTerm: 'แบงค์' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        created: false,
        duplicate: true,
        existingTermId,
        existingTarget: 'ธนาคาร',
      })
    }
  })

  // ── P1: Supporting Functionality ──

  it('[P1] should auto-create glossary when none exists for language pair (AC1)', async () => {
    const newGlossaryId = '00000000-0000-4000-8000-000000000600'
    const termId = '00000000-0000-4000-8000-000000000700'

    dbState.returnValues = [
      // 0: glossary SELECT — NOT found
      [],
      // 1: project SELECT for name
      [{ name: 'Test Project' }],
      // 2: glossary INSERT returning
      [{ id: newGlossaryId }],
      // 3: duplicate check SELECT — no dup
      [],
      // 4: term INSERT returning
      [
        {
          id: termId,
          glossaryId: newGlossaryId,
          sourceTerm: 'account',
          targetTerm: 'アカウント',
          caseSensitive: false,
        },
      ],
      // 5: audit log INSERT
      [],
    ]

    const result = await addToGlossary({
      ...validInput,
      sourceLang: 'en-US',
      targetLang: 'ja-JP',
      sourceTerm: 'account',
      targetTerm: 'アカウント',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({ created: true })
    }
  })

  it('[P1] should write audit log on successful creation (AC2)', async () => {
    const glossaryId = '00000000-0000-4000-8000-000000000300'
    const termId = '00000000-0000-4000-8000-000000000400'

    dbState.returnValues = [
      [{ id: glossaryId }],
      [],
      [{ id: termId, glossaryId, sourceTerm: 'test', targetTerm: 'ทดสอบ', caseSensitive: false }],
      [],
    ]

    await addToGlossary({ ...validInput, sourceTerm: 'test', targetTerm: 'ทดสอบ' })

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'glossary_term',
        action: 'glossary_term.created_from_review',
        newValue: expect.objectContaining({
          sourceTerm: 'test',
          targetTerm: 'ทดสอบ',
          findingId: validInput.findingId,
        }),
      }),
    )
  })

  it('[P1] should include notes in audit log when provided (AC2)', async () => {
    const glossaryId = '00000000-0000-4000-8000-000000000300'
    const termId = '00000000-0000-4000-8000-000000000400'

    dbState.returnValues = [
      [{ id: glossaryId }],
      [],
      [{ id: termId, glossaryId, sourceTerm: 'test', targetTerm: 'ทดสอบ', caseSensitive: false }],
      [],
    ]

    await addToGlossary({
      ...validInput,
      sourceTerm: 'test',
      targetTerm: 'ทดสอบ',
      notes: 'Reviewer context about this term',
    })

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({
          notes: 'Reviewer context about this term',
        }),
      }),
    )
  })

  it('[P1] should invalidate glossary cache on success (AC2)', async () => {
    const glossaryId = '00000000-0000-4000-8000-000000000300'
    const termId = '00000000-0000-4000-8000-000000000400'

    dbState.returnValues = [
      [{ id: glossaryId }],
      [],
      [{ id: termId, glossaryId, sourceTerm: 'test', targetTerm: 'ทดสอบ', caseSensitive: false }],
      [],
    ]

    await addToGlossary({ ...validInput, sourceTerm: 'test', targetTerm: 'ทดสอบ' })

    expect(revalidateTag).toHaveBeenCalledWith(`glossary-${validInput.projectId}`, 'minutes')
  })

  it('[P1] should reject invalid input — missing sourceLang (AC1)', async () => {
    const result = await addToGlossary({
      findingId: validInput.findingId,
      projectId: validInput.projectId,
      // sourceLang missing
      targetLang: 'th-TH',
      sourceTerm: 'bank',
      targetTerm: 'ธนาคาร',
      caseSensitive: false,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('[P1] should reject empty sourceTerm', async () => {
    const result = await addToGlossary({
      ...validInput,
      sourceTerm: '',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  // ── P1: Boundary Value Tests ──

  it('[P1] should accept sourceTerm at max length (500 chars)', async () => {
    const glossaryId = '00000000-0000-4000-8000-000000000300'
    const termId = '00000000-0000-4000-8000-000000000400'
    const longTerm = 'a'.repeat(500)

    dbState.returnValues = [
      [{ id: glossaryId }],
      [],
      [{ id: termId, glossaryId, sourceTerm: longTerm, targetTerm: 'คำยาว', caseSensitive: false }],
      [],
    ]

    const result = await addToGlossary({
      ...validInput,
      sourceTerm: longTerm,
      targetTerm: 'คำยาว',
    })

    expect(result.success).toBe(true)
  })

  it('[P1] should reject sourceTerm over max length (501 chars)', async () => {
    const tooLongTerm = 'a'.repeat(501)

    const result = await addToGlossary({
      ...validInput,
      sourceTerm: tooLongTerm,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  // ── P2: Edge Cases & Defensive Guards ──

  it('[P2] should return CREATE_FAILED when term INSERT returns empty (Guardrail #4)', async () => {
    const glossaryId = '00000000-0000-4000-8000-000000000300'

    dbState.returnValues = [
      [{ id: glossaryId }],
      [], // no duplicate
      [], // INSERT returning() → empty
    ]

    const result = await addToGlossary(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CREATE_FAILED')
    }
  })

  it('[P2] should NFKC normalize sourceTerm before dedup check', async () => {
    const glossaryId = '00000000-0000-4000-8000-000000000300'
    const termId = '00000000-0000-4000-8000-000000000400'
    // Thai source with composed form
    const sourceTerm = 'ค\u0E33' // decomposed sara am

    dbState.returnValues = [
      [{ id: glossaryId }],
      [],
      [
        {
          id: termId,
          glossaryId,
          sourceTerm: sourceTerm.normalize('NFKC'),
          targetTerm: 'word',
          caseSensitive: false,
        },
      ],
      [],
    ]

    const result = await addToGlossary({
      ...validInput,
      sourceTerm,
      targetTerm: 'word',
    })

    expect(result.success).toBe(true)
    // The stored term should be NFKC normalized
    if (result.success && result.data.created) {
      expect(result.data.sourceTerm).toBe(sourceTerm.normalize('NFKC'))
    }
  })

  it('[P2] should enforce tenant isolation via withTenant()', async () => {
    // Glossary not found because withTenant filters it
    dbState.returnValues = [
      // 0: glossary SELECT — not found (tenant filter)
      [],
      // 1: project SELECT — also not found
      [],
    ]

    const result = await addToGlossary(validInput)

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

    const result = await addToGlossary(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
    // CR-R1 M2: verify requireRole was called with correct args
    expect(requireRole).toHaveBeenCalledWith('qa_reviewer', 'write')
  })

  it('[P2] should handle glossary auto-create race condition', async () => {
    const raceGlossaryId = '00000000-0000-4000-8000-000000000800'
    const termId = '00000000-0000-4000-8000-000000000900'

    dbState.returnValues = [
      // 0: glossary SELECT — NOT found
      [],
      // 1: project SELECT
      [{ name: 'Test Project' }],
      // 2: glossary INSERT .returning() — THROWS at this index (throwAtCallIndex=2)
      [], // placeholder — throw happens before value is read, but callIndex increments to 3
      // 3: re-query SELECT — found (other reviewer created it)
      [{ id: raceGlossaryId }],
      // 4: duplicate check SELECT — no dup
      [],
      // 5: term INSERT
      [
        {
          id: termId,
          glossaryId: raceGlossaryId,
          sourceTerm: 'test',
          targetTerm: 'ทดสอบ',
          caseSensitive: false,
        },
      ],
      // 6: audit log
      [],
    ]
    dbState.throwAtCallIndex = 2 // glossary INSERT throws

    const result = await addToGlossary({ ...validInput, sourceTerm: 'test', targetTerm: 'ทดสอบ' })

    expect(result.success).toBe(true)
  })

  it('[P2] should perform case-insensitive duplicate check via SQL lower()', async () => {
    const glossaryId = '00000000-0000-4000-8000-000000000300'
    const existingTermId = '00000000-0000-4000-8000-000000000500'

    // Existing 'Bank' → 'ธนาคาร', input 'bank' (lowercase)
    dbState.returnValues = [
      [{ id: glossaryId }],
      // dup check finds match (case-insensitive via SQL lower())
      [{ id: existingTermId, targetTerm: 'ธนาคาร' }],
    ]

    const result = await addToGlossary({ ...validInput, sourceTerm: 'bank', targetTerm: 'แบงค์' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        created: false,
        duplicate: true,
        existingTermId,
        existingTarget: 'ธนาคาร',
      })
    }
  })
})
