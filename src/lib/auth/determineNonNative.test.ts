/// <reference types="vitest/globals" />

vi.mock('server-only', () => ({}))

import { determineNonNative } from './determineNonNative'

describe('determineNonNative', () => {
  it('should return true (non-native) when nativeLanguages is empty', () => {
    expect(determineNonNative([], 'th-TH')).toBe(true)
    expect(determineNonNative([], 'en-US')).toBe(true)
  })

  it('should return false (native) when user has matching primary subtag', () => {
    expect(determineNonNative(['th'], 'th-TH')).toBe(false)
    expect(determineNonNative(['en-US'], 'en-GB')).toBe(false)
    expect(determineNonNative(['ja'], 'ja-JP')).toBe(false)
  })

  it('should return true (non-native) when no matching language', () => {
    expect(determineNonNative(['th'], 'en-US')).toBe(true)
    expect(determineNonNative(['en-US'], 'th-TH')).toBe(true)
    expect(determineNonNative(['ja', 'ko'], 'th-TH')).toBe(true)
  })

  it('should match with multiple native languages', () => {
    expect(determineNonNative(['en', 'th'], 'th-TH')).toBe(false)
    expect(determineNonNative(['ja', 'en-US'], 'en-GB')).toBe(false)
  })

  it('should be case-insensitive on primary subtag', () => {
    expect(determineNonNative(['TH'], 'th-TH')).toBe(false)
    expect(determineNonNative(['th-TH'], 'TH')).toBe(false)
  })

  // Chinese script subtag — Guardrail #66/D4
  describe('Chinese script subtag handling', () => {
    it('should distinguish zh-Hans from zh-Hant', () => {
      expect(determineNonNative(['zh-Hans'], 'zh-Hant')).toBe(true)
      expect(determineNonNative(['zh-Hant'], 'zh-Hans')).toBe(true)
    })

    it('should match when both are same script', () => {
      expect(determineNonNative(['zh-Hans'], 'zh-Hans-CN')).toBe(false)
      expect(determineNonNative(['zh-Hant-TW'], 'zh-Hant')).toBe(false)
    })

    it('should match permissively when script subtag is missing', () => {
      // zh without script matches any zh
      expect(determineNonNative(['zh'], 'zh-Hans')).toBe(false)
      expect(determineNonNative(['zh'], 'zh-Hant')).toBe(false)
      expect(determineNonNative(['zh-Hans'], 'zh')).toBe(false)
    })
  })
})
