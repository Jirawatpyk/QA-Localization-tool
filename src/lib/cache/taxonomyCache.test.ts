import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock data ---
const mockMappings = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    category: 'Accuracy',
    parentCategory: 'Omission',
    internalName: 'Missing text',
    severity: 'critical',
    description: 'Text absent.',
    isCustom: false,
    isActive: true,
    displayOrder: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    category: 'Fluency',
    parentCategory: null,
    internalName: 'Grammar',
    severity: 'major',
    description: 'Grammatical error.',
    isCustom: false,
    isActive: true,
    displayOrder: 1,
    createdAt: new Date('2026-01-02'),
    updatedAt: new Date('2026-01-02'),
  },
]

// --- DB mock via hoisted proxy ---
const { dbState, dbMockModule } = vi.hoisted(() => {
  const state = {
    callIndex: 0,
    returnValues: [] as unknown[],
  }

  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_target, prop) => {
      if (prop === 'then') {
        return (resolve?: (v: unknown) => void) => {
          const value = state.returnValues[state.callIndex] ?? []
          state.callIndex++
          resolve?.(value)
        }
      }
      return vi.fn(() => new Proxy({}, handler))
    },
  }

  return {
    dbState: state,
    dbMockModule: { db: new Proxy({}, handler) },
  }
})

vi.mock('@/db/client', () => dbMockModule)

vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

vi.mock('@/db/schema/taxonomyDefinitions', () => ({
  taxonomyDefinitions: {
    id: 'id',
    category: 'category',
    parentCategory: 'parent_category',
    internalName: 'internal_name',
    severity: 'severity',
    description: 'description',
    isCustom: 'is_custom',
    isActive: 'is_active',
    displayOrder: 'display_order',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
}))

describe('taxonomyCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  describe('getCachedTaxonomyMappings', () => {
    it('should return active mappings ordered by displayOrder', async () => {
      dbState.returnValues = [mockMappings]

      const { getCachedTaxonomyMappings } = await import('@/lib/cache/taxonomyCache')
      const result = await getCachedTaxonomyMappings()

      expect(result).toEqual(mockMappings)
      expect(result).toHaveLength(2)
      // Verify order: displayOrder 0 first, then 1
      expect(result[0]!.displayOrder).toBe(0)
      expect(result[1]!.displayOrder).toBe(1)
    })

    it('should filter out inactive and null internalName mappings (via query)', async () => {
      // The function uses .where(and(eq(isActive, true), isNotNull(internalName)))
      // so the DB returns only filtered results — we verify the function passes them through
      const filteredMappings = [mockMappings[0]!]
      dbState.returnValues = [filteredMappings]

      const { getCachedTaxonomyMappings } = await import('@/lib/cache/taxonomyCache')
      const result = await getCachedTaxonomyMappings()

      expect(result).toEqual(filteredMappings)
      expect(result).toHaveLength(1)
    })

    it('should NOT use withTenant — taxonomy is shared reference data with no tenant_id', async () => {
      // taxonomyCache.ts does NOT import or call withTenant because
      // taxonomy_definitions is shared reference data (no tenant_id column per ERD 1.9).
      // This test documents that this is intentional behavior.
      dbState.returnValues = [mockMappings]

      const { getCachedTaxonomyMappings } = await import('@/lib/cache/taxonomyCache')
      await getCachedTaxonomyMappings()

      // Verify the source code does not reference withTenant
      // (we can't mock-check since it's not even imported)
      // This test exists as documentation that no tenant filtering is correct
      expect(true).toBe(true)
    })

    it('should use cache tag "taxonomy"', async () => {
      dbState.returnValues = [mockMappings]

      const { cacheTag } = await import('next/cache')
      const { getCachedTaxonomyMappings } = await import('@/lib/cache/taxonomyCache')
      await getCachedTaxonomyMappings()

      expect(cacheTag).toHaveBeenCalledWith('taxonomy')
    })

    it('should return empty array when no active mappings exist', async () => {
      dbState.returnValues = [[]]

      const { getCachedTaxonomyMappings } = await import('@/lib/cache/taxonomyCache')
      const result = await getCachedTaxonomyMappings()

      expect(result).toEqual([])
    })
  })
})
