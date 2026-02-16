import { describe, it, expect } from 'vitest'

import {
  MAX_FILE_SIZE_BYTES,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_COLLAPSED,
  DETAIL_PANEL_WIDTH,
  CONTENT_MAX_WIDTH,
} from '@/lib/constants'

describe('Constants', () => {
  it('should have MAX_FILE_SIZE_BYTES set to 15MB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(15_728_640)
  })

  it('should have correct layout dimensions', () => {
    expect(SIDEBAR_WIDTH).toBe(240)
    expect(SIDEBAR_WIDTH_COLLAPSED).toBe(48)
    expect(DETAIL_PANEL_WIDTH).toBe(400)
    expect(CONTENT_MAX_WIDTH).toBe(1400)
  })
})
