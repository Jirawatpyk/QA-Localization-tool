/**
 * generate-multilang-fixtures.mjs
 *
 * Generates glossary matching test fixtures for JA, ZH, EN/FR/DE from
 * Microsoft Terminology Collection TBX files.
 *
 * Outputs:
 *   docs/test-data/glossary-matching/ja.json        (500+ cases)
 *   docs/test-data/glossary-matching/zh.json        (500+ cases)
 *   docs/test-data/glossary-matching/en-fr-de.json  (500+ cases, mixed lang)
 *
 * Run: node scripts/generate-multilang-fixtures.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const TBX_DIR = resolve(ROOT, 'docs/test-data/microsoft-terminology')
const OUT_DIR = resolve(ROOT, 'docs/test-data/glossary-matching')

// ---------------------------------------------------------------------------
// 1. TBX parser (shared, same \b fix as generate-th-fixture.mjs)
// ---------------------------------------------------------------------------

/**
 * Parse a TBX file and extract (enTerm, targetTerm) pairs.
 * @param {string} filePath
 * @param {string} targetLangPrefix  e.g. 'ja', 'zh-Hans', 'fr', 'de'
 * @param {number} maxGraphemes  skip terms longer than this (grapheme count)
 */
function parseTbx(filePath, targetLangPrefix, maxGraphemes = 20) {
  const content = readFileSync(filePath, 'utf-8')
  const pairs = []
  const targetRe = new RegExp(
    `<langSet xml:lang="${targetLangPrefix}">(.*?)</langSet>`
  )
  const entryRe = /<termEntry[^>]*>(.*?)<\/termEntry>/g
  let match

  while ((match = entryRe.exec(content)) !== null) {
    const entry = match[1]

    const enBlock = entry.match(/<langSet xml:lang="en-US">(.*?)<\/langSet>/)
    const tgtBlock = entry.match(targetRe)

    if (!enBlock || !tgtBlock) continue

    // Use \b to prevent <termGrp> / <termNote> from matching before <term id=...>
    const enTermMatch = enBlock[1].match(/<term\b[^>]*>(.*?)<\/term>/)
    const tgtTermMatch = tgtBlock[1].match(/<term\b[^>]*>(.*?)<\/term>/)

    if (!enTermMatch || !tgtTermMatch) continue

    const enTerm = enTermMatch[1].trim()
    const tgtTerm = tgtTermMatch[1].trim()

    if (!enTerm || !tgtTerm) continue
    if (graphemeLength(tgtTerm) > maxGraphemes) continue

    pairs.push({ enTerm, tgtTerm })
  }

  return pairs
}

// ---------------------------------------------------------------------------
// 2. Helpers — grapheme counting, segmenter boundary
// ---------------------------------------------------------------------------

const graphemeSegmenters = new Map()
function getGraphemeSeg(locale) {
  if (!graphemeSegmenters.has(locale)) {
    graphemeSegmenters.set(locale, new Intl.Segmenter(locale, { granularity: 'grapheme' }))
  }
  return graphemeSegmenters.get(locale)
}
function graphemeLength(text, locale = 'en') {
  return [...getGraphemeSeg(locale).segment(text)].length
}

const wordSegmenters = new Map()
function getWordSeg(locale) {
  if (!wordSegmenters.has(locale)) {
    wordSegmenters.set(locale, new Intl.Segmenter(locale, { granularity: 'word' }))
  }
  return wordSegmenters.get(locale)
}

/** CJK/Thai: use Intl.Segmenter word boundaries */
function detectConfidenceCJK(text, term, locale) {
  const normText = text.normalize('NFKC')
  const normTerm = term.normalize('NFKC')
  const idx = normText.indexOf(normTerm)
  if (idx === -1) return null

  const boundaries = new Set([0, normText.length])
  for (const seg of getWordSeg(locale).segment(normText)) {
    if (seg.isWordLike) {
      boundaries.add(seg.index)
      boundaries.add(seg.index + seg.segment.length)
    }
  }
  return boundaries.has(idx) && boundaries.has(idx + normTerm.length) ? 'high' : 'low'
}

