import { describe, expect, it } from 'vitest'

import {
  bcp47LanguageArraySchema,
  bcp47LanguageSchema,
  canonicalizeBcp47,
  canonicalizeLanguages,
  displayBcp47,
  languageSetsEqual,
  normalizeBcp47,
} from './bcp47'

describe('canonicalizeBcp47', () => {
  it('lowercases the full tag', () => {
    expect(canonicalizeBcp47('TH-TH')).toBe('th-th')
    expect(canonicalizeBcp47('zh-Hant-CN')).toBe('zh-hant-cn')
    expect(canonicalizeBcp47('en-US')).toBe('en-us')
  })

  it('trims whitespace', () => {
    expect(canonicalizeBcp47('  en-US  ')).toBe('en-us')
    expect(canonicalizeBcp47('\tth\n')).toBe('th')
  })

  it('is idempotent', () => {
    const input = 'zh-hant-tw'
    expect(canonicalizeBcp47(canonicalizeBcp47(input))).toBe(input)
  })

  it('returns empty string for null', () => {
    // TypeScript rejects this at compile time, but runtime callers (JSONB
    // reads, XLIFF parsers) can violate the type contract.
    expect(canonicalizeBcp47(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(canonicalizeBcp47(undefined)).toBe('')
  })

  it('returns empty string for non-string (defensive)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canonicalizeBcp47(123 as any)).toBe('')
  })

  it('preserves the single-tag shape without modification', () => {
    expect(canonicalizeBcp47('th')).toBe('th')
    expect(canonicalizeBcp47('yue')).toBe('yue')
  })
})

describe('normalizeBcp47 (deprecated alias)', () => {
  it('is an alias for canonicalizeBcp47', () => {
    expect(normalizeBcp47).toBe(canonicalizeBcp47)
  })

  it('still works for backwards compat', () => {
    expect(normalizeBcp47('TH-TH')).toBe('th-th')
  })
})

describe('canonicalizeLanguages', () => {
  it('returns empty array for empty input', () => {
    expect(canonicalizeLanguages([])).toEqual([])
  })

  it('returns single-item canonical array', () => {
    expect(canonicalizeLanguages(['th'])).toEqual(['th'])
    expect(canonicalizeLanguages(['TH-TH'])).toEqual(['th-th'])
  })

  it('lowercases + dedupes + sorts', () => {
    expect(canonicalizeLanguages(['TH-TH', 'ja-JP', 'en-US'])).toEqual(['en-us', 'ja-jp', 'th-th'])
  })

  it('collapses case-insensitive duplicates', () => {
    expect(canonicalizeLanguages(['th-TH', 'th-th', 'TH-TH'])).toEqual(['th-th'])
  })

  it('strips null/undefined entries defensively', () => {
    // Runtime type violations from JSONB reads.
    const input = ['th', null, 'ja', undefined] as (string | null | undefined)[]
    expect(canonicalizeLanguages(input)).toEqual(['ja', 'th'])
  })

  it('strips empty-string entries (canonicalizeBcp47 maps null → "")', () => {
    expect(canonicalizeLanguages(['th', '', 'ja'])).toEqual(['ja', 'th'])
  })

  it('is idempotent', () => {
    const once = canonicalizeLanguages(['TH-TH', 'ja-JP'])
    expect(canonicalizeLanguages(once)).toEqual(once)
  })
})

describe('languageSetsEqual', () => {
  it('returns true for identical canonical arrays', () => {
    expect(languageSetsEqual(['th', 'ja'], ['th', 'ja'])).toBe(true)
  })

  it('returns true ignoring order', () => {
    expect(languageSetsEqual(['th', 'ja'], ['ja', 'th'])).toBe(true)
  })

  it('returns true ignoring case', () => {
    expect(languageSetsEqual(['TH-TH', 'ja-JP'], ['th-th', 'JA-JP'])).toBe(true)
  })

  it('returns false for length mismatch', () => {
    expect(languageSetsEqual(['th'], ['th', 'ja'])).toBe(false)
  })

  it('returns false for different sets', () => {
    expect(languageSetsEqual(['th', 'ja'], ['th', 'ko'])).toBe(false)
  })

  it('returns false for input with internal duplicates (not a proper set)', () => {
    // Documents the "set semantics" contract — callers must canonicalize first.
    expect(languageSetsEqual(['th', 'th'], ['th', 'th'])).toBe(false)
  })

  it('returns true for two empty arrays', () => {
    expect(languageSetsEqual([], [])).toBe(true)
  })
})

describe('bcp47LanguageSchema', () => {
  it.each([['th'], ['en'], ['th-TH'], ['zh-Hant-CN'], ['es-419'], ['yue']])(
    'accepts valid tag %s',
    (tag) => {
      const result = bcp47LanguageSchema.safeParse(tag)
      expect(result.success).toBe(true)
    },
  )

  it('transforms to canonical lowercase form', () => {
    const result = bcp47LanguageSchema.safeParse('zh-Hant-CN')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('zh-hant-cn')
    }
  })

  it.each([[''], ['x'], ['1234'], ['th-'], ['-th'], ['th--TH']])(
    'rejects invalid tag %s',
    (tag) => {
      const result = bcp47LanguageSchema.safeParse(tag)
      expect(result.success).toBe(false)
    },
  )
})

