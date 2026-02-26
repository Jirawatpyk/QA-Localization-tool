import type { GlossaryTermContext } from './types'

/**
 * Format glossary terms into a prompt section for AI context.
 *
 * Injects approved terminology so AI can:
 * - Flag segments where terms are mistranslated
 * - Check terminology consistency across segments
 * - Avoid flagging correct translations as errors
 *
 * Returns empty string if no glossary terms available.
 */
export function formatGlossaryContext(terms: GlossaryTermContext[]): string {
  if (terms.length === 0) return ''

  const termLines = terms.map((t) => {
    const caseMark = t.caseSensitive ? ' [case-sensitive]' : ''
    return `- "${t.sourceTerm}" → "${t.targetTerm}"${caseMark}`
  })

  return `## Approved Terminology (${terms.length} terms)

${termLines.join('\n')}

IMPORTANT: Flag any segment where these terms are mistranslated, missing, or inconsistently used. If a segment correctly uses an approved term, do NOT flag it as an error.`
}