/** European: word-boundary regex check (\W or start/end) */
function detectConfidenceEuropean(text, term, caseSensitive = false) {
  const searchText = caseSensitive ? text : text.toLowerCase()
  const searchTerm = caseSensitive ? term : term.toLowerCase()
  const idx = searchText.indexOf(searchTerm)
  if (idx === -1) return null

  const before = idx > 0 ? text.charAt(idx - 1) : null
  const after = idx + term.length < text.length ? text.charAt(idx + term.length) : null
  const nonWordRe = /\W/

  const startOk = before === null || nonWordRe.test(before)
  const endOk = after === null || nonWordRe.test(after)
  return startOk && endOk ? 'high' : 'low'
}

// ---------------------------------------------------------------------------
// 3. Templates per language
// ---------------------------------------------------------------------------

const TEMPLATES = {
  ja: {
    positive: [
      '{TERM}を使用してください',
      '{TERM}の設定を確認する',
      'システムは{TERM}をサポートします',
      '{TERM}を選択します',
      '{TERM}が正常に動作します',
      '{TERM}をインストールします',
      '設定で{TERM}を有効にする',
      '{TERM}ダウンロードが完了しました',
      '{TERM}を開きます',
      '{TERM}の更新が利用可能です',
      'メニューから{TERM}を選択',
      '{TERM}を閉じてください',
      'エラー: {TERM}が見つかりません',
      '{TERM}の詳細を確認する',
      '{TERM}を再起動してください',
    ],
    markup: [
      '<b>{TERM}</b>を使用してください',
      '<i>{TERM}</i>の設定を開く',
      '<x id="1"/>{TERM}が見つかりました',
    ],
    placeholder: [
      '{0}の{TERM}を更新しました',
      '{TERM}{0}が完了しました',
      '%sの{TERM}を確認',
    ],
    multi: '{TERM}と{TERM}を選択します',
  },

  zh: {
    positive: [
      '{TERM}设置已完成',
      '使用{TERM}进行操作',
      '{TERM}是重要功能',
      '系统支持{TERM}',
      '选择{TERM}选项',
      '{TERM}已成功安装',
      '打开{TERM}设置',
      '{TERM}功能已启用',
      '下载{TERM}完成',
      '{TERM}运行正常',
      '请更新{TERM}',
      '关闭{TERM}',
      '错误：未找到{TERM}',
      '查看{TERM}详情',
      '重新启动{TERM}',
    ],
    markup: [
      '<b>{TERM}</b>设置完成',
      '<i>{TERM}</i>已启用',
      '<x id="1"/>{TERM}已找到',
    ],
    placeholder: [
      '{0}的{TERM}已更新',
      '{TERM}{0}操作完成',
      '%s中的{TERM}',
    ],
    multi: '{TERM}和{TERM}已选择',
  },

  fr: {
    positive: [
      'Veuillez utiliser {TERM}',
      'La configuration de {TERM} est terminée',
      '{TERM} est une fonctionnalité importante',
      'Le système prend en charge {TERM}',
      'Sélectionnez {TERM} dans le menu',
      '{TERM} a été installé avec succès',
      'Ouvrez les paramètres de {TERM}',
      '{TERM} fonctionne correctement',
      'Téléchargez {TERM} maintenant',
      'Activez {TERM} dans les options',
      'Fermez {TERM} pour continuer',
      'Erreur : {TERM} introuvable',
      'Consultez les détails de {TERM}',
      'Redémarrez {TERM}',
      'Mettez à jour {TERM}',
    ],
    markup: [
      'Cliquez sur <b>{TERM}</b>',
      'Ouvrez <i>{TERM}</i> maintenant',
      '<x id="1"/>{TERM} disponible',
    ],
    placeholder: [
      'Le {TERM} {0} a été mis à jour',
      '{TERM} {0} terminé',
      '%s et {TERM}',
    ],
    multi: '{TERM} et {TERM} sont sélectionnés',
  },

  de: {
    positive: [
      'Bitte verwenden Sie {TERM}',
      'Die Konfiguration von {TERM} ist abgeschlossen',
      '{TERM} ist eine wichtige Funktion',
      'Das System unterstützt {TERM}',
      'Wählen Sie {TERM} aus dem Menü',
      '{TERM} wurde erfolgreich installiert',
      'Öffnen Sie die Einstellungen für {TERM}',
      '{TERM} funktioniert korrekt',
      'Laden Sie {TERM} herunter',
      'Aktivieren Sie {TERM} in den Optionen',
      'Schließen Sie {TERM}',
      'Fehler: {TERM} nicht gefunden',
      'Überprüfen Sie {TERM}',
      'Starten Sie {TERM} neu',
      'Aktualisieren Sie {TERM}',
    ],
    markup: [
      'Klicken Sie auf <b>{TERM}</b>',
      'Öffnen Sie <i>{TERM}</i>',
      '<x id="1"/>{TERM} verfügbar',
    ],
    placeholder: [
      'Das {TERM} {0} wurde aktualisiert',
      '{TERM} {0} abgeschlossen',
      '%s und {TERM}',
    ],
    multi: '{TERM} und {TERM} wurden ausgewählt',
  },

  en: {
    positive: [
      'Please use {TERM}',
      'The configuration of {TERM} is complete',
      '{TERM} is an important feature',
      'The system supports {TERM}',
      'Select {TERM} from the menu',
      '{TERM} was installed successfully',
      'Open the {TERM} settings',
      '{TERM} is working correctly',
      'Download {TERM} now',
      'Enable {TERM} in options',
      'Close {TERM} to continue',
      'Error: {TERM} not found',
      'Check the {TERM} details',
      'Restart {TERM}',
      'Update {TERM}',
    ],
    markup: [
      'Click <b>{TERM}</b> to proceed',
      'Open <i>{TERM}</i> now',
      '<x id="1"/>{TERM} is available',
    ],
    placeholder: [
      'The {TERM} {0} was updated',
      '{TERM} {0} completed',
      '%s and {TERM}',
    ],
    multi: '{TERM} and {TERM} are selected',
  },
}

