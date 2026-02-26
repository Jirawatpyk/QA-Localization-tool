import type { ProjectContext } from './types'

/**
 * Format project metadata into a prompt section for domain awareness.
 *
 * Gives AI context about:
 * - What the project is about (domain, content type)
 * - Language pair (affects formality, conventions)
 * - Processing mode (affects strictness expectations)
 *
 * Returns empty string only if project has no useful metadata.
 */
export function formatDomainContext(project: ProjectContext): string {
  const targetLang =
    project.targetLangs.length === 1 ? project.targetLangs[0] : project.targetLangs.join(', ')

  const lines: string[] = [
    `- **Project:** ${project.name}`,
    `- **Language pair:** ${project.sourceLang} → ${targetLang}`,
  ]

  if (project.description) {
    lines.push(`- **Domain/Context:** ${project.description}`)
  }

  const modeNote =
    project.processingMode === 'thorough'
      ? 'Thorough mode — apply strict quality standards, flag even minor style issues.'
      : 'Economy mode — focus on significant errors only, skip minor style preferences.'

  lines.push(`- **Mode:** ${modeNote}`)

  return `## Project Context

${lines.join('\n')}

Evaluate translations in the context of this specific project and domain. Consider domain-specific terminology and conventions when assessing quality.`
}
