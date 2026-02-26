/// <reference types="vitest/globals" />
/**
 * Story 2.10 — AC3: NFR2 Performance Test
 *
 * Target: L1 rule engine processes 5,000 segments in < 5 seconds
 * with all 17 checks enabled, using deterministic synthetic data.
 *
 * Timer: performance.now() — NOT Date.now()
 * No network, no DB, no file I/O in the hot path.
 */

// ── Mocks ──
vi.mock('server-only', () => ({}))
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/cache/glossaryCache', () => ({
  getCachedGlossaryTerms: vi.fn().mockResolvedValue([]),
}))

import { processFile } from '@/features/pipeline/engine/ruleEngine'
import { buildPerfSegments } from '@/test/factories'

const PERF_HARD_LIMIT_MS = 5000
const PERF_WARNING_MS = 3000

describe('ruleEngine NFR2 Performance', () => {
  describe('5,000 segment benchmark', () => {
    it('should process 5,000 segments in < 5,000ms with all 17 checks enabled', async () => {
      const segments = buildPerfSegments(5000)

      const start = performance.now()
      const results = await processFile(segments, [], new Set(), [])
      const duration = performance.now() - start

      process.stderr.write(
        `\nNFR2: 5,000 segments in ${duration.toFixed(0)}ms (limit: ${PERF_HARD_LIMIT_MS}ms)\n`,
      )
      process.stderr.write(`Findings produced: ${results.length}\n`)

      expect(results).toBeDefined()
      expect(duration).toBeLessThan(PERF_HARD_LIMIT_MS)
    })

    it('should warn when processing takes > 3,000ms (early regression detection)', async () => {
      const segments = buildPerfSegments(5000)

      const start = performance.now()
      await processFile(segments, [], new Set(), [])
      const duration = performance.now() - start

      if (duration > PERF_WARNING_MS) {
        process.stderr.write(
          `\n⚠️ NFR2 WARNING: ${duration.toFixed(0)}ms exceeds ${PERF_WARNING_MS}ms early warning threshold\n`,
        )
      }

      // Soft assertion: log warning but don't fail (hard fail is at 5000ms)
      // Test passes as long as it completes — the warning is for human review
      expect(duration).toBeLessThan(PERF_HARD_LIMIT_MS)
    })
  })

  describe('boundary tests (Retro A2 mandate)', () => {
    it('should process 0 segments without error', async () => {
      const segments = buildPerfSegments(0)
      const results = await processFile(segments, [], new Set(), [])

      expect(results).toEqual([])
    })

    it('should process 1 segment correctly', async () => {
      const segments = buildPerfSegments(1)
      const results = await processFile(segments, [], new Set(), [])

      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    })

    it('should process 4,999 segments in < 5,000ms', async () => {
      const segments = buildPerfSegments(4999)

      const start = performance.now()
      const results = await processFile(segments, [], new Set(), [])
      const duration = performance.now() - start

      process.stderr.write(`\nNFR2 boundary (4,999): ${duration.toFixed(0)}ms\n`)

      expect(results).toBeDefined()
      expect(duration).toBeLessThan(PERF_HARD_LIMIT_MS)
    })

    it('should process 5,001 segments in < 5,000ms with margin', async () => {
      const segments = buildPerfSegments(5001)

      const start = performance.now()
      const results = await processFile(segments, [], new Set(), [])
      const duration = performance.now() - start

      process.stderr.write(`\nNFR2 boundary (5,001): ${duration.toFixed(0)}ms\n`)

      expect(results).toBeDefined()
      expect(duration).toBeLessThan(PERF_HARD_LIMIT_MS)
    })
  })
})
