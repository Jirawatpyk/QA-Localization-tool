import { formatDomainContext } from './domain-context'
import { formatFewShotExamples } from './few-shot-examples'
import { formatGlossaryContext } from './glossary-context'
import { getLanguageInstructions } from './language-instructions'
import { formatTaxonomyContext } from './taxonomy-context'
import type { L3PromptInput, PriorFinding, PromptSegment } from './types'

/**
 * Build the complete L3 deep AI analysis prompt.
 *
 * L3 is deeper and more expensive than L2. Key differences:
 * - Includes ALL prior findings (L1 + L2) with dedup instructions
 * - Stronger cross-layer deduplication guidance
 * - Requires rationale (reasoning chain) for every finding
 * - Full few-shot examples (all 7)
 * - Lower confidence threshold (allows more nuanced issues)
 * - Explicit instructions to confirm/contradict L2 findings
 */
export function buildL3Prompt(input: L3PromptInput): string {
  const targetLang = input.segments[0]?.targetLang ?? input.project.targetLangs[0] ?? ''

  const sections: string[] = [
    // 1. System role (deeper than L2)
    SYSTEM_ROLE_L3,

    // 2. Domain context
    formatDomainContext(input.project),

    // 3. Taxonomy
    formatTaxonomyContext(input.taxonomyCategories),

    // 4. Glossary
    formatGlossaryContext(input.glossaryTerms),

    // 5. Language instructions
    getLanguageInstructions(targetLang),

    // 6. Few-shot examples (all 7 for L3 — deeper analysis needs more calibration)
    formatFewShotExamples(),

    // 7. Confidence + rationale instructions
    CONFIDENCE_INSTRUCTIONS_L3,

    // 8. Cross-layer dedup instructions
    DEDUP_INSTRUCTIONS,

    // 9. Output format
    OUTPUT_FORMAT_L3,

    // 10. Segments
    formatSegments(input.segments),

    // 11. Prior findings (L1 + L2) with dedup context
    formatPriorFindings(input.priorFindings),
  ]

  return sections.filter(Boolean).join('\n\n')
}

// ── Static Sections ──

const SYSTEM_ROLE_L3 = `You are a senior localization QA specialist performing deep semantic analysis (Layer 3).

You are the final quality gate. Your analysis follows two prior layers:
- **Layer 1 (L1):** Deterministic rule-based checks (tags, numbers, placeholders, glossary, spacing)
- **Layer 2 (L2):** AI screening for semantic issues (accuracy, fluency, terminology, style)

Your role is to find subtle issues that BOTH L1 and L2 missed, AND to validate L2's findings:
- **Semantic accuracy:** Does the translation preserve the EXACT original meaning in context?
- **Cultural appropriateness:** Is the translation suitable for the target locale and audience?
- **Contextual fluency:** Does it read naturally considering surrounding segments?
- **Terminology precision:** Are domain-specific terms correctly and consistently translated?
- **Pragmatic equivalence:** Are speech acts, politeness levels, and register preserved?
- **Cross-segment consistency:** Are the same concepts translated the same way across segments?

You MUST provide detailed reasoning (rationale) for every finding.`

const CONFIDENCE_INSTRUCTIONS_L3 = `## Confidence Scoring & Rationale

Rate your confidence (0-100) for each finding:
- **90-100:** Definite error — clear evidence, no reasonable alternative interpretation
- **70-89:** Likely error — strong evidence, most expert reviewers would agree
- **50-69:** Possible issue — requires reviewer judgment, legitimate concern
- **30-49:** Low confidence — flag for review but acknowledge uncertainty

L3 allows findings with confidence >= 30 (lower than L2's threshold of 50) because deep analysis catches subtler issues that need human review.

IMPORTANT: Every finding MUST include a 'rationale' field explaining your reasoning step by step:
1. What you observed in the source
2. What you observed in the target
3. Why this is a quality issue
4. How severe the impact is`

const DEDUP_INSTRUCTIONS = `## Cross-Layer Deduplication

You will see prior findings from L1 and L2. Your responsibilities:

1. **Do NOT duplicate:** If L1 or L2 already flagged the EXACT same issue on the same segment, skip it
2. **Confirm or contradict L2:** If you agree with an L2 finding, do NOT re-report it (it's already captured). If you DISAGREE with an L2 finding (false positive), report it with category "false_positive_review" and explain why
3. **Deepen analysis:** If L2 found a surface issue but missed the root cause, report the deeper issue with reference to the L2 finding
4. **Find new issues:** Focus primarily on issues that BOTH L1 and L2 missed entirely`

const OUTPUT_FORMAT_L3 = `## Output Format

For each issue found, return:
- **segmentId:** The exact segment ID from the input
- **category:** Issue category from the taxonomy above
- **severity:** critical (meaning change/data loss), major (noticeable impact), minor (polish)
- **confidence:** 0-100 certainty score
- **description:** Clear explanation of what is wrong and why
- **suggestedFix:** Corrected translation or null if uncertain
- **rationale:** Step-by-step reasoning explaining your analysis (REQUIRED)

If no NEW issues are found beyond L1/L2, return an empty findings array. Quality over quantity.`

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

function formatPriorFindings(priorFindings: PriorFinding[]): string {
  if (priorFindings.length === 0) return ''

  const l1 = priorFindings.filter((f) => f.detectedByLayer === 'L1')
  const l2 = priorFindings.filter((f) => f.detectedByLayer === 'L2')

  const sections: string[] = []

  if (l1.length > 0) {
    sections.push(
      `### L1 Rule-based Findings (${l1.length}):\n${l1
        .map(
          (f) =>
            `- [${f.segmentId ?? 'file-level'}] ${f.category} (${f.severity}): ${f.description}`,
        )
        .join('\n')}`,
    )
  }

  if (l2.length > 0) {
    sections.push(
      `### L2 AI Screening Findings (${l2.length}):\n${l2
        .map(
          (f) =>
            `- [${f.segmentId ?? 'file-level'}] ${f.category} (${f.severity}): ${f.description}`,
        )
        .join('\n')}`,
    )
  }

  return `## Prior Findings from L1 + L2 (${priorFindings.length} total)

${sections.join('\n\n')}

CRITICAL: Do NOT duplicate these findings. Focus on NEW issues or re-evaluate L2 findings you disagree with.`
}
