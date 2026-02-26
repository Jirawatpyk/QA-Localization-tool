import type { DrizzleMockResult } from './drizzleMock'
import type { AIMockOptions, AIMockResult } from './mocks/ai-providers'

/**
 * Global test helpers attached by src/test/setup.ts.
 * Available inside vi.hoisted() because setupFiles run before test file processing.
 */
declare global {
  function createDrizzleMock(): DrizzleMockResult
  function createAIMock(options?: AIMockOptions): AIMockResult
}

export {}
