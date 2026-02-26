import { formatDomainContext } from './domain-context'
import { formatFewShotExamples } from './few-shot-examples'
import { formatGlossaryContext } from './glossary-context'
import { getLanguageInstructions } from './language-instructions'
import { formatTaxonomyContext } from './taxonomy-context'
import type { L2PromptInput, PriorFinding, PromptSegment } from './types'

/**
 * Build the complete L2 AI screening prompt.
 *
 * Assembles all context modules into a structured prompt:
 * 1. System role + focus areas
 * 2. Domain context (project metadata)
 * 3. Taxonomy constraints (valid categories)
 * 4. Glossary terms (approved terminology)
 * 5. Language-specific instructions
 * 6. Few-shot calibration examples
 * 7. Confidence scoring instructions
 * 8. Segments to analyze
 * 9. L1 findings to avoid duplicating
 *
 * All sections are optional — if data is empty, section is omitted.
 * This keeps prompts lean when context is unavailable.
 */
export function buildL2Prompt(input: L2PromptInput): string {
  const targetLang = input.segments[0]?.targetLang ?? input.project.targetLangs[0] ?? ''

  const sections: string[] = [
    // 1. System role
    SYSTEM_ROLE_L2,

    // 2. Domain context
    formatDomainContext(input.project),

    // 3. Taxonomy
    formatTaxonomyContext(input.taxonomyCategories),

    // 4. Glossary
    formatGlossaryContext(input.glossaryTerms),

    // 5. Language instructions
    getLanguageInstructions(targetLang),

    // 6. Few-shot examples (limit to 5 for L2 — keep prompt lean)
    formatFewShotExamples(5),

    // 7. Confidence instructions
    CONFIDENCE_INSTRUCTIONS_L2,

    // 8. Output format
    OUTPUT_FORMAT_L2,

    // 9. Segments
    formatSegments(input.segments),

    // 10. L1 findings context
    formatL1Findings(input.l1Findings),
  ]

  return sections.filter(Boolean).join('\n\n')
}

// ── Static Sections ──

const SYSTEM_ROLE_L2 = `You are a localization QA reviewer performing AI-powered screening (Layer 2).

Your job is to find SEMANTIC quality issues that deterministic rule-based checks (Layer 1) cannot catch. Layer 1 already checks: tags, placeholders, numbers, URLs, spacing, punctuation, glossary terms, and consistency.

Focus ONLY on issues L1 misses:
- **Accuracy:** Mistranslation, meaning distortion, omission, or addition of content
- **Fluency:** Unnatural phrasing, awkward grammar, readability issues in target language
- **Terminology:** Incorrect or inconsistent domain-specific terms (beyond glossary)
- **Style:** Register/tone mismatch, formality inconsistency, locale convention violations`

const CONFIDENCE_INSTRUCTIONS_L2 = `## Confidence Scoring

Rate your confidence (0-100) for each finding:
- **90-100:** Definite error — clear mistranslation, factual error, missing content
- **70-89:** Likely error — probable terminology/fluency issue, most reviewers would agree
- **50-69:** Possible issue — stylistic concern, ambiguous interpretation
- **Below 50:** Do NOT report — too uncertain for L2 screening

Only report findings with confidence >= 50. Quality over quantity.`

const OUTPUT_FORMAT_L2 = `## Output Format

For each issue found, return:
- **segmentId:** The exact segment ID from the input (e.g., "[abc-123]")
- **category:** Issue category from the taxonomy above
- **severity:** critical (meaning change/data loss), major (noticeable impact), minor (polish)
- **confidence:** 0-100 certainty score
- **description:** Clear explanation of what is wrong and why
- **suggestedFix:** Corrected translation or null if you are not confident in a fix

If no issues are found, return an empty findings array. Do NOT invent issues.`

// ── Formatting Helpers ──

function formatSegments(segments: PromptSegment[]): string {
  const text = segments
    .map(
      (s) =>
        `[${s.id}] (#${s.segmentNumber}, ${s.sourceLang}→${s.targetLang})\nSource: ${s.sourceText}\nTarget: ${s.targetText}`,
    )
    .join('\n\n')

  return `## Segments to Analyze (${segments.length} segments)\n\n${text}`
}

function formatL1Findings(l1Findings: PriorFinding[]): string {
  if (l1Findings.length === 0) return ''

  const text = l1Findings
    .map(
      (f) => `- [${f.segmentId ?? 'file-level'}] ${f.category} (${f.severity}): ${f.description}`,
    )
    .join('\n')

  return `## L1 Rule-based Findings Already Detected (${l1Findings.length} findings)

${text}

IMPORTANT: Do NOT duplicate these L1 findings. Focus on NEW issues that L1 rules did not catch.`
}
