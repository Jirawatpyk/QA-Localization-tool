/**
 * P2-01 (R3-008): Cross-layer deduplication tests
 * L2 + L3 same segment same category → dedup behavior
 */
import { describe, it, expect } from 'vitest'

// ── Types ──

type LayerFinding = {
  segmentId: string
  category: string
  severity: string
  description: string
  detectedByLayer: 'L1' | 'L2' | 'L3'
  confidence: number
}

type DedupResult = {
  findings: LayerFinding[]
  boosted: string[]
  disagreements: string[]
}

/**
 * Cross-layer deduplication logic (concept test).
 *
 * Production implementation will live in the pipeline orchestrator.
 * This test validates the expected dedup contract:
 * - Same segment + same category across L2/L3 → L3 boosts L2, one finding
 * - Different category → both kept
 * - L3 disagrees (no finding for an L2 flagged segment) → marker
 */
function crossLayerDedup(l2Findings: LayerFinding[], l3Findings: LayerFinding[]): DedupResult {
  const merged: LayerFinding[] = []
  const boosted: string[] = []
  const disagreements: string[] = []

  // Index L3 findings by segmentId+category
  const l3Index = new Map<string, LayerFinding>()
  const l3SegmentIds = new Set<string>()
  for (const f of l3Findings) {
    l3Index.set(`${f.segmentId}::${f.category}`, f)
    l3SegmentIds.add(f.segmentId)
  }

  for (const l2 of l2Findings) {
    const key = `${l2.segmentId}::${l2.category}`
    const matching = l3Index.get(key)

    if (matching) {
      // Same segment + same category → boost L2 confidence, keep L2 (not both)
      const boostedConfidence = Math.min(100, Math.round((l2.confidence + matching.confidence) / 2))
      merged.push({ ...l2, confidence: boostedConfidence })
      boosted.push(l2.segmentId)
      l3Index.delete(key) // consumed
    } else if (l3SegmentIds.has(l2.segmentId) && !l3Index.has(key)) {
      // L3 analyzed same segment but didn't find this category → L3 disagrees
      merged.push({ ...l2 })
      disagreements.push(l2.segmentId)
    } else {
      merged.push(l2)
    }
  }

  // Add remaining L3 findings (standalone, no L2 overlap)
  for (const [, l3] of l3Index) {
    merged.push(l3)
  }

  return { findings: merged, boosted, disagreements }
}

// ── Constants ──

const SEG_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const SEG_ID_2 = 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e'

describe('crossLayerDedup (P2-01)', () => {
  it('[P2] should merge L2+L3 same segmentId + same category into 1 finding with boosted confidence', () => {
    const l2: LayerFinding[] = [
      {
        segmentId: SEG_ID,
        category: 'accuracy',
        severity: 'major',
        description: 'L2 detected mistranslation',
        detectedByLayer: 'L2',
        confidence: 75,
      },
    ]
    const l3: LayerFinding[] = [
      {
        segmentId: SEG_ID,
        category: 'accuracy',
        severity: 'major',
        description: 'L3 confirmed mistranslation',
        detectedByLayer: 'L3',
        confidence: 95,
      },
    ]

    const result = crossLayerDedup(l2, l3)

    expect(result.findings).toHaveLength(1)
    expect(result.boosted).toContain(SEG_ID)
    // Confidence should be boosted (average: (75+95)/2 = 85)
    expect(result.findings[0]!.confidence).toBe(85)
  })

  it('[P2] should keep both findings when L2 and L3 have different categories on same segment', () => {
    const l2: LayerFinding[] = [
      {
        segmentId: SEG_ID,
        category: 'accuracy',
        severity: 'major',
        description: 'L2: accuracy issue',
        detectedByLayer: 'L2',
        confidence: 80,
      },
    ]
    const l3: LayerFinding[] = [
      {
        segmentId: SEG_ID,
        category: 'fluency',
        severity: 'minor',
        description: 'L3: fluency issue',
        detectedByLayer: 'L3',
        confidence: 70,
      },
    ]

    const result = crossLayerDedup(l2, l3)

    expect(result.findings).toHaveLength(2)
    expect(result.findings.map((f) => f.category)).toEqual(
      expect.arrayContaining(['accuracy', 'fluency']),
    )
  })

  it('[P2] should mark L2 finding when L3 contradicts (no issue found for that segment+category)', () => {
    const l2: LayerFinding[] = [
      {
        segmentId: SEG_ID,
        category: 'accuracy',
        severity: 'major',
        description: 'L2 found issue',
        detectedByLayer: 'L2',
        confidence: 60,
      },
    ]
    // L3 analyzed same segment but found a DIFFERENT category (not accuracy)
    const l3: LayerFinding[] = [
      {
        segmentId: SEG_ID,
        category: 'style',
        severity: 'minor',
        description: 'L3 found style issue only',
        detectedByLayer: 'L3',
        confidence: 80,
      },
    ]

    const result = crossLayerDedup(l2, l3)

    // L2 finding kept but marked as disagreement
    expect(result.disagreements).toContain(SEG_ID)
    expect(result.findings).toHaveLength(2) // both kept since different categories
  })

  it('[P2] should pass through L3 findings standalone when no L2 findings exist', () => {
    const l2: LayerFinding[] = []
    const l3: LayerFinding[] = [
      {
        segmentId: SEG_ID,
        category: 'cultural',
        severity: 'minor',
        description: 'L3 standalone finding',
        detectedByLayer: 'L3',
        confidence: 72,
      },
      {
        segmentId: SEG_ID_2,
        category: 'register',
        severity: 'minor',
        description: 'L3 register issue',
        detectedByLayer: 'L3',
        confidence: 65,
      },
    ]

    const result = crossLayerDedup(l2, l3)

    expect(result.findings).toHaveLength(2)
    expect(result.boosted).toHaveLength(0)
    expect(result.disagreements).toHaveLength(0)
  })
})
