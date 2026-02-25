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

// Type: represents a parsed Xbench finding
type XbenchFinding = {
  sourceText: string
  targetText: string
  category: string
  severity: string
  fileName: string
  segmentNumber: number
}

// Type: represents a tool-generated finding
type ToolFinding = {
  sourceTextExcerpt: string | null
  targetTextExcerpt: string | null
  category: string
  severity: string
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
    const result = compareFindings(xbenchFindings, toolFindings, 'test-file-id')

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
    const result = compareFindings(xbenchFindings, toolFindings, 'test-file-id')

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
    const result1 = compareFindings(xbenchCritical, toolMajor, 'test-file-id')
    expect(result1.matched).toHaveLength(1)

    // critical → minor = +-2 → should NOT match
    const toolMinor = [buildToolFinding({ category: 'accuracy', severity: 'minor' })]
    const result2 = compareFindings(xbenchCritical, toolMinor, 'test-file-id')
    expect(result2.matched).toHaveLength(0)
    expect(result2.xbenchOnly).toHaveLength(1)
    expect(result2.toolOnly).toHaveLength(1)
  })

  it('[P1] should compare findings for specific fileId only not entire project', async () => {
    const targetFileId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
    const otherFileId = 'b2c3d4e5-f6a7-4b2c-8d3e-4f5a6b7c8d9e'

    const xbenchFindings = [buildXbenchFinding({ category: 'accuracy', severity: 'major' })]
    const toolFindings = [
      buildToolFinding({ category: 'accuracy', severity: 'major', fileId: targetFileId }),
      buildToolFinding({ category: 'completeness', severity: 'critical', fileId: otherFileId }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings, targetFileId)

    // Only the finding from targetFileId should be considered; otherFileId findings ignored
    expect(result.matched).toHaveLength(1)
    expect(result.toolOnly).toHaveLength(0)
  })

  // ── M5: Substring containment match ──

  it('[P1] should match when xbench source is substring of tool source (containment match)', async () => {
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
      }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings, 'test-file-id')

    // Substring containment: "brown fox" is in "The quick brown fox jumps over" → match
    expect(result.matched).toHaveLength(1)
    expect(result.xbenchOnly).toHaveLength(0)
    expect(result.toolOnly).toHaveLength(0)
  })

  it('[P1] should match when tool source is substring of xbench source (reverse containment)', async () => {
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
      }),
    ]

    const { compareFindings } = await import('./parityComparator')
    const result = compareFindings(xbenchFindings, toolFindings, 'test-file-id')

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
    const result = compareFindings(xbenchFindings, toolFindings, 'test-file-id')

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
    const result = compareFindings(xbenchFindings, toolFindings, 'test-file-id')

    expect(result.matched).toHaveLength(0)
    expect(result.xbenchOnly).toHaveLength(0)
    expect(result.toolOnly).toHaveLength(2)
  })
})
