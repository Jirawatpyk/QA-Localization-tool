import { describe, expect, it } from 'vitest'

import { parseTbx } from './tbxParser'

describe('parseTbx', () => {
  const validTBX = `<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX">
  <body>
    <termEntry>
      <langSet xml:lang="en">
        <tig><term>cloud</term></tig>
      </langSet>
      <langSet xml:lang="th">
        <tig><term>คลาวด์</term></tig>
      </langSet>
    </termEntry>
    <termEntry>
      <langSet xml:lang="en">
        <tig><term>database</term></tig>
      </langSet>
      <langSet xml:lang="th">
        <tig><term>ฐานข้อมูล</term></tig>
      </langSet>
    </termEntry>
  </body>
</martif>`

  const multiLangTBX = `<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX">
  <body>
    <termEntry>
      <langSet xml:lang="en">
        <tig><term>server</term></tig>
      </langSet>
      <langSet xml:lang="th">
        <tig><term>เซิร์ฟเวอร์</term></tig>
      </langSet>
      <langSet xml:lang="ja">
        <tig><term>サーバー</term></tig>
      </langSet>
    </termEntry>
    <termEntry>
      <langSet xml:lang="en">
        <tig><term>programming</term></tig>
      </langSet>
      <langSet xml:lang="th">
        <tig><term>โปรแกรมมิ่ง</term></tig>
      </langSet>
      <langSet xml:lang="ja">
        <tig><term>プログラミング</term></tig>
      </langSet>
    </termEntry>
  </body>
</martif>`

  it('should parse valid TBX with matching en-th language pair', () => {
    const result = parseTbx(validTBX, 'en', 'th')

    expect(result.terms).toHaveLength(2)
    expect(result.terms[0]).toEqual(
      expect.objectContaining({ sourceTerm: 'cloud', targetTerm: 'คลาวด์' }),
    )
    expect(result.terms[1]).toEqual(
      expect.objectContaining({ sourceTerm: 'database', targetTerm: 'ฐานข้อมูล' }),
    )
    expect(result.errors).toHaveLength(0)
  })

  it('should extract only matching language pair from multi-language TBX', () => {
    const result = parseTbx(multiLangTBX, 'en', 'ja')

    expect(result.terms).toHaveLength(2)
    expect(result.terms[0]).toEqual(
      expect.objectContaining({ sourceTerm: 'server', targetTerm: 'サーバー' }),
    )
    expect(result.terms[1]).toEqual(
      expect.objectContaining({ sourceTerm: 'programming', targetTerm: 'プログラミング' }),
    )
  })

  it('should return INVALID_PAIR errors for source language not found', () => {
    const result = parseTbx(validTBX, 'fr', 'th')

    expect(result.terms).toHaveLength(0)
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]?.code).toBe('INVALID_PAIR')
    expect(result.errors[0]?.reason).toContain('fr')
  })

  it('should return INVALID_PAIR errors for target language not found', () => {
    const result = parseTbx(validTBX, 'en', 'de')

    expect(result.terms).toHaveLength(0)
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]?.code).toBe('INVALID_PAIR')
    expect(result.errors[0]?.reason).toContain('de')
  })

  it('should return EMPTY_SOURCE for empty term text', () => {
    const tbxWithEmpty = `<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX">
  <body>
    <termEntry>
      <langSet xml:lang="en">
        <tig><term></term></tig>
      </langSet>
      <langSet xml:lang="th">
        <tig><term>คลาวด์</term></tig>
      </langSet>
    </termEntry>
    <termEntry>
      <langSet xml:lang="en">
        <tig><term>database</term></tig>
      </langSet>
      <langSet xml:lang="th">
        <tig><term>ฐานข้อมูล</term></tig>
      </langSet>
    </termEntry>
  </body>
</martif>`

    const result = parseTbx(tbxWithEmpty, 'en', 'th')

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]?.sourceTerm).toBe('database')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.code).toBe('EMPTY_SOURCE')
  })

  it('should normalize extracted terms with NFKC', () => {
    const halfwidthKatakana = '\uFF8C\uFF9F\uFF9B\uFF78\uFF9E\uFF97\uFF90\uFF9D\uFF78\uFF9E'
    const tbxWithHalfwidth = `<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX">
  <body>
    <termEntry>
      <langSet xml:lang="en">
        <tig><term>programming</term></tig>
      </langSet>
      <langSet xml:lang="ja">
        <tig><term>${halfwidthKatakana}</term></tig>
      </langSet>
    </termEntry>
  </body>
</martif>`

    const result = parseTbx(tbxWithHalfwidth, 'en', 'ja')

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]?.targetTerm).toBe(halfwidthKatakana.normalize('NFKC'))
  })

  // CR3-3: Microsoft TBX uses <martif><text><body> wrapper
  it('should parse TBX with <text> wrapper around <body> (Microsoft format)', () => {
    const microsoftTBX = `<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX-Basic" xml:lang="en-US">
  <text>
    <body>
      <termEntry>
        <langSet xml:lang="en-US">
          <tig><term>cloud</term></tig>
        </langSet>
        <langSet xml:lang="th">
          <tig><term>คลาวด์</term></tig>
        </langSet>
      </termEntry>
    </body>
  </text>
</martif>`

    const result = parseTbx(microsoftTBX, 'en-US', 'th')

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]).toEqual(
      expect.objectContaining({ sourceTerm: 'cloud', targetTerm: 'คลาวด์' }),
    )
    expect(result.errors).toHaveLength(0)
  })

  // CR3-4: Microsoft TBX uses <ntig><termGrp><term> with attributes
  it('should parse TBX with ntig > termGrp > term structure (attributed terms)', () => {
    const ntigTBX = `<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX-Basic">
  <text>
    <body>
      <termEntry id="entry_1">
        <langSet xml:lang="en-US">
          <ntig>
            <termGrp>
              <term id="123">touchtone interface</term>
              <termNote type="partOfSpeech">Noun</termNote>
            </termGrp>
          </ntig>
        </langSet>
        <langSet xml:lang="th">
          <ntig>
            <termGrp>
              <term id="456">ส่วนติดต่อแบบทัชโทน</term>
              <termNote type="partOfSpeech">Noun</termNote>
            </termGrp>
          </ntig>
        </langSet>
      </termEntry>
    </body>
  </text>
</martif>`

    const result = parseTbx(ntigTBX, 'en-US', 'th')

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]).toEqual(
      expect.objectContaining({
        sourceTerm: 'touchtone interface',
        targetTerm: 'ส่วนติดต่อแบบทัชโทน',
      }),
    )
    expect(result.errors).toHaveLength(0)
  })

  // CR3-5: BCP47 prefix matching — "en-US" in TBX should match requested "en"
  it('should match BCP47 language tags with prefix support', () => {
    const bcp47TBX = `<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX">
  <body>
    <termEntry>
      <langSet xml:lang="en-US">
        <tig><term>server</term></tig>
      </langSet>
      <langSet xml:lang="zh-Hans">
        <tig><term>服务器</term></tig>
      </langSet>
    </termEntry>
  </body>
</martif>`

    // Request "en" → matches "en-US", request "zh" → matches "zh-Hans"
    const result = parseTbx(bcp47TBX, 'en', 'zh')

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]).toEqual(
      expect.objectContaining({ sourceTerm: 'server', targetTerm: '服务器' }),
    )
    expect(result.errors).toHaveLength(0)
  })

  it('should prefer exact match over prefix match for language tags', () => {
    const variantsTBX = `<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX">
  <body>
    <termEntry>
      <langSet xml:lang="en-US">
        <tig><term>color</term></tig>
      </langSet>
      <langSet xml:lang="zh-Hant">
        <tig><term>顏色</term></tig>
      </langSet>
      <langSet xml:lang="zh-Hans">
        <tig><term>颜色</term></tig>
      </langSet>
    </termEntry>
  </body>
</martif>`

    // Request "zh-Hans" exactly — should get Simplified, not Traditional
    const result = parseTbx(variantsTBX, 'en-US', 'zh-Hans')

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]?.targetTerm).toBe('颜色')
  })

  // CR3-1: fast-xml-parser returns numbers for numeric-looking terms
  it('should handle numeric term content (fast-xml-parser coercion)', () => {
    const numericTBX = `<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX">
  <body>
    <termEntry>
      <langSet xml:lang="en">
        <tig><term>404</term></tig>
      </langSet>
      <langSet xml:lang="th">
        <tig><term>404</term></tig>
      </langSet>
    </termEntry>
  </body>
</martif>`

    const result = parseTbx(numericTBX, 'en', 'th')

    expect(result.terms).toHaveLength(1)
    expect(result.terms[0]?.sourceTerm).toBe('404')
    expect(result.terms[0]?.targetTerm).toBe('404')
  })
})
