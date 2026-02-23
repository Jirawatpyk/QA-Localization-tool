// Script to generate expected output JSON fixtures by running the parser
// Run: node scripts/generate-expected-fixtures.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

// Register path alias resolution using require
const require = createRequire(import.meta.url)

// We'll use tsx/ts-node for TypeScript, but since we can't easily import TS here,
// let's replicate the parser logic in plain JS for fixture generation.

// ---- Minimal word counter ----
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

// ---- Read fixture files ----
const minimalXliff = readFileSync(join(projectRoot, 'e2e/fixtures/sdlxliff/minimal.sdlxliff'), 'utf-8')
const withNsXliff = readFileSync(join(projectRoot, 'e2e/fixtures/sdlxliff/with-namespaces.sdlxliff'), 'utf-8')
const standardXliff = readFileSync(join(projectRoot, 'e2e/fixtures/xliff/standard.xliff'), 'utf-8')

// ---- Compute word counts for each fixture ----
const minimalExpected = {
  fileType: 'sdlxliff',
  sourceLang: 'en-US',
  targetLang: 'th-TH',
  segmentCount: 3,
  segments: [
    {
      segmentId: '1', segmentNumber: 1,
      sourceText: 'Hello world', targetText: 'สวัสดีโลก',
      sourceLang: 'en-US', targetLang: 'th-TH',
      confirmationState: 'Draft', matchPercentage: 0, translatorComment: null, inlineTags: null,
      wordCount: countWords('Hello world', 'en-US'),
    },
    {
      segmentId: '2', segmentNumber: 2,
      sourceText: 'Click here to continue.', targetText: 'คลิกที่นี่เพื่อดำเนินการต่อ',
      sourceLang: 'en-US', targetLang: 'th-TH',
      confirmationState: 'Translated', matchPercentage: 85, translatorComment: null, inlineTags: null,
      wordCount: countWords('Click here to continue.', 'en-US'),
    },
    {
      segmentId: '3', segmentNumber: 3,
      sourceText: 'Cancel', targetText: 'ยกเลิก',
      sourceLang: 'en-US', targetLang: 'th-TH',
      confirmationState: 'ApprovedSignOff', matchPercentage: 100, translatorComment: null, inlineTags: null,
      wordCount: countWords('Cancel', 'en-US'),
    },
  ],
}

// standard.xliff expected
const standardExpected = {
  fileType: 'xliff',
  sourceLang: 'en-US',
  targetLang: 'th-TH',
  segmentCount: 3,
  segments: [
    {
      segmentId: '1', segmentNumber: 1,
      sourceText: 'Good morning', targetText: 'สวัสดีตอนเช้า',
      sourceLang: 'en-US', targetLang: 'th-TH',
      confirmationState: 'Translated', matchPercentage: null,
      translatorComment: 'Standard greeting', inlineTags: null,
      wordCount: countWords('Good morning', 'en-US'),
    },
    {
      segmentId: '2', segmentNumber: 2,
      // Plain text after stripping <g>: "Please enter your email address."
      sourceText: 'Please enter your email address.',
      targetText: 'กรุณากรอกที่อยู่อีเมลของคุณ',
      sourceLang: 'en-US', targetLang: 'th-TH',
      confirmationState: 'Draft', matchPercentage: null, translatorComment: null,
      // inlineTags will be non-null (has <g> tag)
      wordCount: countWords('Please enter your email address.', 'en-US'),
    },
    {
      segmentId: '3', segmentNumber: 3,
      // Plain text after stripping <ph>: "Error: "
      sourceText: 'Error: ',
      targetText: 'ข้อผิดพลาด: ',
      sourceLang: 'en-US', targetLang: 'th-TH',
      confirmationState: 'Draft', matchPercentage: null, translatorComment: null,
      wordCount: countWords('Error: ', 'en-US'),
    },
  ],
}

console.log('=== minimal expected ===')
console.log(JSON.stringify(minimalExpected, null, 2))
console.log('\n=== standard expected ===')
console.log(JSON.stringify(standardExpected, null, 2))
