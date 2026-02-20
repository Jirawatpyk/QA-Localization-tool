/**
 * Taxonomy seed: 36 unique QA Cosmetic → MQM mappings from docs/QA _ Quality Cosmetic.md
 * Run via: npx tsx src/db/seeds/taxonomySeed.ts
 */
import { eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'

type SeedEntry = {
  category: string
  parentCategory: string
  internalName: string
  severity: string
  description: string
  displayOrder: number
}

const SEED_ENTRIES: SeedEntry[] = [
  // ── Translation errors ─────────────────────────────────────────
  {
    category: 'Accuracy',
    parentCategory: 'Omission',
    internalName: 'Missing text',
    severity: 'critical',
    description:
      'Text present in source is absent from translation, changing meaning or causing incomplete output.',
    displayOrder: 1,
  },
  {
    category: 'Accuracy',
    parentCategory: 'Omission',
    internalName: 'Missing translation',
    severity: 'critical',
    description:
      'A source segment has no corresponding translated content, resulting in an untranslated unit.',
    displayOrder: 2,
  },
  {
    category: 'Fluency',
    parentCategory: 'Spelling',
    internalName: 'Misspelling/Typo (Thai)',
    severity: 'major',
    description: 'Words in the Thai translation contain spelling errors or typographical mistakes.',
    displayOrder: 3,
  },
  {
    category: 'Style',
    parentCategory: 'Formatting',
    internalName: 'Text format (bold, italic)',
    severity: 'minor',
    description:
      'Text formatting applied in the source (bold, italic, underline) is not replicated in the translation.',
    displayOrder: 4,
  },
  {
    category: 'Fluency',
    parentCategory: 'Punctuation',
    internalName: 'Punctuation',
    severity: 'major',
    description:
      'Punctuation marks are missing, incorrect, or do not follow target language conventions.',
    displayOrder: 5,
  },
  {
    category: 'Terminology',
    parentCategory: 'Inconsistency',
    internalName: 'Inconsistency of terms',
    severity: 'major',
    description:
      'The same term is translated differently across the document without justification.',
    displayOrder: 6,
  },
  {
    category: 'Style',
    parentCategory: 'Capitalization',
    internalName: 'Capitalization',
    severity: 'minor',
    description: 'Capitalization does not match the source or target language conventions.',
    displayOrder: 7,
  },
  {
    category: 'Style',
    parentCategory: 'Typography',
    internalName: 'Superscription and Subscription',
    severity: 'minor',
    description:
      'Superscript or subscript formatting is missing or incorrectly applied in the translation.',
    displayOrder: 8,
  },
  {
    category: 'Accuracy',
    parentCategory: 'Number',
    internalName: 'Symbol and Numbering',
    severity: 'major',
    description: 'Numeric values, symbols, or numbering sequences differ from the source.',
    displayOrder: 9,
  },
  {
    category: 'Locale Convention',
    parentCategory: 'Layout',
    internalName: 'Improper Margins',
    severity: 'minor',
    description:
      'Text margins do not match the source layout, affecting readability and visual presentation.',
    displayOrder: 10,
  },
  // ── Text display errors ────────────────────────────────────────
  {
    category: 'Accuracy',
    parentCategory: 'Untranslated',
    internalName: 'Text not localized',
    severity: 'major',
    description: 'Source text appears in the target document without being translated.',
    displayOrder: 11,
  },
  {
    category: 'Locale Convention',
    parentCategory: 'Truncation',
    internalName: 'Texts truncated',
    severity: 'critical',
    description:
      'Translated text is cut off due to space constraints, resulting in incomplete content.',
    displayOrder: 12,
  },
  {
    category: 'Locale Convention',
    parentCategory: 'Layout',
    internalName: 'Texts incorrectly positioned',
    severity: 'major',
    description: 'Translated text is placed in the wrong position relative to the source layout.',
    displayOrder: 13,
  },
  {
    category: 'Locale Convention',
    parentCategory: 'Layout',
    internalName: 'Texts displayed incorrectly',
    severity: 'major',
    description:
      'Text rendering issues cause translation to display incorrectly on screen or in print.',
    displayOrder: 14,
  },
  {
    category: 'Accuracy',
    parentCategory: 'Tag',
    internalName: 'Incorrect Tag codes',
    severity: 'critical',
    description:
      'Formatting tags (e.g., HTML, XML, XLIFF placeholders) are missing, altered, or incorrectly placed.',
    displayOrder: 15,
  },
  {
    category: 'Style',
    parentCategory: 'Whitespace',
    internalName: 'Unnecessary space',
    severity: 'minor',
    description:
      'Extra whitespace characters appear in the translation that are not present in the source.',
    displayOrder: 16,
  },
  {
    category: 'Style',
    parentCategory: 'Formatting',
    internalName: 'Alignments incorrect',
    severity: 'minor',
    description: 'Text alignment (left, center, right) does not match the source document layout.',
    displayOrder: 17,
  },
  {
    category: 'Fluency',
    parentCategory: 'Typography',
    internalName: 'Incorrect line break (Thai)',
    severity: 'major',
    description:
      'Line breaks in Thai text occur at grammatically or contextually inappropriate positions.',
    displayOrder: 18,
  },
  // ── Spacing errors ─────────────────────────────────────────────
  {
    category: 'Style',
    parentCategory: 'Whitespace',
    internalName: 'Inconsistent Line Spacing',
    severity: 'minor',
    description: 'Line spacing varies inconsistently from the source document formatting.',
    displayOrder: 19,
  },
  // ── Typo errors ────────────────────────────────────────────────
  {
    category: 'Fluency',
    parentCategory: 'Spelling',
    internalName: 'Spelling Errors (Thai & English)',
    severity: 'major',
    description: 'Words in the translation (Thai or English) are misspelled.',
    displayOrder: 20,
  },
  {
    category: 'Accuracy',
    parentCategory: 'Number',
    internalName: 'Numeric Mistakes',
    severity: 'critical',
    description:
      'Numeric values are incorrect, transposed, or formatted differently from the source.',
    displayOrder: 21,
  },
  // ── Tag errors ─────────────────────────────────────────────────
  {
    category: 'Accuracy',
    parentCategory: 'Tag',
    internalName: 'Tag not same as source',
    severity: 'critical',
    description:
      'Tags in the translation differ from the corresponding source tags in type, order, or content.',
    displayOrder: 22,
  },
  // ── Formatting errors ──────────────────────────────────────────
  {
    category: 'Style',
    parentCategory: 'Formatting',
    internalName: 'Inconsistent Font Usage',
    severity: 'minor',
    description: 'Different fonts are used inconsistently across the translated document.',
    displayOrder: 23,
  },
  {
    category: 'Style',
    parentCategory: 'Formatting',
    internalName: 'Formatting/Graphics General Format',
    severity: 'major',
    description: 'General formatting or graphics do not match the source document appearance.',
    displayOrder: 24,
  },
  {
    category: 'Style',
    parentCategory: 'Formatting',
    internalName: 'Overall format not matching source',
    severity: 'major',
    description:
      'The overall document layout and formatting deviate significantly from the source.',
    displayOrder: 25,
  },
  {
    category: 'Style',
    parentCategory: 'Formatting',
    internalName: 'Format/color/graphics not correct',
    severity: 'major',
    description:
      'Colors, graphic elements, or formatting properties do not match the source specifications.',
    displayOrder: 26,
  },
  {
    category: 'Style',
    parentCategory: 'Formatting',
    internalName: 'Font/Bullet not matching',
    severity: 'minor',
    description: 'Bullet styles or font choices do not match those used in the source document.',
    displayOrder: 27,
  },
  {
    category: 'Style',
    parentCategory: 'Typography',
    internalName: 'Inconsistent quotes style',
    severity: 'minor',
    description:
      'Quotation mark styles are inconsistent or do not follow target language typography conventions.',
    displayOrder: 28,
  },
  {
    category: 'Style',
    parentCategory: 'Formatting',
    internalName: 'Table/graphic fonts inconsistent',
    severity: 'minor',
    description:
      'Fonts used in tables or graphics differ from those in the surrounding translated text.',
    displayOrder: 29,
  },
  {
    category: 'Style',
    parentCategory: 'Formatting',
    internalName: 'Headings not uniform',
    severity: 'major',
    description: 'Heading styles are inconsistently formatted across the translated document.',
    displayOrder: 30,
  },
  {
    category: 'Style',
    parentCategory: 'Layout',
    internalName: 'Headings not above graphics',
    severity: 'major',
    description: 'Section headings are not positioned correctly above their associated graphics.',
    displayOrder: 31,
  },
  {
    category: 'Style',
    parentCategory: 'Formatting',
    internalName: 'Fonts in graphics inconsistent',
    severity: 'minor',
    description: 'Fonts embedded in graphics do not match the style of other translated text.',
    displayOrder: 32,
  },
  {
    category: 'Locale Convention',
    parentCategory: 'Layout',
    internalName: 'Graphics/tables not visible',
    severity: 'critical',
    description:
      'Graphics or table elements are hidden, missing, or not rendering in the translated file.',
    displayOrder: 33,
  },
  {
    category: 'Locale Convention',
    parentCategory: 'Layout',
    internalName: 'Graphics cover text',
    severity: 'critical',
    description: 'Graphic elements overlap and obscure translated text, making it unreadable.',
    displayOrder: 34,
  },
  {
    category: 'Locale Convention',
    parentCategory: 'Layout',
    internalName: 'Graphics misplaced',
    severity: 'major',
    description:
      'Graphic elements are positioned incorrectly relative to their associated translated content.',
    displayOrder: 35,
  },
  {
    category: 'Locale Convention',
    parentCategory: 'Layout',
    internalName: 'Text in graphics not visible',
    severity: 'critical',
    description:
      'Text embedded within graphics is not visible or is missing in the translated output.',
    displayOrder: 36,
  },
]

/**
 * Idempotent: skips entries where internal_name already exists.
 */
export async function seedTaxonomy() {
  console.log('[taxonomy-seed] Starting taxonomy seed...')

  let inserted = 0
  let skipped = 0

  for (const entry of SEED_ENTRIES) {
    const existing = await db
      .select({ id: taxonomyDefinitions.id })
      .from(taxonomyDefinitions)
      .where(eq(taxonomyDefinitions.internalName, entry.internalName))
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    await db.insert(taxonomyDefinitions).values({
      category: entry.category,
      parentCategory: entry.parentCategory,
      internalName: entry.internalName,
      severity: entry.severity,
      description: entry.description,
      isCustom: false,
      isActive: true,
      displayOrder: entry.displayOrder,
    })

    inserted++
  }

  console.log(`[taxonomy-seed] Done — inserted: ${inserted}, skipped (already exist): ${skipped}`)
}

// Allow direct invocation: npx tsx src/db/seeds/taxonomySeed.ts
if (require.main === module) {
  seedTaxonomy()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[taxonomy-seed] Error:', err)
      process.exit(1)
    })
}
