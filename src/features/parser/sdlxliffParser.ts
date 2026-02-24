import { XMLParser } from 'fast-xml-parser'

import {
  COMMENT_SEPARATOR,
  CONFIRMATION_STATES,
  MAX_PARSE_SIZE_BYTES,
  SDL_NAMESPACE_URI,
  XLIFF_STATE_MAP,
} from './constants'
import { extractInlineTags } from './inlineTagExtractor'
import type {
  ConfirmationState,
  ParseOutcome,
  ParsedSegment,
  ParserError,
  XliffState,
} from './types'
import { countWords } from './wordCounter'

// ============================================================
// fast-xml-parser preserveOrder:true node type
// ============================================================

// Use Record<string, unknown> to be compatible with inlineTagExtractor's public API
type XmlNode = Record<string, unknown>

// ============================================================
// Parser configuration (fast-xml-parser v5.3.6)
// ============================================================

function buildParser(): XMLParser {
  return new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: false,
    textNodeName: '#text',
    cdataPropName: '__cdata',
    allowBooleanAttributes: true,
    isArray: (name: string) =>
      [
        'trans-unit',
        'group',
        'file',
        'mrk',
        'note',
        'g',
        'x',
        'ph',
        'bx',
        'ex',
        'bpt',
        'ept',
        'sdl:seg',
        'sdl:seg-defs',
      ].includes(name),
  })
}

// ============================================================
// Public parse function
// ============================================================

/**
 * Parse SDLXLIFF or XLIFF 1.2 XML content into structured segments.
 * Pure function — no DB access, no side effects.
 *
 * @param xmlContent - raw XML string
 * @param fileType - 'sdlxliff' or 'xliff'
 * @param fileSizeBytes - optional, used for 15MB guard
 */
export function parseXliff(
  xmlContent: string,
  _fileType: 'sdlxliff' | 'xliff' = 'xliff', // content detection used for result; param reserved for future format divergence
  fileSizeBytes?: number,
): ParseOutcome {
  // 5.10 — 15MB size guard (defense-in-depth)
  const byteSize = fileSizeBytes ?? Buffer.byteLength(xmlContent, 'utf8')
  if (byteSize > MAX_PARSE_SIZE_BYTES) {
    return {
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `File too large for processing (max 15MB). Please split the file in your CAT tool`,
        details: `File size: ${byteSize} bytes`,
      },
    }
  }

  // 5.11 — Parse XML
  const parser = buildParser()
  let root: XmlNode[]
  try {
    root = parser.parse(xmlContent) as XmlNode[]
  } catch (err) {
    // Note: fast-xml-parser is lenient and rarely throws on malformed XML — it returns
    // an empty/partial parse tree instead. This catch handles encoding declaration errors
    // or XMLParser configuration issues. Structural errors (missing <xliff> root) are
    // caught below via INVALID_STRUCTURE. This branch can be reached by mocking
    // XMLParser.parse() in tests to simulate rare parser failures.
    return {
      success: false,
      error: {
        code: 'INVALID_XML',
        message: `Invalid file format — could not parse XML structure`,
        details: err instanceof Error ? err.message : String(err),
      },
    }
  }

  // 5.3 — Walk <file> elements
  const xliffEl = findElement(root, 'xliff')
  if (!xliffEl) {
    return {
      success: false,
      error: {
        code: 'INVALID_STRUCTURE',
        message: `Invalid file format — missing <xliff> root element`,
      },
    }
  }

  const xliffChildren = getChildren(xliffEl, 'xliff')
  const fileElements = xliffChildren.filter((n) => getTagName(n) === 'file')

  if (fileElements.length === 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_STRUCTURE',
        message: `Invalid file format — no <file> elements found`,
      },
    }
  }

  const segments: ParsedSegment[] = []
  let segmentNumber = 1
  let globalSourceLang = ''
  let globalTargetLang = ''

  for (const fileEl of fileElements) {
    const fileAttrs = getAttrs(fileEl)
    const sourceLang = fileAttrs['@_source-language'] ?? ''
    const targetLang = fileAttrs['@_target-language'] ?? ''

    if (!globalSourceLang) globalSourceLang = sourceLang
    if (!globalTargetLang) globalTargetLang = targetLang

    // Walk body → group(s) → trans-unit(s)
    const fileChildren = getChildren(fileEl, 'file')
    const bodyEl = fileChildren.find((n) => getTagName(n) === 'body')
    if (!bodyEl) continue

    const bodyChildren = getChildren(bodyEl, 'body')
    const transUnits = collectTransUnits(bodyChildren)

    // 5.4 — Process each trans-unit
    for (const tuEl of transUnits) {
      const tuSegments = extractTransUnitSegments(tuEl, sourceLang, targetLang, segmentNumber)

      if (!tuSegments.success) return tuSegments

      for (const seg of tuSegments.data) {
        segments.push(seg)
        segmentNumber++
      }
    }
  }

  return {
    success: true,
    data: {
      segments,
      sourceLang: globalSourceLang,
      targetLang: globalTargetLang,
      fileType: hasSdlNamespace(xmlContent) ? 'sdlxliff' : 'xliff',
      segmentCount: segments.length,
    },
  }
}