// ---------------------------------------------------------------------------
// 4. Strip markup/placeholder for boundary detection
// ---------------------------------------------------------------------------

function stripForBoundary(text) {
  return text
    .replace(/<[^>]*>/g, m => ' '.repeat(m.length))
    .replace(/\{[^}]{0,50}\}/g, m => ' '.repeat(m.length))
    .replace(/%(\d+\$)?[sdifgpq%]/g, m => ' '.repeat(m.length))
}

// ---------------------------------------------------------------------------
// 5. Case builders (generic)
// ---------------------------------------------------------------------------

function detectConf(text, term, lang) {
  const noSpaceLangs = new Set(['th', 'ja', 'zh', 'ko', 'my', 'km', 'lo'])
  const primary = (lang.split('-')[0] ?? lang).toLowerCase()
  if (noSpaceLangs.has(primary)) {
    return detectConfidenceCJK(text, term, primary)
  }
  return detectConfidenceEuropean(text, term, false)
}

function buildPositiveCases(enTerm, tgtTerm, lang, count = 2) {
  const tmpl = TEMPLATES[lang] ?? TEMPLATES['en']
  const shuffled = [...tmpl.positive].sort(() => Math.random() - 0.5).slice(0, count)
  const cases = []

  for (const t of shuffled) {
    const text = t.replace('{TERM}', tgtTerm)
    const stripped = stripForBoundary(text)
    const confidence = detectConf(stripped, tgtTerm, lang)
    if (!confidence) continue

    cases.push({
      ...(lang !== 'th' && lang !== 'ja' && lang !== 'zh' ? { lang } : {}),
      text,
      term: tgtTerm,
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: confidence,
      note: `standalone | EN="${enTerm}" → ${lang.toUpperCase()}="${tgtTerm}" | conf=${confidence}`,
    })
  }
  return cases
}

