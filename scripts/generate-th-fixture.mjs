/**
 * generate-th-fixture.mjs
 *
 * Generates docs/test-data/glossary-matching/th.json from THAI.tbx.
 * Uses actual Intl.Segmenter('th') to determine expectedConfidence per term.
 *
 * Output: 500+ annotated cases covering:
 *   - Positive matches (standalone, compound, context, markup, placeholder)
 *   - Negative matches (absent terms, partial substrings)
 *   - NFKC normalization
 *   - Multiple occurrences
 *   - Case sensitivity (for Latin terms in TH glossary)
 *
 * Run: node scripts/generate-th-fixture.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// 1. Parse THAI.tbx — extract (enTerm, thTerm) pairs
// ---------------------------------------------------------------------------

function parseTbx(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const pairs = []

  // Match each <termEntry>...</termEntry>
  const entryRe = /<termEntry[^>]*>(.*?)<\/termEntry>/g
  let match

  while ((match = entryRe.exec(content)) !== null) {
    const entry = match[1]

    // Extract EN term
    const enBlock = entry.match(/<langSet xml:lang="en-US">(.*?)<\/langSet>/)
    // Extract TH term (first <term> in TH langSet)
    const thBlock = entry.match(/<langSet xml:lang="th">(.*?)<\/langSet>/)

    if (!enBlock || !thBlock) continue

    const enTermMatch = enBlock[1].match(/<term\b[^>]*>(.*?)<\/term>/)
    const thTermMatch = thBlock[1].match(/<term\b[^>]*>(.*?)<\/term>/)

    if (!enTermMatch || !thTermMatch) continue

    const enTerm = enTermMatch[1].trim()
    const thTerm = thTermMatch[1].trim()

    // Skip empty or very long compound phrases (> 25 graphemes)
    if (!thTerm || !enTerm) continue
    if (graphemeLength(thTerm) > 25) continue

    pairs.push({ enTerm, thTerm })
  }

  return pairs
}

// ---------------------------------------------------------------------------
// 2. Intl.Segmenter helpers
// ---------------------------------------------------------------------------

const segmenter = new Intl.Segmenter('th', { granularity: 'word' })
const graphemeSegmenter = new Intl.Segmenter('th', { granularity: 'grapheme' })

/** Count grapheme clusters (visible characters) in a Thai string */
function graphemeLength(text) {
  return [...graphemeSegmenter.segment(text)].length
}

function getWordBoundaries(text) {
  const boundaries = new Set([0, text.length])
  for (const seg of segmenter.segment(text)) {
    if (seg.isWordLike) {
      boundaries.add(seg.index)
      boundaries.add(seg.index + seg.segment.length)
    }
  }
  return boundaries
}

/**
 * Given a text that contains `term`, returns 'high' if both start+end of
 * the match align to Intl.Segmenter word boundaries, else 'low'.
 */
function detectConfidence(text, term) {
  const normalText = text.normalize('NFKC')
  const normalTerm = term.normalize('NFKC')
  const idx = normalText.indexOf(normalTerm)
  if (idx === -1) return null  // not found

  const boundaries = getWordBoundaries(normalText)
  const startOk = boundaries.has(idx)
  const endOk = boundaries.has(idx + normalTerm.length)
  return startOk && endOk ? 'high' : 'low'
}

// ---------------------------------------------------------------------------
// 3. Segment text templates — realistic Thai context sentences
// ---------------------------------------------------------------------------

// Thai context templates — {TERM} is replaced with the actual term
const POSITIVE_TEMPLATES = [
  '{TERM}ใช้งานในระบบ',
  'การตั้งค่า{TERM}',
  '{TERM}เป็นส่วนสำคัญ',
  'กด{TERM}เพื่อดำเนินการ',
  'คลิก{TERM}ในเมนู',
  'เปิดใช้งาน{TERM}',
  '{TERM}สำหรับผู้ใช้',
  'ระบบรองรับ{TERM}',
  'แสดง{TERM}บนหน้าจอ',
  '{TERM}ได้รับการอัปเดต',
  'ตรวจสอบ{TERM}ก่อนบันทึก',
  'ดาวน์โหลด{TERM}แล้ว',
  '{TERM}ทำงานได้ถูกต้อง',
  'ปิด{TERM}ชั่วคราว',
  'เลือก{TERM}จากรายการ',
]

