import { vi } from 'vitest'

/**
 * Shared Drizzle ORM Proxy mock for unit tests.
 *
 * This replaces the duplicated Proxy-based `vi.mock('@/db/client')` pattern
 * that was previously inlined in 15+ test files (TD-TEST-001).
 *
 * Usage in test files:
 * ```ts
 * const { dbState, dbMockModule } = vi.hoisted(() => createDrizzleMock())
 * vi.mock('@/db/client', () => dbMockModule)
 * ```
 *
 * The factory is attached to `globalThis` in `src/test/setup.ts` so it is
 * available inside `vi.hoisted()` (which runs before static imports).
 */

export type DrizzleMockState = {
  /** Sequential call counter — incremented each time a terminal handler fires */
  callIndex: number
  /** Values returned in order by `.then()` and `.returning()` terminals */
  returnValues: unknown[]
  /** Captures arguments passed to `.set()` chainable */
  setCaptures: unknown[]
  /** Captures arguments passed to `.values()` chainable */
  valuesCaptures: unknown[]
  /** When non-null, `.then()` rejects at this callIndex (error injection) */
  throwAtCallIndex: number | null
}

export type DrizzleMockResult = {
  dbState: DrizzleMockState
  dbMockModule: { db: Record<string, unknown> }
}

export function createDrizzleMock(): DrizzleMockResult {
  const state: DrizzleMockState = {
    callIndex: 0,
    returnValues: [],
    setCaptures: [],
    valuesCaptures: [],
    throwAtCallIndex: null,
  }

  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_target, prop) => {
      // Terminal: .returning() — resolves from returnValues[callIndex]
      if (prop === 'returning') {
        return vi.fn(() => {
          const value = state.returnValues[state.callIndex] ?? []
          state.callIndex++
          return Promise.resolve(value)
        })
      }

      // Terminal: .then() — resolves from returnValues[callIndex], supports error injection
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

      // Chainable: .transaction(fn) — forwards tx as same Proxy
      if (prop === 'transaction') {
        return vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(new Proxy({}, handler)))
      }

      // Chainable: .set(args) — captures args, returns Proxy
      if (prop === 'set') {
        return vi.fn((args: unknown) => {
          state.setCaptures.push(args)
          return new Proxy({}, handler)
        })
      }

      // Chainable: .values(args) — captures args, returns Proxy
      if (prop === 'values') {
        return vi.fn((args: unknown) => {
          state.valuesCaptures.push(args)
          return new Proxy({}, handler)
        })
      }

      // Default: any other prop returns a chainable mock
      return vi.fn(() => new Proxy({}, handler))
    },
  }

  return {
    dbState: state,
    dbMockModule: { db: new Proxy({}, handler) },
  }
}