function buildMarkupCase(enTerm, tgtTerm, lang) {
  const tmpl = TEMPLATES[lang] ?? TEMPLATES['en']
  const t = tmpl.markup[Math.floor(Math.random() * tmpl.markup.length)]
  const text = t.replace('{TERM}', tgtTerm)
  const stripped = stripForBoundary(text)
  const confidence = detectConf(stripped, tgtTerm, lang)
  if (!confidence) return null

  return {
    ...(lang !== 'th' && lang !== 'ja' && lang !== 'zh' ? { lang } : {}),
    text,
    term: tgtTerm,
    caseSensitive: false,
    expectedFound: true,
    expectedConfidence: confidence,
    note: `markup stripped | EN="${enTerm}" → ${lang.toUpperCase()}="${tgtTerm}" | conf=${confidence}`,
  }
}

function buildPlaceholderCase(enTerm, tgtTerm, lang) {
  const tmpl = TEMPLATES[lang] ?? TEMPLATES['en']
  const t = tmpl.placeholder[Math.floor(Math.random() * tmpl.placeholder.length)]
  const text = t.replace('{TERM}', tgtTerm)
  const stripped = stripForBoundary(text)
  const confidence = detectConf(stripped, tgtTerm, lang)
  if (!confidence) return null

  return {
    ...(lang !== 'th' && lang !== 'ja' && lang !== 'zh' ? { lang } : {}),
    text,
    term: tgtTerm,
    caseSensitive: false,
    expectedFound: true,
    expectedConfidence: confidence,
    note: `placeholder stripped | EN="${enTerm}" → ${lang.toUpperCase()}="${tgtTerm}" | conf=${confidence}`,
  }
}

function buildMultiCase(enTerm, tgtTerm, lang) {
  const tmpl = TEMPLATES[lang] ?? TEMPLATES['en']
  const text = tmpl.multi.replace(/{TERM}/g, tgtTerm)
  const confidence = detectConf(text, tgtTerm, lang)
  if (!confidence) return null

  return {
    ...(lang !== 'th' && lang !== 'ja' && lang !== 'zh' ? { lang } : {}),
    text,
    term: tgtTerm,
    caseSensitive: false,
    expectedFound: true,
    expectedConfidence: confidence,
    note: `multi-occurrence | EN="${enTerm}" → ${lang.toUpperCase()}="${tgtTerm}" | conf=${confidence}`,
  }
}

function buildNegativeCase(tgtTerm, otherTgtTerm, lang) {
  const tmpl = TEMPLATES[lang] ?? TEMPLATES['en']
  const candidates = tmpl.positive
    .slice(0, 5)
    .map(t => t.replace('{TERM}', otherTgtTerm))

  const normTerm = tgtTerm.normalize('NFKC').toLowerCase()
  for (const text of candidates) {
    if (!text.normalize('NFKC').toLowerCase().includes(normTerm)) {
      return {
        ...(lang !== 'th' && lang !== 'ja' && lang !== 'zh' ? { lang } : {}),
        text,
        term: tgtTerm,
        caseSensitive: false,
        expectedFound: false,
        expectedConfidence: null,
        note: `term absent | ${lang.toUpperCase()}="${tgtTerm}"`,
      }
    }
  }
  return null
}

function buildEmptyCase(tgtTerm, lang) {
  return {
    ...(lang !== 'th' && lang !== 'ja' && lang !== 'zh' ? { lang } : {}),
    text: '',
    term: tgtTerm,
    caseSensitive: false,
    expectedFound: false,
    expectedConfidence: null,
    note: `empty text | ${lang.toUpperCase()}="${tgtTerm}"`,
  }
}

// ---------------------------------------------------------------------------
// 6. Per-language static known-good cases
// ---------------------------------------------------------------------------

