/**
 * Story 4.3 — NoteInput component tests
 * ATDD: C-NI1, C-NI2, C-NI3, C-NI4
 *
 * Guardrails referenced: #11 (reset on re-open), #27 (focus indicator), #31 (Esc one layer)
 */
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { NoteInput } from '@/features/review/components/NoteInput'

describe('NoteInput', () => {
  const onSubmit = vi.fn()
  const onDismiss = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderOpen(props?: Partial<{ open: boolean }>) {
    return render(
      <NoteInput open={props?.open ?? true} onSubmit={onSubmit} onDismiss={onDismiss} />,
    )
  }

  it('[P1] C-NI1: should render text field when open', () => {
    renderOpen()

    const popover = screen.getByTestId('note-input-popover')
    expect(popover).toBeDefined()
    expect(popover.getAttribute('role')).toBe('dialog')
    expect(popover.getAttribute('aria-label')).toBe('Add note text')

    const textarea = screen.getByTestId('note-text-field')
    expect(textarea).toBeDefined()
    expect(textarea.tagName.toLowerCase()).toBe('textarea')

    // Label is rendered
    expect(screen.getByText('Note (optional comment)')).toBeDefined()

    // Save button is present but disabled (empty text)
    const saveButton = screen.getByTestId('note-save-button')
    expect(saveButton).toBeDefined()
    expect(saveButton).toBeDisabled()

    // Cancel button is present
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined()

    // Characters remaining shown
    expect(screen.getByText('500 characters remaining')).toBeDefined()
  })

  it('[P1] C-NI1b: should NOT render when open is false', () => {
    renderOpen({ open: false })

    expect(screen.queryByTestId('note-input-popover')).toBeNull()
  })

  it('[P1] C-NI2: should call onSubmit with text when Enter pressed', async () => {
    const user = userEvent.setup()
    renderOpen()

    const textarea = screen.getByTestId('note-text-field')
    await user.type(textarea, 'This is a test note')
    await user.keyboard('{Enter}')

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledWith('This is a test note')
  })

  it('[P1] C-NI2b: should NOT call onSubmit when text is empty/whitespace', async () => {
    const user = userEvent.setup()
    renderOpen()

    const textarea = screen.getByTestId('note-text-field')
    await user.type(textarea, '   ')
    await user.keyboard('{Enter}')

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('[P1] C-NI2c: should allow Shift+Enter for newline without submitting', async () => {
    const user = userEvent.setup()
    renderOpen()

    const textarea = screen.getByTestId('note-text-field')
    await user.type(textarea, 'line1')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    await user.type(textarea, 'line2')

    expect(onSubmit).not.toHaveBeenCalled()
    expect(textarea).toHaveValue('line1\nline2')
  })

  it('[P1] C-NI2d: should call onSubmit with trimmed text via Save button click', async () => {
    const user = userEvent.setup()
    renderOpen()

    const textarea = screen.getByTestId('note-text-field')
    await user.type(textarea, '  trimmed note  ')

    const saveButton = screen.getByTestId('note-save-button')
    expect(saveButton).not.toBeDisabled()
    await user.click(saveButton)

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledWith('trimmed note')
  })

  it('[P1] C-NI3: should call onDismiss when Esc pressed', async () => {
    const user = userEvent.setup()
    renderOpen()

    const textarea = screen.getByTestId('note-text-field')
    await user.click(textarea)
    await user.keyboard('{Escape}')

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('[P1] C-NI3b: should call onDismiss when Cancel button clicked', async () => {
    const user = userEvent.setup()
    renderOpen()

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('[P2] C-NI4: should enforce max 500 char limit', async () => {
    const user = userEvent.setup()
    renderOpen()

    const textarea = screen.getByTestId('note-text-field')

    // Type exactly 500 chars
    const text500 = 'a'.repeat(500)
    await user.type(textarea, text500)

    expect(textarea).toHaveValue(text500)
    expect(screen.getByText('0 characters remaining')).toBeDefined()

    // The onChange guard prevents adding more text beyond MAX
    // The textarea also has maxLength={500} as a secondary guard
    expect(textarea.getAttribute('maxLength')).toBe('500')
  })

  describe('Tab trap (Guardrail #30)', () => {
    it('[P1] G3-NoteInput-Tab: should trap Tab — wrap from Save to textarea', () => {
      renderOpen()

      const saveButton = screen.getByTestId('note-save-button')
      const textarea = screen.getByTestId('note-text-field')

      // Type text so Save button is enabled (disabled buttons are excluded from focusable query)
      fireEvent.change(textarea, { target: { value: 'some text' } })

      // Focus Save button (last focusable element)
      saveButton.focus()
      expect(document.activeElement).toBe(saveButton)

      // Press Tab on the container — should wrap to textarea (first focusable)
      const popover = screen.getByTestId('note-input-popover')
      fireEvent.keyDown(popover, { key: 'Tab', shiftKey: false })

      expect(document.activeElement).toBe(textarea)
    })

    it('[P1] G3-NoteInput-ShiftTab: should trap Shift+Tab — wrap from textarea to Save', () => {
      renderOpen()

      const textarea = screen.getByTestId('note-text-field')

      // Type text so Save button is enabled
      fireEvent.change(textarea, { target: { value: 'some text' } })

      const saveButton = screen.getByTestId('note-save-button')

      // Focus textarea (first focusable element)
      textarea.focus()
      expect(document.activeElement).toBe(textarea)

      // Press Shift+Tab on the container — should wrap to Save (last focusable)
      const popover = screen.getByTestId('note-input-popover')
      fireEvent.keyDown(popover, { key: 'Tab', shiftKey: true })

      expect(document.activeElement).toBe(saveButton)
    })
  })

  it('[P1] C-NI1c: should reset form on re-open (Guardrail #11)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<NoteInput open={true} onSubmit={onSubmit} onDismiss={onDismiss} />)

    const textarea = screen.getByTestId('note-text-field')
    await user.type(textarea, 'some text')
    expect(textarea).toHaveValue('some text')

    // Close
    rerender(<NoteInput open={false} onSubmit={onSubmit} onDismiss={onDismiss} />)

    // Re-open
    rerender(<NoteInput open={true} onSubmit={onSubmit} onDismiss={onDismiss} />)

    const textareaAfterReopen = screen.getByTestId('note-text-field')
    expect(textareaAfterReopen).toHaveValue('')
    expect(screen.getByText('500 characters remaining')).toBeDefined()
  })
})