describe('bcp47LanguageArraySchema', () => {
  const schema = bcp47LanguageArraySchema({ max: 5 })

  it('accepts canonical input unchanged', () => {
    const result = schema.safeParse(['ja', 'th'])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(['ja', 'th'])
    }
  })

  it('canonicalizes + sorts mixed-case input', () => {
    const result = schema.safeParse(['TH-TH', 'ja-JP'])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(['ja-jp', 'th-th'])
    }
  })

  it('rejects case-insensitive duplicates via refine', () => {
    const result = schema.safeParse(['th-TH', 'th-th'])
    expect(result.success).toBe(false)
  })

  it('rejects arrays exceeding max', () => {
    // G3: use 6 VALID tags so the per-item regex passes and the array-level
    // `.max(5)` refine is actually exercised. The earlier version used `'a1'`
    // etc. which fail the regex first — the assertion passed for the wrong
    // reason (false-green) and did not guard the max constraint at all.
    const result = schema.safeParse(['en', 'th', 'ja', 'ko', 'es', 'de'])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Maximum 5')
    }
  })

  it('accepts empty array', () => {
    const result = schema.safeParse([])
    expect(result.success).toBe(true)
  })
})

describe('displayBcp47', () => {
  it.each([
    ['th', 'th'],
    ['en', 'en'],
    ['yue', 'yue'],
    ['th-th', 'th-TH'],
    ['en-us', 'en-US'],
    ['zh-cn', 'zh-CN'],
    ['zh-hant', 'zh-Hant'],
    ['zh-hant-tw', 'zh-Hant-TW'],
    ['zh-hans-hk', 'zh-Hans-HK'],
    ['es-419', 'es-419'], // numeric region stays UPPERCASE (all digits)
  ])('displayBcp47(%s) → %s', (input, expected) => {
    expect(displayBcp47(input)).toBe(expected)
  })

  it('returns empty string for null/undefined', () => {
    expect(displayBcp47(null)).toBe('')
    expect(displayBcp47(undefined)).toBe('')
    expect(displayBcp47('')).toBe('')
  })

  it('is idempotent on already-display-cased input', () => {
    expect(displayBcp47('zh-Hant-TW')).toBe('zh-Hant-TW')
    expect(displayBcp47('en-US')).toBe('en-US')
  })

  it('round-trips with canonicalizeBcp47 (display → canonical → display)', () => {
    const display = 'zh-Hant-TW'
    const canonical = canonicalizeBcp47(display)
    expect(canonical).toBe('zh-hant-tw')
    expect(displayBcp47(canonical)).toBe(display)
  })
})