const MARKUP_TEMPLATES = [
  '<b>{TERM}</b>ใช้งานได้',
  'กด<i>{TERM}</i>เพื่อยืนยัน',
  '<x id="1"/>{TERM}แสดงผล',
]

const PLACEHOLDER_TEMPLATES = [
  '{0}{TERM}ได้รับการบันทึก',
  '{TERM}{0}ถูกอัปเดตแล้ว',
  'ไฟล์ %s และ{TERM}',
]

const MULTI_OCCURRENCE_TEMPLATE = '{TERM}และ{TERM}ถูกเลือก'

// ---------------------------------------------------------------------------
// 4. Note generators
// ---------------------------------------------------------------------------

function makeNote(enTerm, thTerm, confidence, scenario) {
  const gLen = graphemeLength(thTerm)
  const base = `EN="${enTerm}" → TH="${thTerm}" (${gLen}g)`
  return `${scenario} | ${base} | confidence=${confidence}`
}

// ---------------------------------------------------------------------------
// 5. Case builders
// ---------------------------------------------------------------------------

function buildPositiveCases(enTerm, thTerm) {
  const cases = []

  // Pick 2-3 random templates
  const shuffled = [...POSITIVE_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, 2)

  for (const tmpl of shuffled) {
    const text = tmpl.replace('{TERM}', thTerm)
    const confidence = detectConfidence(text, thTerm)
    if (!confidence) continue

    cases.push({
      text,
      term: thTerm,
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: confidence,
      note: makeNote(enTerm, thTerm, confidence, 'standalone in context'),
    })
  }

  return cases
}

function buildMarkupCase(enTerm, thTerm) {
  const tmpl = MARKUP_TEMPLATES[Math.floor(Math.random() * MARKUP_TEMPLATES.length)]
  const text = tmpl.replace('{TERM}', thTerm)

  // After markup stripping, check confidence on stripped text
  const stripped = text.replace(/<[^>]*>/g, m => ' '.repeat(m.length))
  const confidence = detectConfidence(stripped, thTerm)
  if (!confidence) return null

  return {
    text,
    term: thTerm,
    caseSensitive: false,
    expectedFound: true,
    expectedConfidence: confidence,
    note: makeNote(enTerm, thTerm, confidence, 'inline markup stripped'),
  }
}

function buildPlaceholderCase(enTerm, thTerm) {
  const tmpl = PLACEHOLDER_TEMPLATES[Math.floor(Math.random() * PLACEHOLDER_TEMPLATES.length)]
  const text = tmpl.replace('{TERM}', thTerm)

  const stripped = text
    .replace(/\{[^}]{0,50}\}/g, m => ' '.repeat(m.length))
    .replace(/%(\d+\$)?[sdifgpq%]/g, m => ' '.repeat(m.length))
  const confidence = detectConfidence(stripped, thTerm)
  if (!confidence) return null

  return {
    text,
    term: thTerm,
    caseSensitive: false,
    expectedFound: true,
    expectedConfidence: confidence,
    note: makeNote(enTerm, thTerm, confidence, 'placeholder stripped'),
  }
}

function buildMultiOccurrenceCase(enTerm, thTerm) {
  const text = MULTI_OCCURRENCE_TEMPLATE.replace(/{TERM}/g, thTerm)
  const confidence = detectConfidence(text, thTerm)
  if (!confidence) return null

  return {
    text,
    term: thTerm,
    caseSensitive: false,
    expectedFound: true,
    expectedConfidence: confidence,
    note: makeNote(enTerm, thTerm, confidence, 'multiple occurrences'),
  }
}

function buildNegativeCase(thTerm, otherThTerm) {
  // Try multiple templates — pick first one that does NOT contain thTerm as substring
  const candidates = [
    `การตั้งค่า${otherThTerm}และระบบ`,
    `ระบบรองรับ${otherThTerm}`,
    `${otherThTerm}ใช้งานได้`,
    `เปิดใช้งาน${otherThTerm}แล้ว`,
    `ดาวน์โหลด${otherThTerm}สำเร็จ`,
  ]

  const normalTerm = thTerm.normalize('NFKC').toLowerCase()
  for (const text of candidates) {
    // Verify term is truly absent (substring check)
    if (!text.normalize('NFKC').toLowerCase().includes(normalTerm)) {
      return {
        text,
        term: thTerm,
        caseSensitive: false,
        expectedFound: false,
        expectedConfidence: null,
        note: `term absent from text | TH="${thTerm}"`,
      }
    }
  }

  // All templates accidentally contain the term — skip this negative case
  return null
}

