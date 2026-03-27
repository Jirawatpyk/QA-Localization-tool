import { beforeEach, describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/types/tenant'

// --- Constants ---
const TENANT_ID = asTenantId('00000000-0000-4000-8000-000000000001')
const PROJECT_ID = '00000000-0000-4000-8000-000000000010'
const GLOSSARY_ID_1 = '00000000-0000-4000-8000-000000000020'
const GLOSSARY_ID_2 = '00000000-0000-4000-8000-000000000021'

// --- Mock data ---
const mockGlossaries = [
  {
    id: GLOSSARY_ID_1,
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    name: 'Main Glossary',
    sourceLang: 'en',
    targetLang: 'th',
    createdAt: new Date('2026-01-01'),
  },
  {
    id: GLOSSARY_ID_2,
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    name: 'Secondary Glossary',
    sourceLang: 'en',
    targetLang: 'th',
    createdAt: new Date('2026-01-02'),
  },
]

const mockTerms = [
  {
    id: '00000000-0000-4000-8000-000000000030',
    tenantId: TENANT_ID,
    glossaryId: GLOSSARY_ID_1,
    sourceTerm: 'cloud computing',
    targetTerm: 'คลาวด์คอมพิวติ้ง',
    caseSensitive: false,
    notes: null,
    createdAt: new Date('2026-01-01'),
  },
  {
    id: '00000000-0000-4000-8000-000000000031',
    tenantId: TENANT_ID,
    glossaryId: GLOSSARY_ID_2,
    sourceTerm: 'machine learning',
    targetTerm: 'การเรียนรู้ของเครื่อง',
    caseSensitive: true,
    notes: 'AI term',
    createdAt: new Date('2026-01-02'),
  },
]

// --- DB mock via createDrizzleMock ---
const { dbState, dbMockModule } = vi.hoisted(() => {
  // Inline createDrizzleMock since vi.hoisted runs before imports
  const state = {
    callIndex: 0,
    returnValues: [] as unknown[],
    setCaptures: [] as unknown[],
    valuesCaptures: [] as unknown[],
    throwAtCallIndex: null as number | null,
  }

  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_target, prop) => {
      if (prop === 'returning') {
        return vi.fn(() => {
          if (state.throwAtCallIndex !== null && state.callIndex === state.throwAtCallIndex) {
            state.callIndex++
            return Promise.reject(new Error('DB query failed'))
          }
          const value = state.returnValues[state.callIndex] ?? []
          state.callIndex++
          return Promise.resolve(value)
        })
      }
      if (prop === 'then') {
        return (resolve?: (v: unknown) => void, reject?: (err: unknown) => void) => {
          if (state.throwAtCallIndex !== null && state.callIndex === state.throwAtCallIndex) {
            state.callIndex++
            reject?.(new Error('DB query failed'))
            return
          }
          const value = state.returnValues[state.callIndex] ?? []
          state.callIndex++
          resolve?.(value)
        }
      }
      if (prop === 'transaction') {
        return vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(new Proxy({}, handler)))
      }
      if (prop === 'set') {
        return vi.fn((args: unknown) => {
          state.setCaptures.push(args)
          return new Proxy({}, handler)
        })
      }
      if (prop === 'values') {
        return vi.fn((args: unknown) => {
          state.valuesCaptures.push(args)
          return new Proxy({}, handler)
        })
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

const mockWithTenant = vi.fn()
vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: (...args: unknown[]) => mockWithTenant(...args),
}))

vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

vi.mock('@/db/schema/glossaries', () => ({
  glossaries: {
    id: 'id',
    tenantId: 'tenant_id',
    projectId: 'project_id',
    name: 'name',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
    createdAt: 'created_at',
  },
}))

vi.mock('@/db/schema/glossaryTerms', () => ({
  glossaryTerms: {
    id: 'id',
    tenantId: 'tenant_id',
    glossaryId: 'glossary_id',
    sourceTerm: 'source_term',
    targetTerm: 'target_term',
    caseSensitive: 'case_sensitive',
    notes: 'notes',
    createdAt: 'created_at',
  },
}))