// ============================================================
// Trans-unit processing
// ============================================================

type TransUnitResult =
  | { success: true; data: ParsedSegment[] }
  | { success: false; error: ParserError }

function extractTransUnitSegments(
  tuEl: XmlNode,
  sourceLang: string,
  targetLang: string,
  startNumber: number,
): TransUnitResult {
  const tuChildren = getChildren(tuEl, 'trans-unit')
  const result: ParsedSegment[] = []

  // 5.5-5.6 — Collect sdl:seg metadata (conf, percent, translatorComment)
  const sdlSegMeta = extractSdlSegMeta(tuChildren)

  // Check for SDLXLIFF seg-source with mrk elements (5.4a)
  const segSourceEl = tuChildren.find((n) => getTagName(n) === 'seg-source')
  const targetEl = tuChildren.find((n) => getTagName(n) === 'target')

  if (segSourceEl) {
    // 5.9 — SDLXLIFF: iterate <mrk mtype="seg" mid="N"> elements
    const segSourceChildren = getChildren(segSourceEl, 'seg-source')
    const mrkElements = segSourceChildren.filter((n) => {
      if (getTagName(n) !== 'mrk') return false
      const attrs = getAttrs(n)
      return attrs['@_mtype'] === 'seg'
    })

    // Collect target mrk elements for matching
    const targetMrkMap = buildTargetMrkMap(targetEl)

    let localNum = startNumber
    for (const mrkEl of mrkElements) {
      const attrs = getAttrs(mrkEl)
      const mid = attrs['@_mid'] ?? '0'

      // Extract source text and tags from mrk
      const srcChildren = getChildren(mrkEl, 'mrk')
      const srcExtract = extractInlineTags(srcChildren as Parameters<typeof extractInlineTags>[0])
      if (!srcExtract.success) return srcExtract

      // Extract target text from matching target mrk
      const tgtChildren = targetMrkMap.get(mid) ?? []
      const tgtExtract = extractInlineTags(tgtChildren as Parameters<typeof extractInlineTags>[0])
      if (!tgtExtract.success) return tgtExtract

      // Get sdl:seg metadata for this mrk
      const meta = sdlSegMeta.get(mid)
      const confirmationState = meta?.conf ?? null
      const matchPercentage = meta?.percent ?? null
      const translatorComment = meta?.comment ?? null

      const segment: ParsedSegment = {
        segmentId: mid,
        segmentNumber: localNum,
        sourceText: srcExtract.plainText,
        targetText: tgtExtract.plainText,
        sourceLang,
        targetLang,
        confirmationState,
        matchPercentage,
        translatorComment,
        inlineTags:
          srcExtract.tags.length > 0 || tgtExtract.tags.length > 0
            ? { source: srcExtract.tags, target: tgtExtract.tags }
            : null,
        wordCount: countWords(srcExtract.plainText, sourceLang),
      }

      result.push(segment)
      localNum++
    }
  } else {
    // 5.4c — Plain XLIFF: single segment per trans-unit
    const sourceEl = tuChildren.find((n) => getTagName(n) === 'source')
    if (!sourceEl) return { success: true, data: [] }

    const srcChildren = getChildren(sourceEl, 'source')
    const srcExtract = extractInlineTags(srcChildren as Parameters<typeof extractInlineTags>[0])
    if (!srcExtract.success) return srcExtract

    const tgtChildren = targetEl ? getChildren(targetEl, 'target') : []
    const tgtExtract = extractInlineTags(tgtChildren as Parameters<typeof extractInlineTags>[0])
    if (!tgtExtract.success) return tgtExtract

    // 5.7 — XLIFF <target state=""> → confirmationState
    const tgtAttrs = targetEl ? getAttrs(targetEl) : {}
    const xliffState = tgtAttrs['@_state'] as XliffState | undefined
    const confirmationState = xliffState ? (XLIFF_STATE_MAP[xliffState] ?? null) : null

    // 5.8 — XLIFF <note> elements → translatorComment
    const translatorComment = extractXliffNotes(tuChildren)

    // H13: Use trans-unit @_id as segmentId for XLIFF (mirrors SDLXLIFF mrk mid usage)
    const tuAttrs = getAttrs(tuEl)
    const segment: ParsedSegment = {
      segmentId: tuAttrs['@_id'] ?? String(startNumber),
      segmentNumber: startNumber,
      sourceText: srcExtract.plainText,
      targetText: tgtExtract.plainText,
      sourceLang,
      targetLang,
      confirmationState,
      matchPercentage: null,
      translatorComment,
      inlineTags:
        srcExtract.tags.length > 0 || tgtExtract.tags.length > 0
          ? { source: srcExtract.tags, target: tgtExtract.tags }
          : null,
      wordCount: countWords(srcExtract.plainText, sourceLang),
    }

    result.push(segment)
  }

  return { success: true, data: result }
}

// ============================================================
// SDLXLIFF metadata extraction
// ============================================================

type SdlSegMeta = {
  conf: ConfirmationState | null
  percent: number | null
  comment: string | null
}

