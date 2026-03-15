/**
 * Story 4.3 ATDD: Types & constants tests
 * Tests: DETECTED_BY_LAYERS, SCORE_IMPACT_MAP
 */
import { describe, it, expect } from 'vitest'

import { SCORE_IMPACT_MAP } from '@/features/review/utils/state-transitions'
import { DETECTED_BY_LAYERS } from '@/types/finding'

describe('finding types & constants', () => {
  it('[P0] U-DL1: DETECTED_BY_LAYERS should include Manual', () => {
    expect(DETECTED_BY_LAYERS).toContain('Manual')
  })

  it('[P0] U-CB1: SCORE_IMPACT_MAP noted → countsPenalty false', () => {
    expect(SCORE_IMPACT_MAP.noted.countsPenalty).toBe(false)
  })

  it('[P0] U-CB2: SCORE_IMPACT_MAP source_issue → countsPenalty false', () => {
    expect(SCORE_IMPACT_MAP.source_issue.countsPenalty).toBe(false)
  })

  it('[P0] U-CB3: SCORE_IMPACT_MAP manual → countsPenalty true', () => {
    expect(SCORE_IMPACT_MAP.manual.countsPenalty).toBe(true)
  })
})
