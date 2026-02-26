import { describe, expect, it } from 'vitest'

import { formatDomainContext } from '../domain-context'
import type { ProjectContext } from '../types'

describe('formatDomainContext', () => {
  const baseProject: ProjectContext = {
    name: 'My App',
    description: 'Mobile banking application for Thai market',
    sourceLang: 'en',
    targetLangs: ['th'],
    processingMode: 'economy',
  }

  it('should include project name and language pair', () => {
    const result = formatDomainContext(baseProject)

    expect(result).toContain('## Project Context')
    expect(result).toContain('**Project:** My App')
    expect(result).toContain('**Language pair:** en → th')
  })

  it('should include description when available', () => {
    const result = formatDomainContext(baseProject)

    expect(result).toContain('**Domain/Context:** Mobile banking application for Thai market')
  })

  it('should omit description line when null', () => {
    const project: ProjectContext = { ...baseProject, description: null }

    const result = formatDomainContext(project)

    expect(result).not.toContain('Domain/Context')
  })

  it('should show economy mode note for economy processing', () => {
    const result = formatDomainContext(baseProject)

    expect(result).toContain('Economy mode')
    expect(result).toContain('focus on significant errors only')
  })

  it('should show thorough mode note for thorough processing', () => {
    const project: ProjectContext = { ...baseProject, processingMode: 'thorough' }

    const result = formatDomainContext(project)

    expect(result).toContain('Thorough mode')
    expect(result).toContain('strict quality standards')
  })

  it('should join multiple target languages', () => {
    const project: ProjectContext = {
      ...baseProject,
      targetLangs: ['th', 'zh-CN', 'ja'],
    }

    const result = formatDomainContext(project)

    expect(result).toContain('en → th, zh-CN, ja')
  })

  it('should show single target language without comma', () => {
    const result = formatDomainContext(baseProject)

    expect(result).toContain('en → th')
    expect(result).not.toContain('en → th,')
  })
})
