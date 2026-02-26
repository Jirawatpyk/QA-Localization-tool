import { describe, expect, it } from 'vitest'

import { getLanguageInstructions, getSupportedLanguages } from '../language-instructions'

describe('getLanguageInstructions', () => {
  it('should return Thai instructions for "th"', () => {
    const result = getLanguageInstructions('th')

    expect(result).toContain('Thai Language-Specific Instructions')
    expect(result).toContain('Thai numeral')
    expect(result).toContain('politeness particles')
    expect(result).toContain('Buddhist calendar')
  })

  it('should return Simplified Chinese instructions for "zh-CN"', () => {
    const result = getLanguageInstructions('zh-CN')

    expect(result).toContain('Chinese (Simplified)')
    expect(result).toContain('fullwidth punctuation')
    expect(result).toContain('measure words')
  })

  it('should return Traditional Chinese instructions for "zh-TW"', () => {
    const result = getLanguageInstructions('zh-TW')

    expect(result).toContain('Chinese (Traditional)')
  })

  it('should return Japanese instructions for "ja"', () => {
    const result = getLanguageInstructions('ja')

    expect(result).toContain('Japanese')
    expect(result).toContain('カタカナ')
    expect(result).toContain('です/ます')
  })

  it('should return Korean instructions for "ko"', () => {
    const result = getLanguageInstructions('ko')

    expect(result).toContain('Korean')
    expect(result).toContain('존댓말')
  })

  it('should return German instructions for "de"', () => {
    const result = getLanguageInstructions('de')

    expect(result).toContain('German')
    expect(result).toContain('Sie')
  })

  it('should return French instructions for "fr"', () => {
    const result = getLanguageInstructions('fr')

    expect(result).toContain('French')
    expect(result).toContain('Non-breaking space')
  })

  it('should return Spanish instructions for "es"', () => {
    const result = getLanguageInstructions('es')

    expect(result).toContain('Spanish')
    expect(result).toContain('inverted punctuation')
  })

  it('should return Portuguese instructions for "pt"', () => {
    const result = getLanguageInstructions('pt')

    expect(result).toContain('Portuguese')
    expect(result).toContain('Brazilian')
  })

  it('should fall back to primary subtag for "th-TH"', () => {
    const result = getLanguageInstructions('th-TH')

    expect(result).toContain('Thai Language-Specific Instructions')
  })

  it('should return empty string for unsupported language', () => {
    expect(getLanguageInstructions('sv')).toBe('')
    expect(getLanguageInstructions('fi')).toBe('')
  })

  it('should return empty string for empty string', () => {
    expect(getLanguageInstructions('')).toBe('')
  })
})

describe('getSupportedLanguages', () => {
  it('should return array of supported language codes', () => {
    const langs = getSupportedLanguages()

    expect(langs).toContain('th')
    expect(langs).toContain('zh-CN')
    expect(langs).toContain('ja')
    expect(langs).toContain('ko')
    expect(langs).toContain('de')
    expect(langs).toContain('fr')
    expect(langs).toContain('es')
    expect(langs).toContain('pt')
    expect(langs.length).toBeGreaterThanOrEqual(8)
  })
})
