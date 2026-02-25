/// <reference types="vitest/globals" />
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the ParityResultsTable child component
vi.mock('./ParityResultsTable', () => ({
  ParityResultsTable: vi.fn(({ results }) => (
    <div data-testid="mock-parity-results">
      <span>{results.bothFound.length} both</span>
      <span>{results.toolOnly.length} tool</span>
      <span>{results.xbenchOnly.length} xbench</span>
    </div>
  )),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// Mock the comparison action (imports 'server-only')
type MockCompareResult =
  | {
      success: true
      data: {
        bothFound: Array<{
          id: string
          description: string
          segmentNumber: number
          severity: string
          category: string
        }>
        toolOnly: Array<{
          id: string
          description: string
          segmentNumber: number
          severity: string
          category: string
        }>
        xbenchOnly: Array<{
          id: string
          description: string
          segmentNumber: number
          severity: string
          category: string
        }>
      }
    }
  | { success: false; error: string }

const mockCompareWithXbench = vi.fn<(..._args: unknown[]) => Promise<MockCompareResult>>(
  async () => ({
    success: true,
    data: {
      bothFound: [
        {
          id: 'b1',
          description: 'Found in both',
          segmentNumber: 1,
          severity: 'major',
          category: 'accuracy',
        },
      ],
      toolOnly: [],
      xbenchOnly: [
        {
          id: 'x1',
          description: 'Xbench only finding',
          segmentNumber: 2,
          severity: 'minor',
          category: 'style',
        },
      ],
    },
  }),
)

vi.mock('../actions/compareWithXbench.action', () => ({
  compareWithXbench: (...args: unknown[]) => mockCompareWithXbench(...args),
}))

import { ParityComparisonView } from './ParityComparisonView'

const PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const FILE_ID = 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e'

function createXlsxFile(name = 'xbench-report.xlsx'): File {
  return new File(['fake-xlsx-content'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('ParityComparisonView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P2: Upload and compare flow ──

  it('[P2] should render upload zone for xlsx file', () => {
    // EXPECTED: An upload area accepting .xlsx files with label or instruction text
    render(<ParityComparisonView projectId={PROJECT_ID} fileId={FILE_ID} />)

    // Upload zone should have an input accepting xlsx
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.getAttribute('accept')).toContain('.xlsx')

    // Instructional text
    expect(screen.getByText(/Xbench/i)).toBeTruthy()
    expect(screen.getByText(/upload|drop|select/i)).toBeTruthy()
  })

  it('[P2] should render compare button that triggers comparison action', async () => {
    // EXPECTED: After selecting a file, a "Compare" button appears.
    // Clicking it calls the compareWithXbench server action.
    const user = userEvent.setup()
    render(<ParityComparisonView projectId={PROJECT_ID} fileId={FILE_ID} />)

    // Select a file
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = createXlsxFile()
    await user.upload(input, file)

    // Compare button should now be enabled
    const compareButton = screen.getByRole('button', { name: /Compare/i })
    expect(compareButton).toBeTruthy()
    expect(compareButton.hasAttribute('disabled')).toBe(false)

    await user.click(compareButton)

    await waitFor(() => {
      expect(mockCompareWithXbench).toHaveBeenCalledOnce()
    })
  })

  it('[P2] should display ParityResultsTable after comparison completes', async () => {
    // EXPECTED: After successful comparison, the ParityResultsTable renders with results
    const user = userEvent.setup()
    render(<ParityComparisonView projectId={PROJECT_ID} fileId={FILE_ID} />)

    // Select file and compare
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, createXlsxFile())
    await user.click(screen.getByRole('button', { name: /Compare/i }))

    await waitFor(() => {
      expect(screen.getByTestId('mock-parity-results')).toBeTruthy()
      expect(screen.getByText('1 both')).toBeTruthy()
      expect(screen.getByText('1 xbench')).toBeTruthy()
    })
  })

  it('[P2] should show loading state during comparison', async () => {
    // EXPECTED: While compareWithXbench is pending, show a loading indicator
    // and disable the compare button
    mockCompareWithXbench.mockImplementation(() => new Promise(() => {})) // never resolves
    const user = userEvent.setup()
    render(<ParityComparisonView projectId={PROJECT_ID} fileId={FILE_ID} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, createXlsxFile())
    await user.click(screen.getByRole('button', { name: /Compare/i }))

    await waitFor(() => {
      // Button should show loading state
      const button = screen.getByRole('button', { name: /Comparing|Loading/i })
      expect(button.hasAttribute('disabled')).toBe(true)
    })
  })

  it('[P2] should display error message when comparison fails', async () => {
    // EXPECTED: On action failure, show error message via toast or inline
    const { toast } = await import('sonner')
    mockCompareWithXbench.mockResolvedValue({
      success: false,
      error: 'Invalid Xbench report format',
    })
    const user = userEvent.setup()
    render(<ParityComparisonView projectId={PROJECT_ID} fileId={FILE_ID} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, createXlsxFile())
    await user.click(screen.getByRole('button', { name: /Compare/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid Xbench report format')
    })

    // Results table should NOT be shown
    expect(screen.queryByTestId('mock-parity-results')).toBeNull()
  })
})
