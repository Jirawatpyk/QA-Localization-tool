/// <reference types="vitest/globals" />
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// Mock the server action (imports 'server-only')
type MockReportResult =
  | { success: true; data: { trackingReference: string } }
  | { success: false; error: string }

const mockReportMissingCheck = vi.fn<(..._args: unknown[]) => Promise<MockReportResult>>(
  async () => ({ success: true, data: { trackingReference: 'PAR-2026-00042' } }),
)

vi.mock('../actions/reportMissingCheck.action', () => ({
  reportMissingCheck: (...args: unknown[]) => mockReportMissingCheck(...args),
}))

import { ReportMissingCheckDialog } from './ReportMissingCheckDialog'

const PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const FILE_ID = 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e'

describe('ReportMissingCheckDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    projectId: PROJECT_ID,
    fileId: FILE_ID,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P2: Form fields ──

  it('[P2] should render form with fileReference, segmentNumber, description, checkType fields', () => {
    // EXPECTED: Dialog contains a form with 4 labeled fields:
    // 1. fileReference (text input - auto-populated or editable)
    // 2. segmentNumber (number input)
    // 3. description (textarea for describing the missing check)
    // 4. checkType (select/combobox for check category: e.g., "tag", "number", "term", "other")
    render(<ReportMissingCheckDialog {...defaultProps} />)

    // Dialog title
    expect(screen.getByRole('heading', { name: /Report Missing Check/i })).toBeTruthy()

    // Form fields by their accessible labels
    expect(screen.getByLabelText(/File Reference/i)).toBeTruthy()
    expect(screen.getByLabelText(/Segment Number/i)).toBeTruthy()
    expect(screen.getByLabelText(/Description/i)).toBeTruthy()
    expect(screen.getByLabelText(/Check Type/i)).toBeTruthy()
  })

  it('[P2] should validate required fields before submit', async () => {
    // EXPECTED: Submitting with empty required fields shows validation errors
    // and does NOT call the server action
    const user = userEvent.setup()
    render(<ReportMissingCheckDialog {...defaultProps} />)

    // Click submit without filling anything
    const submitButton = screen.getByRole('button', { name: /Submit|Report/i })
    await user.click(submitButton)

    await waitFor(() => {
      // Validation error messages should appear
      expect(screen.getByText(/required/i)).toBeTruthy()
      // Server action should NOT have been called
      expect(mockReportMissingCheck).not.toHaveBeenCalled()
    })
  })

  it('[P2] should call reportMissingCheck action on submit', async () => {
    // EXPECTED: After filling all required fields and submitting, the action is called
    // with the form data
    const user = userEvent.setup()
    render(<ReportMissingCheckDialog {...defaultProps} />)

    // Fill the form
    await user.type(screen.getByLabelText(/File Reference/i), 'chapter1.sdlxliff')
    await user.type(screen.getByLabelText(/Segment Number/i), '42')
    await user.type(
      screen.getByLabelText(/Description/i),
      'Missing number format check for Buddhist year',
    )

    // Select check type
    const checkTypeSelect = screen.getByLabelText(/Check Type/i)
    await user.click(checkTypeSelect)
    await user.click(screen.getByRole('option', { name: /number/i }))

    // Submit
    await user.click(screen.getByRole('button', { name: /Submit|Report/i }))

    await waitFor(() => {
      expect(mockReportMissingCheck).toHaveBeenCalledWith({
        projectId: PROJECT_ID,
        fileReference: expect.stringContaining('chapter1.sdlxliff'),
        segmentNumber: 42,
        expectedDescription: 'Missing number format check for Buddhist year',
        xbenchCheckType: 'number',
      })
    })
  })

  it('[P2] should show tracking reference in confirmation toast on success', async () => {
    // EXPECTED: After successful submission, a success toast shows the tracking reference
    const user = userEvent.setup()
    render(<ReportMissingCheckDialog {...defaultProps} />)

    // Fill required fields
    await user.type(screen.getByLabelText(/File Reference/i), 'intro.sdlxliff')
    await user.type(screen.getByLabelText(/Segment Number/i), '10')
    await user.type(screen.getByLabelText(/Description/i), 'Missing tag check')

    const checkTypeSelect = screen.getByLabelText(/Check Type/i)
    await user.click(checkTypeSelect)
    await user.click(screen.getByRole('option', { name: /tag/i }))

    await user.click(screen.getByRole('button', { name: /Submit|Report/i }))

    await waitFor(() => {
      // Success toast with tracking reference
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('PAR-2026-00042'))
    })
  })

  it('[P2] should show error toast on action failure', async () => {
    // EXPECTED: On action failure, show error toast with the error message
    mockReportMissingCheck.mockResolvedValue({
      success: false,
      error: 'Duplicate report for this segment',
    })
    const user = userEvent.setup()
    render(<ReportMissingCheckDialog {...defaultProps} />)

    // Fill required fields
    await user.type(screen.getByLabelText(/File Reference/i), 'intro.sdlxliff')
    await user.type(screen.getByLabelText(/Segment Number/i), '10')
    await user.type(screen.getByLabelText(/Description/i), 'Missing tag check')

    const checkTypeSelect = screen.getByLabelText(/Check Type/i)
    await user.click(checkTypeSelect)
    await user.click(screen.getByRole('option', { name: /tag/i }))

    await user.click(screen.getByRole('button', { name: /Submit|Report/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Duplicate report for this segment')
    })
  })

  // TA: Coverage Gap Tests — Story 2.7

  // C1 (P1): Form reset on re-open (Guardrail #11)
  it('[P1] should reset all form fields when dialog is closed and re-opened', async () => {
    // Guardrail #11: custom dialogs must reset form state on re-open
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    const { rerender } = render(
      <ReportMissingCheckDialog
        open={true}
        onOpenChange={onOpenChange}
        projectId={PROJECT_ID}
        fileId={FILE_ID}
      />,
    )

    // Fill form fields with user data
    const fileRefInput = screen.getByLabelText(/File Reference/i) as HTMLInputElement
    await user.clear(fileRefInput)
    await user.type(fileRefInput, 'modified-file.sdlxliff')
    await user.type(screen.getByLabelText(/Segment Number/i), '99')
    await user.type(screen.getByLabelText(/Description/i), 'Some description text')

    // Select a check type
    const checkTypeBtn = screen.getByLabelText(/Check Type/i)
    await user.click(checkTypeBtn)
    await user.click(screen.getByRole('option', { name: /term/i }))

    // Verify fields are filled
    expect((screen.getByLabelText(/Segment Number/i) as HTMLInputElement).value).toBe('99')
    expect((screen.getByLabelText(/Description/i) as HTMLTextAreaElement).value).toBe(
      'Some description text',
    )

    // Close dialog (open=false triggers reset effect)
    rerender(
      <ReportMissingCheckDialog
        open={false}
        onOpenChange={onOpenChange}
        projectId={PROJECT_ID}
        fileId={FILE_ID}
      />,
    )

    // Re-open dialog
    rerender(
      <ReportMissingCheckDialog
        open={true}
        onOpenChange={onOpenChange}
        projectId={PROJECT_ID}
        fileId={FILE_ID}
      />,
    )

    // All fields should be reset
    // fileReference resets to fileId prop value (pre-fill behavior)
    expect((screen.getByLabelText(/File Reference/i) as HTMLInputElement).value).toBe(FILE_ID)
    expect((screen.getByLabelText(/Segment Number/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/Description/i) as HTMLTextAreaElement).value).toBe('')
    // Check type should be reset to placeholder "Select..."
    expect(screen.getByLabelText(/Check Type/i).textContent).toBe('Select...')
  })

  // C5 (P2): segmentNumber <= 0 validation
  it('[P2] should show validation error when segmentNumber is 0', async () => {
    const user = userEvent.setup()
    render(<ReportMissingCheckDialog {...defaultProps} />)

    // Fill all fields except use segmentNumber = 0
    const fileRefInput = screen.getByLabelText(/File Reference/i) as HTMLInputElement
    await user.clear(fileRefInput)
    await user.type(fileRefInput, 'test.sdlxliff')
    await user.type(screen.getByLabelText(/Segment Number/i), '0')
    await user.type(screen.getByLabelText(/Description/i), 'Some check description')

    const checkTypeBtn = screen.getByLabelText(/Check Type/i)
    await user.click(checkTypeBtn)
    await user.click(screen.getByRole('option', { name: /tag/i }))

    // Submit
    await user.click(screen.getByRole('button', { name: /Submit|Report/i }))

    await waitFor(() => {
      // Validation error for segmentNumber should appear
      expect(screen.getByText(/Segment Number is required/i)).toBeTruthy()
      // Server action should NOT have been called
      expect(mockReportMissingCheck).not.toHaveBeenCalled()
    })
  })

  it('[P2] should show validation error when segmentNumber is negative', async () => {
    const user = userEvent.setup()
    render(<ReportMissingCheckDialog {...defaultProps} />)

    // Fill all fields except use segmentNumber = -1
    const fileRefInput = screen.getByLabelText(/File Reference/i) as HTMLInputElement
    await user.clear(fileRefInput)
    await user.type(fileRefInput, 'test.sdlxliff')
    await user.type(screen.getByLabelText(/Segment Number/i), '-1')
    await user.type(screen.getByLabelText(/Description/i), 'Some check description')

    const checkTypeBtn = screen.getByLabelText(/Check Type/i)
    await user.click(checkTypeBtn)
    await user.click(screen.getByRole('option', { name: /other/i }))

    // Submit
    await user.click(screen.getByRole('button', { name: /Submit|Report/i }))

    await waitFor(() => {
      // Validation error for segmentNumber should appear
      expect(screen.getByText(/Segment Number is required/i)).toBeTruthy()
      // Server action should NOT have been called
      expect(mockReportMissingCheck).not.toHaveBeenCalled()
    })
  })
})
