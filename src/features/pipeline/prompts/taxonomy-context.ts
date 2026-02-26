import type { TaxonomyCategoryContext } from './types'

/**
 * Format MQM taxonomy categories into a prompt section.
 *
 * Constrains AI output to ONLY use categories from the active taxonomy.
 * This prevents AI from inventing categories not in the DB schema,
 * which would cause mapping failures during finding persistence.
 *
 * Returns empty string if no categories available (fallback to generic).
 */
export function formatTaxonomyContext(categories: TaxonomyCategoryContext[]): string {
  if (categories.length === 0) return ''

  // Group by parent for hierarchical display
  const roots = categories.filter((c) => !c.parentCategory)
  const children = categories.filter((c) => c.parentCategory)
  const childMap = new Map<string, TaxonomyCategoryContext[]>()

  for (const child of children) {
    const key = child.parentCategory!
    const existing = childMap.get(key) ?? []
    existing.push(child)
    childMap.set(key, existing)
  }

  const lines: string[] = []
  for (const root of roots) {
    lines.push(
      `- **${root.category}** (default severity: ${root.severity ?? 'minor'}): ${root.description}`,
    )
    const kids = childMap.get(root.category)
    if (kids) {
      for (const kid of kids) {
        lines.push(`  - ${kid.category} (${kid.severity ?? 'minor'}): ${kid.description}`)
      }
    }
  }

  // Add orphan children (parent not in active categories)
  const rootNames = new Set(roots.map((r) => r.category))
  for (const [parent, kids] of childMap) {
    if (rootNames.has(parent)) continue
    for (const kid of kids) {
      lines.push(
        `- ${kid.category} (parent: ${parent}, ${kid.severity ?? 'minor'}): ${kid.description}`,
      )
    }
  }

  const validNames = categories.map((c) => `"${c.category}"`).join(', ')

  return `## MQM Error Taxonomy

${lines.join('\n')}

IMPORTANT: Your findings MUST use category names from this list EXACTLY: ${validNames}.
Do NOT invent new categories. If an issue does not fit any category, use the closest match.`
}

/**
 * Extract valid category names for Zod schema enum validation.
 * Used to dynamically constrain AI output schema.
 */
export function getValidCategoryNames(categories: TaxonomyCategoryContext[]): string[] {
  return categories.map((c) => c.category)
}