describe('glossaryCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockWithTenant.mockReturnValue('tenant-filter')
  })

  describe('getCachedGlossaryTerms', () => {
    it('should return terms filtered by project glossaries and tenantId', async () => {
      // Call 0: select glossary IDs for project
      // Call 1: select terms by glossaryIds
      dbState.returnValues = [[{ id: GLOSSARY_ID_1 }, { id: GLOSSARY_ID_2 }], mockTerms]

      const { getCachedGlossaryTerms } = await import('@/lib/cache/glossaryCache')
      const result = await getCachedGlossaryTerms(PROJECT_ID, TENANT_ID)

      expect(result).toEqual(mockTerms)
      expect(result).toHaveLength(2)
      expect(mockWithTenant).toHaveBeenCalledWith('tenant_id', TENANT_ID)
    })

    it('should return empty array when no glossaries exist for project', async () => {
      // Call 0: no glossaries found
      dbState.returnValues = [[]]

      const { getCachedGlossaryTerms } = await import('@/lib/cache/glossaryCache')
      const result = await getCachedGlossaryTerms(PROJECT_ID, TENANT_ID)

      expect(result).toEqual([])
      // Only 1 DB call — early return before terms query
      expect(dbState.callIndex).toBe(1)
    })

    it('should call withTenant for tenant isolation on both queries', async () => {
      dbState.returnValues = [[{ id: GLOSSARY_ID_1 }], [mockTerms[0]]]

      const { getCachedGlossaryTerms } = await import('@/lib/cache/glossaryCache')
      await getCachedGlossaryTerms(PROJECT_ID, TENANT_ID)

      // withTenant called for glossaries query and glossaryTerms query
      expect(mockWithTenant).toHaveBeenCalledTimes(2)
      expect(mockWithTenant).toHaveBeenCalledWith('tenant_id', TENANT_ID)
    })
  })

  describe('getGlossaryTerms', () => {
    it('should return terms with glossary join filtered by projectId and tenantId', async () => {
      // Single JOIN query — call 0
      dbState.returnValues = [mockTerms]

      const { getGlossaryTerms } = await import('@/lib/cache/glossaryCache')
      const result = await getGlossaryTerms(PROJECT_ID, TENANT_ID)

      expect(result).toEqual(mockTerms)
      expect(result).toHaveLength(2)
    })

    it('should return empty array when no glossaries exist for project', async () => {
      dbState.returnValues = [[]]

      const { getGlossaryTerms } = await import('@/lib/cache/glossaryCache')
      const result = await getGlossaryTerms(PROJECT_ID, TENANT_ID)

      expect(result).toEqual([])
    })

    it('should call withTenant for both glossaries and glossaryTerms tables', async () => {
      dbState.returnValues = [mockTerms]

      const { getGlossaryTerms } = await import('@/lib/cache/glossaryCache')
      await getGlossaryTerms(PROJECT_ID, TENANT_ID)

      // withTenant called twice: once for glossaries.tenantId, once for glossaryTerms.tenantId
      expect(mockWithTenant).toHaveBeenCalledTimes(2)
      expect(mockWithTenant).toHaveBeenCalledWith('tenant_id', TENANT_ID)
    })
  })

  describe('getCachedGlossaries', () => {
    it('should return glossaries for project filtered by tenantId', async () => {
      dbState.returnValues = [mockGlossaries]

      const { getCachedGlossaries } = await import('@/lib/cache/glossaryCache')
      const result = await getCachedGlossaries(PROJECT_ID, TENANT_ID)

      expect(result).toEqual(mockGlossaries)
      expect(result).toHaveLength(2)
    })

    it('should return empty array when no glossaries exist', async () => {
      dbState.returnValues = [[]]

      const { getCachedGlossaries } = await import('@/lib/cache/glossaryCache')
      const result = await getCachedGlossaries(PROJECT_ID, TENANT_ID)

      expect(result).toEqual([])
    })

    it('should call withTenant for tenant isolation', async () => {
      dbState.returnValues = [mockGlossaries]

      const { getCachedGlossaries } = await import('@/lib/cache/glossaryCache')
      await getCachedGlossaries(PROJECT_ID, TENANT_ID)

      expect(mockWithTenant).toHaveBeenCalledTimes(1)
      expect(mockWithTenant).toHaveBeenCalledWith('tenant_id', TENANT_ID)
    })
  })
})
