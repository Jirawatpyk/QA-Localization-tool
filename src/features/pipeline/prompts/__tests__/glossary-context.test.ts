import { describe, expect, it } from 'vitest'

import { formatGlossaryContext } from '../glossary-context'
import type { GlossaryTermContext } from '../types'

describe('formatGlossaryContext', () => {
  it('should return empty string when no terms provided', () => {
    expect(formatGlossaryContext([])).toBe('')
  })

  it('should format single term correctly', () => {
    const terms: GlossaryTermContext[] = [
      { sourceTerm: 'Save', targetTerm: 'บันทึก', caseSensitive: false },
    ]

    const result = formatGlossaryContext(terms)

    expect(result).toContain('## Approved Terminology (1 terms)')
    expect(result).toContain('"Save" → "บันทึก"')
    expect(result).not.toContain('[case-sensitive]')
  })

  it('should mark case-sensitive terms', () => {
    const terms: GlossaryTermContext[] = [
      { sourceTerm: 'API', targetTerm: 'API', caseSensitive: true },
    ]

    const result = formatGlossaryContext(terms)

    expect(result).toContain('"API" → "API" [case-sensitive]')
  })

  it('should format multiple terms with correct count', () => {
    const terms: GlossaryTermContext[] = [
      { sourceTerm: 'Save', targetTerm: 'บันทึก', caseSensitive: false },
      { sourceTerm: 'Delete', targetTerm: 'ลบ', caseSensitive: false },
      { sourceTerm: 'UI', targetTerm: 'UI', caseSensitive: true },
    ]

    const result = formatGlossaryContext(terms)

    expect(result).toContain('(3 terms)')
    expect(result).toContain('"Save" → "บันทึก"')
    expect(result).toContain('"Delete" → "ลบ"')
    expect(result).toContain('"UI" → "UI" [case-sensitive]')
  })

  it('should include instruction to flag mistranslated terms', () => {
    const terms: GlossaryTermContext[] = [
      { sourceTerm: 'Save', targetTerm: 'บันทึก', caseSensitive: false },
    ]

    const result = formatGlossaryContext(terms)

    expect(result).toContain('Flag any segment where these terms are mistranslated')
    expect(result).toContain('do NOT flag it as an error')
  })
})