const STATIC_CASES = {
  ja: [
    {
      text: 'コンピュータの設定を変更する',
      term: 'コンピュータ',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidenceCJK('コンピュータの設定を変更する', 'コンピュータ', 'ja'),
      note: 'JA katakana loan word — segmenter keeps katakana as single segment',
    },
    {
      text: 'ソフトウェアのインストール',
      term: 'インストール',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidenceCJK('ソフトウェアのインストール', 'インストール', 'ja'),
      note: 'JA katakana — at end of text boundary',
    },
    {
      text: '設定を変更してください',
      term: 'データベース',
      caseSensitive: false,
      expectedFound: false,
      expectedConfidence: null,
      note: 'JA term absent from text',
    },
    {
      text: '',
      term: 'ソフトウェア',
      caseSensitive: false,
      expectedFound: false,
      expectedConfidence: null,
      note: 'JA empty text — must not throw',
    },
    {
      text: '<b>ソフトウェア</b>の更新',
      term: 'ソフトウェア',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidenceCJK('   ソフトウェア   の更新', 'ソフトウェア', 'ja'),
      note: 'JA HTML markup stripped — position preserved',
    },
  ],

  zh: [
    {
      text: '我去图书馆借书',
      term: '图书馆',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidenceCJK('我去图书馆借书', '图书馆', 'zh'),
      note: 'ZH compound: segmenter may split 图书+馆 — substring finds full compound',
    },
    {
      text: '人工智能技术发展迅速',
      term: '人工智能',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidenceCJK('人工智能技术发展迅速', '人工智能', 'zh'),
      note: 'ZH AI compound: 人工+智能 — split by segmenter, found by substring',
    },
    {
      text: '这里没有该术语',
      term: '软件',
      caseSensitive: false,
      expectedFound: false,
      expectedConfidence: null,
      note: 'ZH term not present',
    },
    {
      text: '',
      term: '软件',
      caseSensitive: false,
      expectedFound: false,
      expectedConfidence: null,
      note: 'ZH empty text — must not throw',
    },
    {
      text: '<b>软件</b>开发过程',
      term: '软件',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidenceCJK('   软件   开发过程', '软件', 'zh'),
      note: 'ZH markup stripped — 2-char term at boundary',
    },
  ],

  en: [
    {
      lang: 'en',
      text: 'The hospital provides emergency care',
      term: 'hospital',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidenceEuropean('The hospital provides emergency care', 'hospital'),
      note: 'EN clean word boundary — surrounded by spaces',
    },
    {
      lang: 'en',
      text: 'HOSPITAL IS OPEN 24/7',
      term: 'hospital',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidenceEuropean('HOSPITAL IS OPEN 24/7', 'hospital'),
      note: 'EN case-insensitive match',
    },
    {
      lang: 'en',
      text: 'HOSPITAL IS OPEN 24/7',
      term: 'hospital',
      caseSensitive: true,
      expectedFound: false,
      expectedConfidence: null,
      note: 'EN case-sensitive — HOSPITAL does not match hospital',
    },
    {
      lang: 'en',
      text: '',
      term: 'hospital',
      caseSensitive: false,
      expectedFound: false,
      expectedConfidence: null,
      note: 'EN empty text',
    },
  ],

  fr: [
    {
      lang: 'fr',
      text: "Je vais à l'hôpital demain",
      term: 'hôpital',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidenceEuropean("Je vais à l'hôpital demain", 'hôpital'),
      note: 'FR diacritic term — bounded by apostrophe and space',
    },
    {
      lang: 'fr',
      text: '',
      term: 'logiciel',
      caseSensitive: false,
      expectedFound: false,
      expectedConfidence: null,
      note: 'FR empty text',
    },
  ],

  de: [
    {
      lang: 'de',
      text: 'Das Krankenhaus ist neu gebaut',
      term: 'Krankenhaus',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidenceEuropean('Das Krankenhaus ist neu gebaut', 'Krankenhaus'),
      note: 'DE German noun at word boundary',
    },
    {
      lang: 'de',
      text: 'Qualitätssicherung ist wichtig',
      term: 'Qualität',
      caseSensitive: false,
      expectedFound: true,
      expectedConfidence: detectConfidenceEuropean('Qualitätssicherung ist wichtig', 'Qualität'),
      note: 'DE compound: Qualität is prefix of Qualitätssicherung — low confidence',
    },
    {
      lang: 'de',
      text: '',
      term: 'Datenbank',
      caseSensitive: false,
      expectedFound: false,
      expectedConfidence: null,
      note: 'DE empty text',
    },
  ],
}

// ---------------------------------------------------------------------------
// 7. Main generator for a single CJK language
// ---------------------------------------------------------------------------

