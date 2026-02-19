import { XMLParser } from 'fast-xml-parser'

import { IMPORT_ERROR_CODES } from '@/features/glossary/types'
import type { ImportError, ParsedTerm } from '@/features/glossary/types'

type TbxParseResult = {
  terms: ParsedTerm[]
  errors: ImportError[]
}

/**
 * Parse a TBX (TermBase eXchange) XML string into glossary terms.
 * Extracts only the source/target language pair matching the glossary config.
 */
export function parseTbx(xmlText: string, sourceLang: string, targetLang: string): TbxParseResult {
  const terms: ParsedTerm[] = []
  const errors: ImportError[] = []

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'termEntry' || name === 'langSet',
  })

  let parsed: Record<string, unknown>
  try {
    parsed = parser.parse(xmlText) as Record<string, unknown>
  } catch {
    errors.push({
      line: 1,
      reason: 'Failed to parse TBX XML',
      code: IMPORT_ERROR_CODES.ParseError,
    })
    return { terms, errors }
  }

  const martif = parsed['martif'] as Record<string, unknown> | undefined
  if (!martif) {
    errors.push({
      line: 1,
      reason: 'Invalid TBX: missing <martif> root element',
      code: IMPORT_ERROR_CODES.InvalidFormat,
    })
    return { terms, errors }
  }

  // TBX spec: <body> can be directly under <martif> or wrapped in <text>
  // Standard TBX: <martif><body>...
  // Microsoft TBX: <martif><text><body>...
  const textNode = martif['text'] as Record<string, unknown> | undefined
  const body = (textNode?.['body'] ?? martif['body']) as Record<string, unknown> | undefined
  if (!body) {
    errors.push({
      line: 1,
      reason: 'Invalid TBX: missing <body> element',
      code: IMPORT_ERROR_CODES.InvalidFormat,
    })
    return { terms, errors }
  }

  const termEntries = body['termEntry'] as Array<Record<string, unknown>> | undefined
  if (!termEntries || termEntries.length === 0) {
    return { terms, errors }
  }

  const normalizedSourceLang = sourceLang.toLowerCase()
  const normalizedTargetLang = targetLang.toLowerCase()

  for (let i = 0; i < termEntries.length; i++) {
    const entry = termEntries[i]
    if (!entry) continue

    const lineNumber = i + 1
    const langSets = entry['langSet'] as Array<Record<string, unknown>> | undefined

    if (!langSets || langSets.length === 0) {
      errors.push({
        line: lineNumber,
        reason: 'No langSet found in termEntry',
        code: IMPORT_ERROR_CODES.InvalidPair,
      })
      continue
    }

    let sourceTermText: string | undefined
    let targetTermText: string | undefined

    for (const langSet of langSets) {
      const xmlLang = (langSet['@_xml:lang'] as string | undefined)?.toLowerCase()
      if (!xmlLang) continue

      const termText = extractTermText(langSet)

      // Prefer exact match; prefix match only sets if nothing found yet
      if (matchLangTag(xmlLang, normalizedSourceLang)) {
        if (sourceTermText === undefined || xmlLang === normalizedSourceLang) {
          sourceTermText = termText
        }
      } else if (matchLangTag(xmlLang, normalizedTargetLang)) {
        if (targetTermText === undefined || xmlLang === normalizedTargetLang) {
          targetTermText = termText
        }
      }
    }

    if (sourceTermText === undefined) {
      errors.push({
        line: lineNumber,
        reason: `Source language "${sourceLang}" not found in termEntry`,
        code: IMPORT_ERROR_CODES.InvalidPair,
      })
      continue
    }

    if (targetTermText === undefined) {
      errors.push({
        line: lineNumber,
        reason: `Target language "${targetLang}" not found in termEntry`,
        code: IMPORT_ERROR_CODES.InvalidPair,
      })
      continue
    }

    // Coerce to string — fast-xml-parser may return numbers for numeric terms
    const sourceTerm = String(sourceTermText).trim().normalize('NFKC')
    const targetTerm = String(targetTermText).trim().normalize('NFKC')

    if (sourceTerm.length === 0) {
      errors.push({
        line: lineNumber,
        reason: 'Source term is empty',
        code: IMPORT_ERROR_CODES.EmptySource,
      })
      continue
    }

    if (targetTerm.length === 0) {
      errors.push({
        line: lineNumber,
        reason: 'Target term is missing',
        code: IMPORT_ERROR_CODES.EmptyTarget,
      })
      continue
    }

    terms.push({ sourceTerm, targetTerm, lineNumber })
  }

  return { terms, errors }
}

/**
 * Match BCP47 language tags with prefix support.
 * 'en-us' matches 'en', 'en' matches 'en-us', 'zh-hans' matches 'zh-hans'.
 * Comparison is case-insensitive (both args should be lowercased).
 */
function matchLangTag(xmlLang: string, requestedLang: string): boolean {
  if (xmlLang === requestedLang) return true
  // xml:lang is more specific: "en-us" starts with requested "en"
  if (xmlLang.startsWith(requestedLang + '-')) return true
  // requested is more specific: "en-us" starts with xml:lang "en"
  if (requestedLang.startsWith(xmlLang + '-')) return true
  return false
}

/**
 * Extract term text from a langSet element.
 * TBX supports: langSet > tig > term, or langSet > ntig > termGrp > term
 */
function extractTermText(langSet: Record<string, unknown>): string | undefined {
  // Try tig > term (common TBX structure)
  const tig = langSet['tig'] as Record<string, unknown> | undefined
  if (tig) {
    const termValue = extractTermValue(tig['term'])
    if (termValue !== undefined) return termValue
  }

  // Try ntig > termGrp > term (alternative TBX structure, used by Microsoft Terminology)
  const ntig = langSet['ntig'] as Record<string, unknown> | undefined
  if (ntig) {
    const termGrp = ntig['termGrp'] as Record<string, unknown> | undefined
    if (termGrp) {
      const termValue = extractTermValue(termGrp['term'])
      if (termValue !== undefined) return termValue
    }
  }

  return undefined
}

/**
 * Extract string value from a parsed term node.
 * Handles: string, number (fast-xml-parser coerces numeric content),
 * or object with #text (when term element has attributes like @_id).
 */
function extractTermValue(term: unknown): string | undefined {
  if (typeof term === 'string') return term
  if (typeof term === 'number') return String(term)
  if (typeof term === 'object' && term !== null) {
    const text = (term as Record<string, unknown>)['#text']
    if (typeof text === 'string') return text
    if (typeof text === 'number') return String(text)
  }
  return undefined
}
