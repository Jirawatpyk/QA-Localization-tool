import type { DrizzleMockResult } from './drizzleMock'

/**
 * Global test helpers attached by src/test/setup.ts.
 * Available inside vi.hoisted() because setupFiles run before test file processing.
 */
declare global {
  function createDrizzleMock(): DrizzleMockResult
}

export {}
