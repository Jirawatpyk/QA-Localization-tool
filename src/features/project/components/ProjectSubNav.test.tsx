// Story 2.8: ProjectSubNav — data-tour attribute verification
//
// These tests guard against regressions where data-tour attributes on nav tabs are
// renamed or removed, which would silently break ProjectTour's driver.js element selectors.
//
// ProjectTour.tsx relies on:
//   [data-tour="project-glossary"] — step 1 (Import Glossary)
//   [data-tour="project-files"]    — step 2 (Upload Files)

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/projects/proj-abc/upload',
}))

import { ProjectSubNav } from './ProjectSubNav'

describe('ProjectSubNav', () => {
  it('should render [data-tour="project-glossary"] on the Glossary tab', () => {
    render(<ProjectSubNav projectId="proj-abc" />)
    const glossaryLink = screen.getByRole('link', { name: 'Glossary' })
    expect(glossaryLink.getAttribute('data-tour')).toBe('project-glossary')
  })

  it('should render [data-tour="project-files"] on the Files tab', () => {
    render(<ProjectSubNav projectId="proj-abc" />)
    const filesLink = screen.getByRole('link', { name: 'Files' })
    expect(filesLink.getAttribute('data-tour')).toBe('project-files')
  })

  it('should render all 6 navigation tabs', () => {
    render(<ProjectSubNav projectId="proj-abc" />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(6)
  })

  it('should NOT attach data-tour to Batches, History, Parity, or Settings tabs', () => {
    render(<ProjectSubNav projectId="proj-abc" />)
    for (const name of ['Batches', 'History', 'Parity', 'Settings']) {
      const link = screen.getByRole('link', { name })
      expect(link.getAttribute('data-tour')).toBeNull()
    }
  })
})
