/**
 * P2-02: Batch 50-file throughput — Enterprise scenario benchmark.
 *
 * Beyond NFR7 (10 files × 5K segments). Tests 50 files × 100 segments
 * through the L1 rule engine to validate enterprise batch scalability.
 *
 * Each file runs processFile independently (simulating Inngest fan-out).
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

const FILE_COUNT = 50
const SEGMENTS_PER_FILE = 100
const TOTAL_SEGMENTS = FILE_COUNT * SEGMENTS_PER_FILE
const HARD_LIMIT_MS = 15_000

describe('P2-02: Batch 50-file throughput benchmark', () => {
  it(`should process ${FILE_COUNT} files × ${SEGMENTS_PER_FILE} segments in < ${HARD_LIMIT_MS / 1000}s`, async () => {
    // Pre-generate all file segments (excluded from timing)
    const fileBatches = Array.from({ length: FILE_COUNT }, () =>
      buildPerfSegments(SEGMENTS_PER_FILE),
    )

    let totalFindings = 0
    const start = performance.now()

    for (const segments of fileBatches) {
      const results = await processFile(segments, [], new Set(), [])
      totalFindings += results.length
    }

    const elapsed = performance.now() - start
    const avgPerFile = elapsed / FILE_COUNT

    process.stderr.write(
      `\nP2-02: ${FILE_COUNT} files × ${SEGMENTS_PER_FILE} segments = ${TOTAL_SEGMENTS.toLocaleString()} total\n`,
    )
    process.stderr.write(
      `  Total: ${elapsed.toFixed(0)}ms | Avg/file: ${avgPerFile.toFixed(0)}ms | Findings: ${totalFindings}\n`,
    )

    expect(totalFindings).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(HARD_LIMIT_MS)
  })
})
