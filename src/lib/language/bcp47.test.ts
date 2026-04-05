import { describe, expect, it } from 'vitest'

import {
  bcp47LanguageArraySchema,
  bcp47LanguageSchema,
  canonicalizeBcp47,
  canonicalizeLanguages,
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
    const result = schema.safeParse(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'])
    expect(result.success).toBe(false)
  })

  it('accepts empty array', () => {
    const result = schema.safeParse([])
    expect(result.success).toBe(true)
  })
})
