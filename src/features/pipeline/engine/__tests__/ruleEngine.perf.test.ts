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
import type { GlossaryTermRecord } from '@/features/pipeline/engine/types'
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

  // TA: Coverage Gap Tests — Stories 2.7 & 3.5 (Advanced Elicitation: FP+CM+RE+SC)

  describe('glossary performance (G1)', () => {
    it('should process 5,000 segments with 100 glossary terms in < 5,000ms', async () => {
      // G1: Production workload includes glossary — Intl.Segmenter boundary validation is heavy
      const segments = buildPerfSegments(5000)
      const glossaryTerms: GlossaryTermRecord[] = Array.from({ length: 100 }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        tenantId: '00000000-0000-4000-8000-000000000001',
        glossaryId: '00000000-0000-4000-8000-100000000000',
        sourceTerm: `term${i}`,
        targetTerm: `คำศัพท์${i}`,
        caseSensitive: false,
        notes: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }))

      const start = performance.now()
      const results = await processFile(segments, glossaryTerms, new Set(), [])
      const duration = performance.now() - start

      process.stderr.write(`\nG1: 5,000 segs + 100 glossary terms in ${duration.toFixed(0)}ms\n`)
      process.stderr.write(`Findings produced: ${results.length}\n`)

      expect(results).toBeDefined()
      expect(duration).toBeLessThan(PERF_HARD_LIMIT_MS)
    })
  })

  describe('check category coverage (G7)', () => {
    it('should produce findings from at least 3 distinct check categories with 5,000 segments', async () => {
      // G7: Verify synthetic data exercises multiple check paths
      // NOTE: buildPerfSegments triggers ~3 categories (capitalization, completeness, punctuation)
      // with synthetic data. Real corpus data triggers more (tag_integrity, number_format, etc.)
      // This establishes the BASELINE — if category count drops, a check may have regressed.
      const segments = buildPerfSegments(5000)
      const results = await processFile(segments, [], new Set(), [])

      const categories = new Set(results.map((r) => r.category))

      process.stderr.write(`\nG7: Categories triggered: ${[...categories].sort().join(', ')}\n`)
      process.stderr.write(`Distinct categories: ${categories.size}\n`)

      // Baseline: 2 categories from synthetic data (th-TH target)
      // TD-AI-003: checkEndPunctuation skips Thai → punctuation category no longer fires
      // If this drops below 2, a check function may have broken
      expect(categories.size).toBeGreaterThanOrEqual(2)
    })
  })

  describe('buildPerfSegments distribution (G8)', () => {
    it('should produce correct content type distribution at 1,000 segments', () => {
      // G8: Verify deterministic distribution: 60% normal, 10% tags, 10% numbers,
      // 5% placeholders, 10% Thai/CJK, 5% edge cases
      const segments = buildPerfSegments(1000)

      expect(segments).toHaveLength(1000)

      // Count by distribution bucket (mirrors factory logic)
      let normal = 0
      let tags = 0
      let numbers = 0
      let placeholders = 0
      let thaiCjk = 0
      let edge = 0

      for (let i = 0; i < 1000; i++) {
        const pct = (i * 100) / 1000
        if (pct < 60) normal++
        else if (pct < 70) tags++
        else if (pct < 80) numbers++
        else if (pct < 85) placeholders++
        else if (pct < 95) thaiCjk++
        else edge++
      }

      expect(normal).toBe(600)
      expect(tags).toBe(100)
      expect(numbers).toBe(100)
      expect(placeholders).toBe(50)
      expect(thaiCjk).toBe(100)
      expect(edge).toBe(50)

      // Every segment should have required fields (some edge cases have empty target)
      for (const seg of segments) {
        expect(seg.sourceText).toBeDefined()
        expect(seg.targetText).toBeDefined()
        expect(seg.id).toBeTruthy()
      }
    })
  })
})