function buildEmptyCase(thTerm) {
  return {
    text: '',
    term: thTerm,
    caseSensitive: false,
    expectedFound: false,
    expectedConfidence: null,
    note: `empty text — must not throw | TH="${thTerm}"`,
  }
}

// ---------------------------------------------------------------------------
// 6. Main generator
// ---------------------------------------------------------------------------

function generate() {
  console.log('Parsing THAI.tbx...')
  const allPairs = parseTbx(resolve(ROOT, 'docs/test-data/microsoft-terminology/THAI.tbx'))
  console.log(`Extracted ${allPairs.length} EN-TH pairs`)

  // Filter: only pairs where thTerm contains Thai script characters
  const thaiRe = /[\u0E00-\u0E7F]/
  const thaiPairs = allPairs.filter(p => thaiRe.test(p.thTerm))
  console.log(`Thai-script pairs: ${thaiPairs.length}`)

  // Deduplicate by thTerm
  const seen = new Set()
  const uniquePairs = thaiPairs.filter(p => {
    const key = p.thTerm.normalize('NFKC')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  console.log(`Unique Thai terms: ${uniquePairs.length}`)

  // Stratified sampling by grapheme length (Thai uses combining chars — graphemes, not codepoints)
  // Distribution from corpus: short(1-3) ~3%, medium(4-7) ~17%, long(8-25) ~80%
  const short = uniquePairs.filter(p => graphemeLength(p.thTerm) <= 3)
  const medium = uniquePairs.filter(p => graphemeLength(p.thTerm) >= 4 && graphemeLength(p.thTerm) <= 7)
  const long = uniquePairs.filter(p => graphemeLength(p.thTerm) >= 8)

  console.log(`Short(1-3g): ${short.length}, Medium(4-7g): ${medium.length}, Long(8-25g): ${long.length}`)

  // Sample 250 terms total → ~650+ cases (2 positive + markup/placeholder/multi/negative per term)
  const shuffle = arr => arr.sort(() => Math.random() - 0.5)
  const sampledShort = shuffle([...short]).slice(0, Math.min(40, short.length))
  const sampledMedium = shuffle([...medium]).slice(0, Math.min(80, medium.length))
  const sampledLong = shuffle([...long]).slice(0, 130)
  const sampled = [...sampledShort, ...sampledMedium, ...sampledLong]

  console.log(`Sampled ${sampled.length} terms for case generation`)

  const cases = []

  // Static known cases (kept from dev fixture — these are well-understood)
  const staticCases = [
    {
      text: 'ﾌﾟﾛｸﾞﾗﾐﾝｸﾞภาษา',
      term: 'プログラミング',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: 'high',
      note: 'NFKC: halfwidth katakana normalizes to fullwidth — cross-language normalization test',
    },
    {
      text: '',
      term: 'ซอฟต์แวร์',
      caseSensitive: false,
      expectedFound: false,
      expectedConfidence: null,
      note: 'empty text — must not throw',
    },
    {
      text: 'คอมพิวเตอร์ทำงานได้ดี คอมพิวเตอร์ราคาถูก',
      term: 'คอมพิวเตอร์',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidence('คอมพิวเตอร์ทำงานได้ดี คอมพิวเตอร์ราคาถูก', 'คอมพิวเตอร์'),
      note: 'multiple occurrences — first occurrence returned | EN="computer" → TH="คอมพิวเตอร์"',
    },
    {
      text: '<b>การแปล</b>ที่ถูกต้อง',
      term: 'การแปล',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidence('   การแปล   ที่ถูกต้อง', 'การแปล'),
      note: 'HTML markup stripped — position preserved | EN="translation" → TH="การแปล"',
    },
    {
      text: 'ข้อความ {0} ถูกบันทึกแล้ว',
      term: 'ถูกบันทึก',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidence('ข้อความ {0} ถูกบันทึกแล้ว'.replace(/\{[^}]{0,50}\}/g, m => ' '.repeat(m.length)), 'ถูกบันทึก'),
      note: 'placeholder {0} stripped — term found correctly',
    },
  ]
  cases.push(...staticCases.filter(c => c.expectedConfidence !== null || !c.expectedFound))

  // Dynamic cases from TBX terms
  let positiveCount = 0
  let negativeCount = 0
  let markupCount = 0
  let placeholderCount = 0
  let multiCount = 0

  for (let i = 0; i < sampled.length; i++) {
    const { enTerm, thTerm } = sampled[i]

    // Positive: 2 context variants
    const posCases = buildPositiveCases(enTerm, thTerm)
    cases.push(...posCases)
    positiveCount += posCases.length

    // Markup case (every 4th term)
    if (i % 4 === 0) {
      const mc = buildMarkupCase(enTerm, thTerm)
      if (mc) { cases.push(mc); markupCount++ }
    }

    // Placeholder case (every 5th term)
    if (i % 5 === 0) {
      const pc = buildPlaceholderCase(enTerm, thTerm)
      if (pc) { cases.push(pc); placeholderCount++ }
    }

    // Multi-occurrence case (every 8th term)
    if (i % 8 === 0) {
      const mc2 = buildMultiOccurrenceCase(enTerm, thTerm)
      if (mc2) { cases.push(mc2); multiCount++ }
    }

    // Negative: every 3rd term — use NEXT term as the text context (no match)
    if (i % 3 === 0) {
      const other = sampled[(i + 1) % sampled.length]
      if (other && other.thTerm !== thTerm) {
        const neg = buildNegativeCase(thTerm, other.thTerm)
        if (neg) { cases.push(neg); negativeCount++ }
      }
    }

    // Empty text: every 10th term
    if (i % 10 === 0) {
      cases.push(buildEmptyCase(thTerm))
    }
  }

  console.log(`Generated cases:`)
  console.log(`  Positive (context): ${positiveCount}`)
  console.log(`  Markup: ${markupCount}`)
  console.log(`  Placeholder: ${placeholderCount}`)
  console.log(`  Multi-occurrence: ${multiCount}`)
  console.log(`  Negative: ${negativeCount}`)
  console.log(`  Static: ${staticCases.length}`)
  console.log(`  TOTAL: ${cases.length}`)

  // Count high vs low confidence
  const highConf = cases.filter(c => c.expectedConfidence === 'high').length
  const lowConf = cases.filter(c => c.expectedConfidence === 'low').length
  const notFound = cases.filter(c => !c.expectedFound).length
  console.log(`  High confidence: ${highConf}`)
  console.log(`  Low confidence: ${lowConf}`)
  console.log(`  Not found (negative): ${notFound}`)

  const output = {
    _meta: {
      description: 'Annotated Thai glossary matching test corpus — generated from Microsoft Terminology Collection THAI.tbx',
      created: new Date().toISOString().slice(0, 10),
      owner: 'QA team',
      generator: 'scripts/generate-th-fixture.mjs',
      source: 'docs/test-data/microsoft-terminology/THAI.tbx (34,515 EN-TH term pairs)',
      icu_version: Intl.Segmenter.toString().includes('native') ? 'native' : 'full-icu',
      note: [
        'expectedConfidence is determined by actual Intl.Segmenter("th") on THIS machine.',
        'ICU version differences across machines may cause confidence mismatches — treat as soft warning.',
        'Negative cases: term intentionally absent from text.',
        'Acceptance thresholds (FR43): false-negative < 5%, false-positive < 10%.',
      ].join(' '),
      stats: {
        total: cases.length,
        positive: cases.filter(c => c.expectedFound).length,
        negative: cases.filter(c => !c.expectedFound).length,
        high_confidence: highConf,
        low_confidence: lowConf,
      },
      schema: {
        text: 'target segment text (Thai)',
        term: 'glossary term to search for',
        caseSensitive: 'boolean',
        expectedFound: 'true if term should be found',
        expectedConfidence: 'high | low | null (null if not found)',
        note: 'explanation including EN source term',
      },
    },
    cases,
  }

  const outPath = resolve(ROOT, 'docs/test-data/glossary-matching/th.json')
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`\nWritten to: ${outPath}`)
  console.log(`File size: ${(JSON.stringify(output).length / 1024).toFixed(1)} KB`)
}

generate()