function generateCJK(lang, tbxFile, targetLangPrefix, scriptRe, description) {
  console.log(`\n=== Generating ${lang.toUpperCase()} fixture ===`)
  console.log(`Parsing ${tbxFile}...`)

  const allPairs = parseTbx(resolve(TBX_DIR, tbxFile), targetLangPrefix)
  console.log(`  Extracted: ${allPairs.length} pairs`)

  // Filter: only target terms containing the target script
  const filtered = allPairs.filter(p => scriptRe.test(p.tgtTerm))
  console.log(`  Script-filtered: ${filtered.length}`)

  // Deduplicate
  const seen = new Set()
  const unique = filtered.filter(p => {
    const k = p.tgtTerm.normalize('NFKC')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  console.log(`  Unique terms: ${unique.length}`)

  // Stratify by grapheme length
  const short = unique.filter(p => graphemeLength(p.tgtTerm, lang) <= 3)
  const medium = unique.filter(p => {
    const l = graphemeLength(p.tgtTerm, lang)
    return l >= 4 && l <= 7
  })
  const long = unique.filter(p => graphemeLength(p.tgtTerm, lang) >= 8)
  console.log(`  Short(1-3g): ${short.length}, Medium(4-7g): ${medium.length}, Long(8+g): ${long.length}`)

  const shuffle = arr => arr.sort(() => Math.random() - 0.5)
  const sampled = [
    ...shuffle([...short]).slice(0, Math.min(40, short.length)),
    ...shuffle([...medium]).slice(0, Math.min(80, medium.length)),
    ...shuffle([...long]).slice(0, 130),
  ]
  console.log(`  Sampled: ${sampled.length} terms`)

  const cases = [...(STATIC_CASES[lang] ?? [])]
  let pos = 0, neg = 0, mkp = 0, plc = 0, multi = 0

  for (let i = 0; i < sampled.length; i++) {
    const { enTerm, tgtTerm } = sampled[i]

    const posCases = buildPositiveCases(enTerm, tgtTerm, lang)
    cases.push(...posCases); pos += posCases.length

    if (i % 4 === 0) {
      const c = buildMarkupCase(enTerm, tgtTerm, lang)
      if (c) { cases.push(c); mkp++ }
    }
    if (i % 5 === 0) {
      const c = buildPlaceholderCase(enTerm, tgtTerm, lang)
      if (c) { cases.push(c); plc++ }
    }
    if (i % 8 === 0) {
      const c = buildMultiCase(enTerm, tgtTerm, lang)
      if (c) { cases.push(c); multi++ }
    }
    if (i % 3 === 0) {
      const other = sampled[(i + 1) % sampled.length]
      if (other && other.tgtTerm !== tgtTerm) {
        const c = buildNegativeCase(tgtTerm, other.tgtTerm, lang)
        if (c) { cases.push(c); neg++ }
      }
    }
    if (i % 10 === 0) {
      cases.push(buildEmptyCase(tgtTerm, lang))
    }
  }

  const highConf = cases.filter(c => c.expectedConfidence === 'high').length
  const lowConf = cases.filter(c => c.expectedConfidence === 'low').length
  const notFound = cases.filter(c => !c.expectedFound).length
  console.log(`  Cases: pos=${pos} markup=${mkp} plc=${plc} multi=${multi} neg=${neg} static=${STATIC_CASES[lang]?.length ?? 0} TOTAL=${cases.length}`)
  console.log(`  Confidence: high=${highConf} low=${lowConf} notFound=${notFound}`)

  const output = {
    _meta: {
      description,
      created: new Date().toISOString().slice(0, 10),
      owner: 'QA team',
      generator: 'scripts/generate-multilang-fixtures.mjs',
      source: `docs/test-data/microsoft-terminology/${tbxFile}`,
      note: [
        `expectedConfidence determined by actual Intl.Segmenter("${lang}") on this machine.`,
        'ICU version differences may cause confidence mismatches — treat as soft warning.',
        'Acceptance thresholds (FR43): false-negative < 5%, false-positive < 10%.',
      ].join(' '),
      stats: {
        total: cases.length,
        positive: cases.filter(c => c.expectedFound).length,
        negative: notFound,
        high_confidence: highConf,
        low_confidence: lowConf,
      },
      schema: {
        text: `target segment text (${lang.toUpperCase()})`,
        term: 'glossary term to search for',
        caseSensitive: 'boolean',
        expectedFound: 'true if term should be found',
        expectedConfidence: 'high | low | null',
        note: 'explanation',
      },
    },
    cases,
  }

  const outPath = resolve(OUT_DIR, `${lang}.json`)
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`  Written: ${outPath} (${(JSON.stringify(output).length / 1024).toFixed(1)} KB)`)
}

// ---------------------------------------------------------------------------
// 8. EN/FR/DE combined fixture generator
// ---------------------------------------------------------------------------

function generateEuropean() {
  console.log('\n=== Generating EN/FR/DE fixture ===')

  const langConfigs = [
    { lang: 'fr', tbxFile: 'FRENCH.tbx',  targetLangPrefix: 'fr', scriptRe: /[a-záàâãéèêëîïôùûüçœæ]/i },
    { lang: 'de', tbxFile: 'GERMAN.tbx',  targetLangPrefix: 'de', scriptRe: /[a-zäöüß]/i },
    // EN: take en-US source terms from FRENCH.tbx (they appear as source lang)
  ]

  const cases = [
    ...(STATIC_CASES['en'] ?? []),
    ...(STATIC_CASES['fr'] ?? []),
    ...(STATIC_CASES['de'] ?? []),
  ]

  for (const { lang, tbxFile, targetLangPrefix, scriptRe } of langConfigs) {
    console.log(`  Processing ${lang.toUpperCase()} from ${tbxFile}...`)
    const allPairs = parseTbx(resolve(TBX_DIR, tbxFile), targetLangPrefix)
    const filtered = allPairs.filter(p => scriptRe.test(p.tgtTerm) && p.tgtTerm.length > 2)
    const seen = new Set()
    const unique = filtered.filter(p => {
      const k = p.tgtTerm.normalize('NFKC').toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    // Sample 80 terms per language (less than CJK since European texts are longer)
    const sampled = unique.sort(() => Math.random() - 0.5).slice(0, 80)
    console.log(`    Extracted ${allPairs.length} → filtered ${filtered.length} → unique ${unique.length} → sampled ${sampled.length}`)

    let pos = 0, neg = 0, mkp = 0, plc = 0
    for (let i = 0; i < sampled.length; i++) {
      const { enTerm, tgtTerm } = sampled[i]

      const posCases = buildPositiveCases(enTerm, tgtTerm, lang)
      cases.push(...posCases); pos += posCases.length

      if (i % 4 === 0) {
        const c = buildMarkupCase(enTerm, tgtTerm, lang)
        if (c) { cases.push(c); mkp++ }
      }
      if (i % 5 === 0) {
        const c = buildPlaceholderCase(enTerm, tgtTerm, lang)
        if (c) { cases.push(c); plc++ }
      }
      if (i % 3 === 0) {
        const other = sampled[(i + 1) % sampled.length]
        if (other && other.tgtTerm !== tgtTerm) {
          const c = buildNegativeCase(tgtTerm, other.tgtTerm, lang)
          if (c) { cases.push(c); neg++ }
        }
      }
      if (i % 10 === 0) cases.push(buildEmptyCase(tgtTerm, lang))
    }
    console.log(`    Cases added: pos=${pos} markup=${mkp} plc=${plc} neg=${neg}`)
  }

  // EN: extract source terms from FRENCH.tbx (en-US side)
  console.log('  Processing EN from FRENCH.tbx source terms...')
  const frContent = readFileSync(resolve(TBX_DIR, 'FRENCH.tbx'), 'utf-8')
  const enTerms = new Set()
  const enEntryRe = /<termEntry[^>]*>(.*?)<\/termEntry>/g
  let m
  while ((m = enEntryRe.exec(frContent)) !== null) {
    const enBlock = m[1].match(/<langSet xml:lang="en-US">(.*?)<\/langSet>/)
    if (!enBlock) continue
    const tM = enBlock[1].match(/<term\b[^>]*>(.*?)<\/term>/)
    if (!tM) continue
    const t = tM[1].trim()
    // Only keep single-word multi-char EN terms (no spaces, letters only, 4-15 chars)
    if (/^[a-zA-Z]{4,15}$/.test(t)) enTerms.add(t)
  }
  const enSampled = [...enTerms].sort(() => Math.random() - 0.5).slice(0, 80)
  console.log(`    EN unique terms sampled: ${enSampled.length}`)

  let enPos = 0, enNeg = 0, enMkp = 0
  for (let i = 0; i < enSampled.length; i++) {
    const tgtTerm = enSampled[i]
    const posCases = buildPositiveCases(tgtTerm, tgtTerm, 'en')
    cases.push(...posCases); enPos += posCases.length

    if (i % 4 === 0) {
      const c = buildMarkupCase(tgtTerm, tgtTerm, 'en')
      if (c) { cases.push(c); enMkp++ }
    }
    if (i % 3 === 0) {
      const other = enSampled[(i + 1) % enSampled.length]
      if (other && other !== tgtTerm) {
        const c = buildNegativeCase(tgtTerm, other, 'en')
        if (c) { cases.push(c); enNeg++ }
      }
    }
    if (i % 10 === 0) cases.push(buildEmptyCase(tgtTerm, 'en'))
  }
  console.log(`    EN cases: pos=${enPos} markup=${enMkp} neg=${enNeg}`)

  const highConf = cases.filter(c => c.expectedConfidence === 'high').length
  const lowConf = cases.filter(c => c.expectedConfidence === 'low').length
  const notFound = cases.filter(c => !c.expectedFound).length

  console.log(`  TOTAL cases: ${cases.length} (high=${highConf} low=${lowConf} notFound=${notFound})`)

  const output = {
    _meta: {
      description: 'Annotated European (EN/FR/DE) glossary matching test corpus — generated from Microsoft Terminology Collection',
      created: new Date().toISOString().slice(0, 10),
      owner: 'QA team',
      generator: 'scripts/generate-multilang-fixtures.mjs',
      source: 'docs/test-data/microsoft-terminology/FRENCH.tbx + GERMAN.tbx',
      note: [
        'European languages use word-boundary regex (\\W or start/end) — Intl.Segmenter not required.',
        'Diacritics (é, ñ, ü) are treated as word characters.',
        'Each case has a lang field (en|fr|de) for per-language test routing.',
        'Acceptance thresholds (FR43): false-negative < 5%, false-positive < 10%.',
      ].join(' '),
      stats: {
        total: cases.length,
        positive: cases.filter(c => c.expectedFound).length,
        negative: notFound,
        high_confidence: highConf,
        low_confidence: lowConf,
      },
      schema: {
        lang: 'BCP-47 target language code (en|fr|de)',
        text: 'target segment text',
        term: 'glossary term to search for',
        caseSensitive: 'boolean',
        expectedFound: 'true if term should be found',
        expectedConfidence: 'high | low | null',
        note: 'explanation',
      },
    },
    cases,
  }

  const outPath = resolve(OUT_DIR, 'en-fr-de.json')
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`  Written: ${outPath} (${(JSON.stringify(output).length / 1024).toFixed(1)} KB)`)
}

// ---------------------------------------------------------------------------
// 9. Run all
// ---------------------------------------------------------------------------

generateCJK(
  'ja',
  'JAPANESE.tbx',
  'ja',
  /[\u3040-\u30FF\u4E00-\u9FFF]/,  // hiragana, katakana, kanji
  'Annotated Japanese glossary matching test corpus — generated from Microsoft Terminology Collection JAPANESE.tbx',
)

generateCJK(
  'zh',
  'CHINESE (SIMPLIFIED).tbx',
  'zh-Hans',
  /[\u4E00-\u9FFF]/,  // CJK unified ideographs
  'Annotated Chinese (Simplified) glossary matching test corpus — generated from Microsoft Terminology Collection CHINESE (SIMPLIFIED).tbx',
)

generateEuropean()

console.log('\n✅ All fixtures generated.')
