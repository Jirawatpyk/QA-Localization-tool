/**
 * ATDD Story 5.1 — btCache unit tests
 *
 * Tests cache operations for back-translation:
 *   - computeTargetTextHash: SHA-256 (Guardrail #57)
 *   - getCachedBackTranslation: TTL filter + withTenant (Guardrails #58, #61)
 *   - cacheBackTranslation: onConflictDoUpdate (Guardrail #59)
 *   - invalidateBTCacheForGlossary: explicit DELETE (Guardrail #60)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// computeTargetTextHash is a pure function (uses Web Crypto) — test directly
import { computeTargetTextHash } from './btCache'

// DB-layer functions need Drizzle mock
const { dbState, dbMockModule } = vi.hoisted(() =>
  (
    globalThis as unknown as {
      createDrizzleMock: () => {
        dbState: {
          callIndex: number
          returnValues: unknown[]
          valuesCaptures: unknown[]
          setCaptures: unknown[]
        }
        dbMockModule: Record<string, unknown>
      }
    }
  ).createDrizzleMock(),
)
vi.mock('@/db/client', () => dbMockModule)

const mockWithTenant = vi.fn((_col: unknown, _id: unknown) => ({ type: 'withTenant' }))
vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: (_col: unknown, _id: unknown) => mockWithTenant(_col, _id),
}))

describe('btCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  // ── AC2 / Scenario 2.5 [P1]: targetTextHash (SHA-256) ─────────────────
  describe('computeTargetTextHash', () => {
    it('should compute SHA-256 hash for target text', async () => {
      const hash = await computeTargetTextHash('สวัสดีครับ')
      expect(hash).toMatch(/^[a-f0-9]{64}$/) // SHA-256 = 64 hex chars
    })

    it('should produce different hashes for different texts', async () => {
      const hash1 = await computeTargetTextHash('สวัสดีครับ')
      const hash2 = await computeTargetTextHash('สวัสดีค่ะ')
      expect(hash1).not.toBe(hash2)
    })

    it('should produce same hash for same text (deterministic)', async () => {
      const hash1 = await computeTargetTextHash('テスト')
      const hash2 = await computeTargetTextHash('テスト')
      expect(hash1).toBe(hash2)
    })
  })

  // ── AC2 / Scenario 2.3 [P0]: Cache hit/miss ──────────────────────────
  describe('getCachedBackTranslation', () => {
    it('should return cached result when entry exists and is within TTL', async () => {
      const { getCachedBackTranslation } = await import('./btCache')

      dbState.returnValues = [
        [
          {
            backTranslation: 'Hello',
            contextualExplanation: 'A greeting',
            confidence: 0.95,
            languageNotes: [],
            translationApproach: null,
          },
        ],
      ]

      const result = await getCachedBackTranslation(
        '11111111-1111-1111-1111-111111111111',
        'en-US→th-TH',
        'gpt-4o-mini-bt-v1',
        'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f' as import('@/types/tenant').TenantId,
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      )

      expect(result).not.toBeNull()
      expect(result!.backTranslation).toBe('Hello')
      expect(result!.confidence).toBe(0.95)
      expect(result!.translationApproach).toBeNull()
      expect(result!.cached).toBe(true)
    })

    it('should return null when no cache entry exists (cache miss)', async () => {
      const { getCachedBackTranslation } = await import('./btCache')

      dbState.returnValues = [[]] // Empty result

      const result = await getCachedBackTranslation(
        '99999999-9999-9999-9999-999999999999',
        'en-US→th-TH',
        'gpt-4o-mini-bt-v1',
        'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f' as import('@/types/tenant').TenantId,
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      )

      expect(result).toBeNull()
    })
  })

  // ── AC2 / Scenario 2.7 [P1]: onConflictDoUpdate ──────────────────────
  describe('cacheBackTranslation', () => {
    it('should insert cache entry with correct values (onConflictDoUpdate)', async () => {
      const { cacheBackTranslation } = await import('./btCache')

      dbState.returnValues = [undefined]

      const params = {
        segmentId: '11111111-1111-1111-1111-111111111111',
        tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f' as import('@/types/tenant').TenantId,
        languagePair: 'en-US→th-TH',
        modelVersion: 'gpt-4o-mini-bt-v1',
        targetTextHash: 'abc123def456',
        result: {
          backTranslation: 'Hello',
          contextualExplanation: 'A greeting',
          confidence: 0.95,
          languageNotes: [],
          translationApproach: null,
        },
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: 0.0001,
      }

      await cacheBackTranslation(params)

      // Verify values were passed to insert via .values() chainable
      expect(dbState.valuesCaptures.length).toBeGreaterThan(0)
      const inserted = dbState.valuesCaptures[0] as Record<string, unknown>
      expect(inserted.segmentId).toBe(params.segmentId)
      expect(inserted.tenantId).toBe(params.tenantId)
      expect(inserted.targetTextHash).toBe(params.targetTextHash)
      expect(inserted.backTranslation).toBe('Hello')
      expect(inserted.confidence).toBe(0.95)
      expect(inserted.inputTokens).toBe(100)
      expect(inserted.outputTokens).toBe(50)
    })
  })

  // ── Glossary invalidation (Guardrail #60) ─────────────────────────────
  describe('invalidateBTCacheForGlossary', () => {
    it('should DELETE cache entries for project+languagePair with withTenant (Guardrail #58)', async () => {
      const { invalidateBTCacheForGlossary } = await import('./btCache')

      const tenantId = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f' as import('@/types/tenant').TenantId
      dbState.returnValues = [[{ id: 'deleted-1' }, { id: 'deleted-2' }]]

      const count = await invalidateBTCacheForGlossary(
        '22222222-2222-2222-2222-222222222222',
        'en-US→th-TH',
        tenantId,
      )

      expect(count).toBe(2)
      // Verify withTenant was called with the correct tenantId
      expect(mockWithTenant).toHaveBeenCalledWith(expect.anything(), tenantId)
    })
  })

  // ── TTL cleanup (Guardrail #61) ──────────────────────────────────────
  describe('deleteExpiredBTCache', () => {
    it('should delete entries older than 24 hours', async () => {
      const { deleteExpiredBTCache } = await import('./btCache')

      dbState.returnValues = [[{ id: 'expired-1' }]]

      const count = await deleteExpiredBTCache()
      expect(count).toBe(1)
    })
  })
})
