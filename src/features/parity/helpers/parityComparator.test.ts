/// <reference types="vitest/globals" />
import { faker } from '@faker-js/faker'

// parityComparator: Compares Xbench findings with tool findings for Xbench parity analysis.
// Matches findings by category + segment with severity tolerance.

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Mock xbenchCategoryMapper with identity function to isolate comparator logic
vi.mock('@/features/parity/helpers/xbenchCategoryMapper', () => ({
  mapXbenchToToolCategory: vi.fn((category: string) => category.toLowerCase().trim()),
}))

import type { ParitySeverity } from '@/features/parity/types'

type XbenchFinding = {
  sourceText: string
  targetText: string
  category: string
  severity: ParitySeverity
  fileName: string
  segmentNumber: number
}

type ToolFinding = {
  sourceTextExcerpt: string | null
  targetTextExcerpt: string | null
  category: string
  severity: ParitySeverity
  fileId: string | null
  segmentId: string | null
}

// Helper: build an Xbench finding for parity testing
function buildXbenchFinding(overrides?: Partial<XbenchFinding>): XbenchFinding {
  return {
    sourceText: 'The quick brown fox',
    targetText: 'สุนัขจิ้งจอกสีน้ำตาล',
    category: 'accuracy',
    severity: 'major',
    fileName: 'test.sdlxliff',
    segmentNumber: 1,
    ...overrides,
  }
}

// Helper: build a tool finding for parity testing
function buildToolFinding(overrides?: Partial<ToolFinding>): ToolFinding {
  return {
    sourceTextExcerpt: 'The quick brown fox',
    targetTextExcerpt: 'สุนัขจิ้งจอกสีน้ำตาล',
    category: 'accuracy',
    severity: 'major',
    fileId: 'test-file-id',
    segmentId: faker.string.uuid(),
    ...overrides,
  }
}