function extractSdlSegMeta(tuChildren: XmlNode[]): Map<string, SdlSegMeta> {
  const map = new Map<string, SdlSegMeta>()

  const segDefsEl = tuChildren.find((n) => getTagName(n) === 'sdl:seg-defs')
  if (!segDefsEl) return map

  const segDefsChildren = getChildren(segDefsEl, 'sdl:seg-defs')
  const sdlSegs = segDefsChildren.filter((n) => getTagName(n) === 'sdl:seg')

  for (const sdlSeg of sdlSegs) {
    const attrs = getAttrs(sdlSeg)
    const id = attrs['@_id'] ?? ''
    const confRaw = attrs['@_conf']
    const percentRaw = attrs['@_percent']

    const conf = isValidConfirmationState(confRaw) ? confRaw : null

    // M4: Clamp matchPercentage to valid 0-100 range (defense against malformed files)
    const parsedPercent = percentRaw !== undefined ? parseInt(percentRaw, 10) : null
    const percent =
      parsedPercent !== null && !Number.isNaN(parsedPercent)
        ? Math.min(100, Math.max(0, parsedPercent))
        : null

    // Extract sdl:cmt comment
    const sdlSegChildren = getChildren(sdlSeg, 'sdl:seg')
    const comment = extractSdlComment(sdlSegChildren)

    map.set(id, { conf, percent, comment })
  }

  return map
}

function extractSdlComment(children: XmlNode[]): string | null {
  const cmtEl = children.find((n) => getTagName(n) === 'sdl:cmt')
  if (!cmtEl) return null

  const cmtChildren = getChildren(cmtEl, 'sdl:cmt')
  const text = extractTextContent(cmtChildren)
  return text || null
}

// ============================================================
// XLIFF note extraction
// ============================================================

function extractXliffNotes(tuChildren: XmlNode[]): string | null {
  const noteEls = tuChildren.filter((n) => getTagName(n) === 'note')
  if (noteEls.length === 0) return null

  const notes = noteEls
    .map((noteEl) => {
      const noteChildren = getChildren(noteEl, 'note')
      return extractTextContent(noteChildren)
    })
    .filter(Boolean)

  return notes.length > 0 ? notes.join(COMMENT_SEPARATOR) : null
}

// ============================================================
// Target mrk map building
// ============================================================

function buildTargetMrkMap(targetEl: XmlNode | undefined): Map<string, XmlNode[]> {
  const map = new Map<string, XmlNode[]>()
  if (!targetEl) return map

  const targetChildren = getChildren(targetEl, 'target')
  const mrkEls = targetChildren.filter((n) => {
    if (getTagName(n) !== 'mrk') return false
    const attrs = getAttrs(n)
    return attrs['@_mtype'] === 'seg'
  })

  for (const mrkEl of mrkEls) {
    const mid = getAttrs(mrkEl)['@_mid'] ?? ''
    map.set(mid, getChildren(mrkEl, 'mrk'))
  }

  return map
}

// ============================================================
// Tree traversal helpers
// ============================================================

function collectTransUnits(nodes: XmlNode[]): XmlNode[] {
  const units: XmlNode[] = []
  for (const node of nodes) {
    const tag = getTagName(node)
    if (tag === 'trans-unit') {
      units.push(node)
    } else if (tag === 'group') {
      const groupChildren = getChildren(node, 'group')
      units.push(...collectTransUnits(groupChildren))
    }
  }
  return units
}

function findElement(nodes: XmlNode[], tagName: string): XmlNode | undefined {
  for (const node of nodes) {
    if (getTagName(node) === tagName) return node
    // Recurse into children (for declaration nodes like `?xml`)
    const children = getAnyChildren(node)
    if (children.length > 0) {
      const found = findElement(children, tagName)
      if (found) return found
    }
  }
  return undefined
}

function getTagName(node: XmlNode): string | undefined {
  const keys = Object.keys(node).filter((k) => k !== ':@' && k !== '#text')
  return keys[0]
}

function getChildren(node: XmlNode, tagName: string): XmlNode[] {
  const children = (node as Record<string, unknown>)[tagName]
  if (Array.isArray(children)) return children as XmlNode[]
  return []
}

function getAnyChildren(node: XmlNode): XmlNode[] {
  const tag = getTagName(node)
  if (!tag) return []
  return getChildren(node, tag)
}

function getAttrs(node: XmlNode): Record<string, string> {
  return (node[':@' as keyof typeof node] as Record<string, string>) ?? {}
}

function extractTextContent(nodes: XmlNode[]): string {
  return nodes
    .map((n) => {
      if ('#text' in n) return String(n['#text'] ?? '')
      return ''
    })
    .join('')
}

function isValidConfirmationState(value: string | undefined): value is ConfirmationState {
  if (!value) return false
  return (CONFIRMATION_STATES as readonly string[]).includes(value)
}

// Note: raw substring search is intentional — faster than re-parsing namespaces from the
// already-parsed tree. The SDL namespace URI is unique enough to avoid false positives.
function hasSdlNamespace(xmlContent: string): boolean {
  return xmlContent.includes(SDL_NAMESPACE_URI)
}
