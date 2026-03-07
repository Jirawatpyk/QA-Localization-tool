import { describe, expect, it } from 'vitest'

import { deriveLanguagePair } from './deriveLanguagePair'

describe('deriveLanguagePair', () => {
  it('should return "source→target" from first segment row', () => {
    const rows = [{ sourceLang: 'en-US', targetLang: 'th' }]
    expect(deriveLanguagePair(rows)).toBe('en-US→th')
  })

  it('should use first row when multiple rows exist', () => {
    const rows = [
      { sourceLang: 'en', targetLang: 'ja' },
      { sourceLang: 'fr', targetLang: 'de' },
    ]
    expect(deriveLanguagePair(rows)).toBe('en→ja')
  })

  it('should return null for empty array', () => {
    expect(deriveLanguagePair([])).toBeNull()
  })

  it('should return null when sourceLang is empty string', () => {
    const rows = [{ sourceLang: '', targetLang: 'th' }]
    expect(deriveLanguagePair(rows)).toBeNull()
  })

  it('should return null when targetLang is empty string', () => {
    const rows = [{ sourceLang: 'en', targetLang: '' }]
    expect(deriveLanguagePair(rows)).toBeNull()
  })

  it('should return null when both langs are empty', () => {
    const rows = [{ sourceLang: '', targetLang: '' }]
    expect(deriveLanguagePair(rows)).toBeNull()
  })
})