describe('parityComparator', () => {
  // ── P0: Core matching ──

  it('[P0] should match findings by same category and segment with plus-or-minus 1 severity tolerance', async () => {
    // Xbench says "major", tool says "minor" — within +-1 tolerance → matched
    const xbenchFindings = [
      buildXbenchFinding({ category: 'accuracy', severity: 'major', segmentNumber: 5 }),
    ]
    const toolFindings = [buildToolFinding({ category: 'accuracy', severity: 'minor' })]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    // Should have 1 matched finding (within +-1 severity tolerance)
    expect(result.matched).toHaveLength(1)
    expect(result.xbenchOnly).toHaveLength(0)
    expect(result.toolOnly).toHaveLength(0)
  })

  it('[P0] should NFKC normalize and trim source text before matching', async () => {
    // Xbench uses fullwidth characters, tool uses normal — should still match after NFKC
    const xbenchFindings = [
      buildXbenchFinding({
        sourceText: '\uFF21pple', // fullwidth A
        category: 'terminology',
        severity: 'major',
      }),
    ]
    const toolFindings = [
      buildToolFinding({
        sourceTextExcerpt: 'Apple', // normal A
        category: 'terminology',
        severity: 'major',
      }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    expect(result.matched).toHaveLength(1)
  })

  // ── P1: Severity tolerance rules ──

  it('[P1] should accept critical-major as plus-or-minus 1 but reject critical-minor as plus-or-minus 2', async () => {
    // critical → major = +-1 → should match
    const xbenchCritical = [
      buildXbenchFinding({ category: 'accuracy', severity: 'critical', segmentNumber: 1 }),
    ]
    const toolMajor = [buildToolFinding({ category: 'accuracy', severity: 'major' })]

    const { compareFindings } = await import('./parityComparator')
    const result1 = compareFindings(xbenchCritical, toolMajor)
    expect(result1.matched).toHaveLength(1)

    // critical → minor = +-2 → should NOT match
    const toolMinor = [buildToolFinding({ category: 'accuracy', severity: 'minor' })]
    const result2 = compareFindings(xbenchCritical, toolMinor)
    expect(result2.matched).toHaveLength(0)
    expect(result2.xbenchOnly).toHaveLength(1)
    expect(result2.toolOnly).toHaveLength(1)
  })

  it('[P1] should accept minor-trivial as plus-or-minus 1 but reject major-trivial as plus-or-minus 2', async () => {
    // minor → trivial = +-1 → should match
    const xbenchMinor = [
      buildXbenchFinding({ category: 'accuracy', severity: 'minor', segmentNumber: 1 }),
    ]
    const toolTrivial = [buildToolFinding({ category: 'accuracy', severity: 'trivial' })]

    const { compareFindings } = await import('./parityComparator')
    const result1 = compareFindings(xbenchMinor, toolTrivial)
    expect(result1.matched).toHaveLength(1)

    // major → trivial = +-2 → should NOT match
    const xbenchMajor = [
      buildXbenchFinding({ category: 'accuracy', severity: 'major', segmentNumber: 1 }),
    ]
    const result2 = compareFindings(xbenchMajor, toolTrivial)
    expect(result2.matched).toHaveLength(0)
    expect(result2.xbenchOnly).toHaveLength(1)
    expect(result2.toolOnly).toHaveLength(1)
  })

  // ── M5: Substring containment match ──

  it('[P1] should match when xbench source is substring of tool source (containment match)', async () => {
    // M7: Use consistent fileId between toolFinding and compareFindings call
    const testFileId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
    const xbenchFindings = [
      buildXbenchFinding({
        sourceText: 'brown fox',
        category: 'accuracy',
        severity: 'major',
      }),
    ]
    const toolFindings = [
      buildToolFinding({
        sourceTextExcerpt: 'The quick brown fox jumps over',
        category: 'accuracy',
        severity: 'major',
        fileId: testFileId,
      }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    // Substring containment: "brown fox" is in "The quick brown fox jumps over" → match
    expect(result.matched).toHaveLength(1)
    expect(result.xbenchOnly).toHaveLength(0)
    expect(result.toolOnly).toHaveLength(0)
  })

  it('[P1] should match when tool source is substring of xbench source (reverse containment)', async () => {
    const testFileId = 'b2c3d4e5-f6a7-4b2c-8d3e-4f5a6b7c8d9e'
    const xbenchFindings = [
      buildXbenchFinding({
        sourceText: 'The quick brown fox jumps over the lazy dog',
        category: 'terminology',
        severity: 'minor',
      }),
    ]
    const toolFindings = [
      buildToolFinding({
        sourceTextExcerpt: 'brown fox jumps',
        category: 'terminology',
        severity: 'minor',
        fileId: testFileId,
      }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    expect(result.matched).toHaveLength(1)
  })

  // ── P2: Edge cases ──

  it('[P2] should return all as Xbench Only when tool findings empty', async () => {
    const xbenchFindings = [
      buildXbenchFinding({ category: 'accuracy', severity: 'major' }),
      buildXbenchFinding({ category: 'completeness', severity: 'critical' }),
    ]
    const toolFindings: ToolFinding[] = []

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    expect(result.matched).toHaveLength(0)
    expect(result.xbenchOnly).toHaveLength(2)
    expect(result.toolOnly).toHaveLength(0)
  })

  it('[P2] should return all as Tool Only when xbench findings empty', async () => {
    const xbenchFindings: XbenchFinding[] = []
    const toolFindings = [
      buildToolFinding({ category: 'accuracy', severity: 'major' }),
      buildToolFinding({ category: 'completeness', severity: 'minor' }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    expect(result.matched).toHaveLength(0)
    expect(result.xbenchOnly).toHaveLength(0)
    expect(result.toolOnly).toHaveLength(2)
  })

  // TA: Coverage Gap Tests — Story 2.7

  it('[P1] should match Thai text correctly after NFKC normalization (U2)', async () => {
    // U2: Thai text "สวัสดี" in both source fields should match exactly
    const testFileId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
    const xbenchFindings = [
      buildXbenchFinding({
        sourceText: 'สวัสดี',
        category: 'accuracy',
        severity: 'major',
      }),
    ]
    const toolFindings = [
      buildToolFinding({
        sourceTextExcerpt: 'สวัสดี',
        category: 'accuracy',
        severity: 'major',
        fileId: testFileId,
      }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    expect(result.matched).toHaveLength(1)
    expect(result.xbenchOnly).toHaveLength(0)
    expect(result.toolOnly).toHaveLength(0)
  })

  it('[P2] should NOT match when same category and severity but different source text (U6)', async () => {
    // U6: Same category + same severity but different segment (source text) → should NOT match
    const testFileId = 'b2c3d4e5-f6a7-4b2c-8d3e-4f5a6b7c8d9e'
    const xbenchFindings = [
      buildXbenchFinding({
        sourceText: 'First segment source text',
        category: 'accuracy',
        severity: 'major',
        segmentNumber: 1,
      }),
    ]
    const toolFindings = [
      buildToolFinding({
        sourceTextExcerpt: 'Completely different source text',
        category: 'accuracy',
        severity: 'major',
        fileId: testFileId,
      }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    // Different source text → no match
    expect(result.matched).toHaveLength(0)
    expect(result.xbenchOnly).toHaveLength(1)
    expect(result.toolOnly).toHaveLength(1)
  })

  it('[P2] should pick only first match for each xbench finding and not double-count (U11)', async () => {
    // U11: One Xbench finding matches multiple tool findings — only first match used
    const testFileId = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f'
    const xbenchFindings = [
      buildXbenchFinding({
        sourceText: 'Duplicate text source',
        category: 'accuracy',
        severity: 'major',
      }),
    ]
    const toolFindings = [
      buildToolFinding({
        sourceTextExcerpt: 'Duplicate text source',
        category: 'accuracy',
        severity: 'major',
        fileId: testFileId,
      }),
      buildToolFinding({
        sourceTextExcerpt: 'Duplicate text source',
        category: 'accuracy',
        severity: 'major',
        fileId: testFileId,
      }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    // 1 xbench matches 1 tool finding (first), second tool finding is unmatched
    expect(result.matched).toHaveLength(1)
    expect(result.xbenchOnly).toHaveLength(0)
    expect(result.toolOnly).toHaveLength(1)
  })

  it('[P1] should handle tool finding with null sourceTextExcerpt safely (U12)', async () => {
    // U12: Tool finding has sourceTextExcerpt: null — should not crash, should not match
    const testFileId = 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f7a'
    const xbenchFindings = [
      buildXbenchFinding({
        sourceText: 'Some source text here',
        category: 'terminology',
        severity: 'minor',
      }),
    ]
    const toolFindings = [
      buildToolFinding({
        sourceTextExcerpt: null,
        category: 'terminology',
        severity: 'minor',
        fileId: testFileId,
      }),
    ]

    const { compareFindings } = await import('./parityComparator')
    // Should not throw
    const result = compareFindings(xbenchFindings, toolFindings)

    // null excerpt → normalize('') → empty string, "some source text" doesn't match "" → no match
    expect(result.matched).toHaveLength(0)
    expect(result.xbenchOnly).toHaveLength(1)
    expect(result.toolOnly).toHaveLength(1)
  })

  // TA: Coverage Gap Tests — Stories 2.7 & 3.5 (Advanced Elicitation: FP+CM+RE+SC)

  it('[P2] should match when both source texts are empty — documents empty collision behavior (G16)', async () => {
    // G16: normalize('') and normalize(null) both yield '' → ''.includes('') = true
    const testFileId = 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b'
    const xbenchFindings = [
      buildXbenchFinding({ sourceText: '', category: 'accuracy', severity: 'major' }),
    ]
    const toolFindings = [
      buildToolFinding({
        sourceTextExcerpt: null,
        category: 'accuracy',
        severity: 'major',
        fileId: testFileId,
      }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    // Empty-source findings DO match same-category (behavioral doc)
    expect(result.matched).toHaveLength(1)
  })

  it('[P2] should reject critical-to-trivial severity pair with gap of 3 (G17)', async () => {
    // G17: critical(3) ↔ trivial(0) = distance 3, exceeds ±1 tolerance
    const testFileId = 'f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c'
    const xbenchFindings = [buildXbenchFinding({ category: 'accuracy', severity: 'critical' })]
    const toolFindings = [
      buildToolFinding({ category: 'accuracy', severity: 'trivial', fileId: testFileId }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    expect(result.matched).toHaveLength(0)
    expect(result.xbenchOnly).toHaveLength(1)
    expect(result.toolOnly).toHaveLength(1)
  })

  it('[P2] should match tool category with trailing whitespace after trim fix (G21)', async () => {
    // P-3 fix: both sides now .toLowerCase().trim() — trailing whitespace no longer prevents match
    const testFileId = 'a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c0d'
    const xbenchFindings = [
      buildXbenchFinding({ sourceText: 'Test text', category: 'accuracy', severity: 'major' }),
    ]
    const toolFindings = [
      buildToolFinding({
        sourceTextExcerpt: 'Test text',
        category: 'accuracy ',
        severity: 'major',
        fileId: testFileId,
      }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    expect(result.matched).toHaveLength(1)
    expect(result.xbenchOnly).toHaveLength(0)
    expect(result.toolOnly).toHaveLength(0)
  })

  it('[P2] should leave second Xbench finding unmatched when tool pool consumed by first (G22)', async () => {
    // G22: 1-to-1 consumed matching — first Xbench eats the only tool match
    const testFileId = 'b8c9d0e1-f2a3-4b4c-8d5e-6f7a8b9c0d1e'
    const xbenchFindings = [
      buildXbenchFinding({
        sourceText: 'Shared source',
        category: 'accuracy',
        severity: 'major',
        segmentNumber: 1,
      }),
      buildXbenchFinding({
        sourceText: 'Shared source',
        category: 'accuracy',
        severity: 'major',
        segmentNumber: 1,
      }),
    ]
    const toolFindings = [
      buildToolFinding({
        sourceTextExcerpt: 'Shared source',
        category: 'accuracy',
        severity: 'major',
        fileId: testFileId,
      }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings)

    expect(result.matched).toHaveLength(1)
    expect(result.xbenchOnly).toHaveLength(1)
    expect(result.toolOnly).toHaveLength(0)
  })
})
