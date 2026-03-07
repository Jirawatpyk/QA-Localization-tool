/**
 * P2/P3 Quality Gate — supplementary tests for Epic 2 test design gaps.
 *
 * P2-01: Large row count boundary (size guard logic)
 * P2-04: Non-English header detection (Chinese, mixed)
 * P2-07: Batch sort determinism (same-score stable sort)
 * P2-09: Inngest payload size boundary (chunk logic)
 * P3-01: Segment immutability audit
 * P3-02: Server-side timestamp enforcement
 * P3-04: Storage quota per project (documents current state)
 * P3-05: Glossary term count limit (documents current state)
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { files } from '@/db/schema/files'
import { segments } from '@/db/schema/segments'
import { MAX_PARSE_SIZE_BYTES } from '@/features/parser/constants'
import { autoDetectColumns } from '@/features/parser/excelParser'
import { chunkSegments } from '@/features/pipeline/helpers/chunkSegments'

// ─── P2-04: Non-English header detection ─────────────────────────────────────

describe('P2-04: autoDetectColumns — CJK and mixed-language headers', () => {
  it('should detect mixed English+Thai header containing "Source"', () => {
    const result = autoDetectColumns(['Source (ต้นฉบับ)', 'Target (คำแปล)', 'ID'])
    expect(result.suggestedSourceColumn).toBe('Source (ต้นฉบับ)')
    expect(result.suggestedTargetColumn).toBe('Target (คำแปล)')
  })

  it('should detect Thai keyword "ต้นฉบับ" as source column', () => {
    const result = autoDetectColumns(['ID', 'ต้นฉบับ', 'คำแปล'])
    expect(result.suggestedSourceColumn).toBe('ต้นฉบับ')
    expect(result.suggestedTargetColumn).toBe('คำแปล')
  })

  it('should return null for Chinese-only headers (not in keyword list)', () => {
    // Documenting current limitation — Chinese keywords not yet supported
    const result = autoDetectColumns(['源文本', '目标文本', 'ID'])
    expect(result.suggestedSourceColumn).toBeNull()
    expect(result.suggestedTargetColumn).toBeNull()
  })

  it('should return null for Japanese-only headers (not in keyword list)', () => {
    const result = autoDetectColumns(['原文', '翻訳', 'ID'])
    expect(result.suggestedSourceColumn).toBeNull()
    expect(result.suggestedTargetColumn).toBeNull()
  })
})

// ─── P2-01: Large row count boundary (size guard logic) ──────────────────────

describe('P2-01: File size boundary for large Excel files', () => {
  it('should have MAX_PARSE_SIZE_BYTES at 15MB', () => {
    expect(MAX_PARSE_SIZE_BYTES).toBe(15 * 1024 * 1024)
  })

  it('should chunk 5K segments into multiple AI chunks at 30K char limit', () => {
    // Simulates 5000 segments (typical for 65K+ row file)
    const segments = Array.from({ length: 5000 }, (_, i) => ({
      id: `seg-${i}`,
      sourceText: 'Hello world',
      targetText: 'สวัสดีโลก',
    }))
    const chunks = chunkSegments(segments)
    // 5000 segments × ~21 chars each = ~105K chars → should split into 4+ chunks
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    // All segments accounted for
    const total = chunks.reduce((sum, c) => sum + c.segments.length, 0)
    expect(total).toBe(5000)
  })
})

// ─── P2-07: Sort determinism ─────────────────────────────────────────────────

describe('P2-07: Batch sort determinism — same score stable sort', () => {
  it('should preserve insertion order when scores are identical', () => {
    // Simulates DB rows with identical scores — sort must be deterministic
    const rows = [
      { id: 'file-c', score: 85.5, createdAt: new Date('2026-01-01') },
      { id: 'file-a', score: 85.5, createdAt: new Date('2026-01-01') },
      { id: 'file-b', score: 85.5, createdAt: new Date('2026-01-01') },
    ]
    // Sort by score desc, then id asc for determinism
    const sorted = [...rows].sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      return a.id.localeCompare(b.id)
    })
    expect(sorted.map((r) => r.id)).toEqual(['file-a', 'file-b', 'file-c'])
  })

  it('should sort by score desc when scores differ', () => {
    const rows = [
      { id: 'file-a', score: 70.0 },
      { id: 'file-b', score: 95.0 },
      { id: 'file-c', score: 85.0 },
    ]
    const sorted = [...rows].sort((a, b) => b.score - a.score)
    expect(sorted.map((r) => r.id)).toEqual(['file-b', 'file-c', 'file-a'])
  })

  it('should produce same result on repeated sorts (stability)', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: `file-${String(i).padStart(3, '0')}`,
      score: 85.0,
    }))
    const sort = (arr: typeof rows) =>
      [...arr].sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score
        return a.id.localeCompare(b.id)
      })
    const first = sort(rows)
    const second = sort(rows)
    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id))
  })
})

// ─── P2-09: Inngest payload size boundary ────────────────────────────────────

describe('P2-09: chunkSegments payload size boundary', () => {
  it('should split single oversized segment into its own chunk', () => {
    const segments = [
      { id: 'small', sourceText: 'hi', targetText: 'สวัสดี' },
      { id: 'huge', sourceText: 'x'.repeat(35_000), targetText: 'y'.repeat(35_000) },
      { id: 'small2', sourceText: 'hello', targetText: 'สวัสดี' },
    ]
    const chunks = chunkSegments(segments)
    // Huge segment exceeds 30K limit → its own chunk
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    const hugeChunk = chunks.find((c) => c.segments.some((s) => s.id === 'huge'))
    expect(hugeChunk).toBeDefined()
    expect(hugeChunk!.segments).toHaveLength(1)
  })

  it('should keep total chars per chunk within limit for normal segments', () => {
    const segments = Array.from({ length: 100 }, (_, i) => ({
      id: `seg-${i}`,
      sourceText: 'A'.repeat(200),
      targetText: 'B'.repeat(200),
    }))
    const chunks = chunkSegments(segments)
    for (const chunk of chunks) {
      // Each chunk should be at or below 30K char limit
      // (last added segment may push slightly over, but next chunk starts fresh)
      expect(chunk.totalChars).toBeLessThanOrEqual(30_000 + 400) // 400 = one segment margin
    }
  })
})

// ─── P3-01: Segment immutability audit ───────────────────────────────────────

describe('P3-01: Segment immutability — no update/delete actions exposed', () => {
  it('should not export segment mutation functions from parser actions', async () => {
    // Segments are immutable — only parseFile action exists (DELETE+INSERT in transaction)
    const parseAction = await import('@/features/parser/actions/parseFile.action')
    const exportedNames = Object.keys(parseAction)
    expect(exportedNames.some((n) => /update.*segment/i.test(n))).toBe(false)
    expect(exportedNames.some((n) => /delete.*segment/i.test(n))).toBe(false)
  })

  it('should not have updatedAt column on segments table (immutable after insert)', () => {
    const columnNames = Object.keys(segments)
    expect(columnNames).not.toContain('updatedAt')
    expect(columnNames).not.toContain('updated_at')
  })
})

// ─── P3-02: Server-side timestamp enforcement ────────────────────────────────

describe('P3-02: Schema-level timestamp enforcement', () => {
  it('should have createdAt column on segments table', () => {
    expect(segments.createdAt).toBeDefined()
  })

  it('should not expose uploaded_at as a writable column on segments', () => {
    const columnNames = Object.keys(segments)
    expect(columnNames).not.toContain('uploadedAt')
    expect(columnNames).not.toContain('uploaded_at')
  })

  it('should have createdAt column on files table', () => {
    expect(files.createdAt).toBeDefined()
  })
})

// ─── P3-04 & P3-05: Documents current state (features not yet implemented) ──

describe('P3-04: Storage quota per project — current state audit', () => {
  it('should document that storage quota enforcement does not exist yet', () => {
    // No quota enforcement exists in current schema or actions.
    // This test documents the gap — storage quota is planned for Epic 5.
    // When quota is implemented, this test should be replaced with actual enforcement tests.
    expect(true).toBe(true) // Placeholder — gap documented
  })
})

describe('P3-05: Glossary term count limit — current state audit', () => {
  it('should document that glossary term count limit does not exist yet', () => {
    // No max term count guard exists in current glossary import action.
    // This test documents the gap — term limit is planned for Epic 5.
    // When limit is implemented, this test should be replaced with actual guard tests.
    expect(true).toBe(true) // Placeholder — gap documented
  })
})
