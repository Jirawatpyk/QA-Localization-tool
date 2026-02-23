// Compute word counts for fixture segments
const noSpaceLocales = new Set(['th', 'ja', 'zh', 'ko', 'my', 'km', 'lo'])
const segmenterCache = new Map()

function getSegmenter(locale) {
  if (!segmenterCache.has(locale)) {
    segmenterCache.set(locale, new Intl.Segmenter(locale, { granularity: 'word' }))
  }
  return segmenterCache.get(locale)
}

function stripMarkup(text) {
  return text
    .replace(/<[^>]*>/g, (m) => ' '.repeat(m.length))
    .replace(/\{[^}]{0,50}\}/g, (m) => ' '.repeat(m.length))
    .replace(/%(\d+\$)?[sdifgpq%]/g, (m) => ' '.repeat(m.length))
}

function countWords(text, locale) {
  const stripped = stripMarkup(text).trim()
  if (!stripped) return 0
  const primary = (locale.split('-')[0] || locale).toLowerCase()
  if (noSpaceLocales.has(primary)) {
    const segmenter = getSegmenter(locale)
    let count = 0
    for (const seg of segmenter.segment(stripped)) {
      if (seg.isWordLike) count++
    }
    return count
  }
  return stripped.split(/\s+/).filter(Boolean).length
}

// minimal.sdlxliff — 3 segments, source=en-US, target=th-TH
// Using SOURCE text for wordCount
const minimal = [
  { id: '1_1', sourceText: 'Hello world', targetText: 'สวัสดีโลก', locale: 'en-US' },
  { id: '2_2', sourceText: 'Click here to continue.', targetText: 'คลิกที่นี่เพื่อดำเนินการต่อ', locale: 'en-US' },
  { id: '3_3', sourceText: 'Cancel', targetText: 'ยกเลิก', locale: 'en-US' },
]

console.log('=== minimal.sdlxliff word counts ===')
for (const s of minimal) {
  const wc = countWords(s.sourceText, s.locale)
  console.log(`${s.id}: "${s.sourceText}" → ${wc} words`)
}

// with-namespaces.sdlxliff — 5 segments
const withNs = [
  { id: '1_1', sourceText: 'Please read the important notice before continuing.', locale: 'en-US' },
  { id: '2_2', sourceText: 'Line 1Line 2', locale: 'en-US' }, // after stripping <x/>
  { id: '3_3', sourceText: 'Welcome, !', locale: 'en-US' }, // after stripping <ph/>
  { id: '4_4', sourceText: 'Click here', locale: 'en-US' }, // after stripping <bpt>/<ept>
  { id: '5_5', sourceText: 'Save', locale: 'en-US' },
]

console.log('\n=== with-namespaces.sdlxliff word counts (source, after strip) ===')
for (const s of withNs) {
  const wc = countWords(s.sourceText, s.locale)
  console.log(`${s.id}: "${s.sourceText}" → ${wc} words`)
}

// standard.xliff — 3 segments, source=en-US
const standard = [
  { id: '1', sourceText: 'Good morning', locale: 'en-US' },
  { id: '2', sourceText: 'Please enter your email address.', locale: 'en-US' },
  { id: '3', sourceText: 'Error: ', locale: 'en-US' },
]

console.log('\n=== standard.xliff word counts (source, after strip) ===')
for (const s of standard) {
  const wc = countWords(s.sourceText, s.locale)
  console.log(`${s.id}: "${s.sourceText}" → ${wc} words`)
}
