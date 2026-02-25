/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildFinding } from '@/test/factories'

import { ParityResultsTable } from './ParityResultsTable'

// Type for parity comparison result (component not yet created)
type ParityFinding = {
  id: string
  description: string
  segmentNumber: number
  severity: string
  category: string
}

type ParityResults = {
  bothFound: ParityFinding[]
  toolOnly: ParityFinding[]
  xbenchOnly: ParityFinding[]
}

function buildParityFinding(overrides?: Partial<ParityFinding>): ParityFinding {
  const finding = buildFinding()
  return {
    id: finding.id,
    description: finding.description,
    segmentNumber: 42,
    severity: finding.severity,
    category: finding.category,
    ...overrides,
  }
}

const sampleResults: ParityResults = {
  bothFound: [
    buildParityFinding({ id: 'both-1', description: 'Missing closing tag', segmentNumber: 10 }),
    buildParityFinding({ id: 'both-2', description: 'Inconsistent term', segmentNumber: 25 }),
  ],
  toolOnly: [
    buildParityFinding({ id: 'tool-1', description: 'Thai particle mismatch', segmentNumber: 15 }),
  ],
  xbenchOnly: [
    buildParityFinding({ id: 'xbench-1', description: 'Number format error', segmentNumber: 30 }),
    buildParityFinding({ id: 'xbench-2', description: 'Capitalization issue', segmentNumber: 45 }),
    buildParityFinding({ id: 'xbench-3', description: 'Tag mismatch', segmentNumber: 50 }),
  ],
}

describe('ParityResultsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P2: Section rendering ──

  it.skip('[P2] should render three sections: Both Found, Tool Only, Xbench Only', () => {
    // EXPECTED: Three distinct sections with headings indicating comparison groups
    render(<ParityResultsTable results={sampleResults} />)

    expect(screen.getByRole('heading', { name: /Both Found/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Tool Only/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Xbench Only/i })).toBeTruthy()
  })

  it.skip('[P2] should highlight Xbench Only section with red/destructive color', () => {
    // EXPECTED: The Xbench Only section uses destructive/red styling to indicate
    // findings that our tool missed compared to Xbench (parity gap)
    render(<ParityResultsTable results={sampleResults} />)

    const xbenchHeading = screen.getByRole('heading', { name: /Xbench Only/i })
    const xbenchSection = xbenchHeading.closest('section') ?? xbenchHeading.parentElement!
    // Check for destructive/red semantic class on the section or heading
    expect(
      xbenchSection.className.match(/destructive|red|danger/) ??
        xbenchHeading.className.match(/destructive|red|danger/),
    ).toBeTruthy()
  })

  it.skip('[P2] should display Tool Only section with blue/info color', () => {
    // EXPECTED: Tool Only section uses info/blue styling to indicate
    // extra findings our tool detected that Xbench didn't
    render(<ParityResultsTable results={sampleResults} />)

    const toolHeading = screen.getByRole('heading', { name: /Tool Only/i })
    const toolSection = toolHeading.closest('section') ?? toolHeading.parentElement!
    expect(
      toolSection.className.match(/info|blue|primary/) ??
        toolHeading.className.match(/info|blue|primary/),
    ).toBeTruthy()
  })

  it.skip('[P2] should display Both Found section with green/success color', () => {
    // EXPECTED: Both Found section uses success/green styling to indicate
    // matching findings between our tool and Xbench (parity achieved)
    render(<ParityResultsTable results={sampleResults} />)

    const bothHeading = screen.getByRole('heading', { name: /Both Found/i })
    const bothSection = bothHeading.closest('section') ?? bothHeading.parentElement!
    expect(
      bothSection.className.match(/success|green/) ?? bothHeading.className.match(/success|green/),
    ).toBeTruthy()
  })

  it.skip('[P2] should show finding count per section', () => {
    // EXPECTED: Each section header shows the count of findings in parentheses or a badge
    // Both Found: 2, Tool Only: 1, Xbench Only: 3
    render(<ParityResultsTable results={sampleResults} />)

    const bothHeading = screen.getByRole('heading', { name: /Both Found/i })
    expect(bothHeading.textContent).toMatch(/2/)

    const toolHeading = screen.getByRole('heading', { name: /Tool Only/i })
    expect(toolHeading.textContent).toMatch(/1/)

    const xbenchHeading = screen.getByRole('heading', { name: /Xbench Only/i })
    expect(xbenchHeading.textContent).toMatch(/3/)
  })
})
