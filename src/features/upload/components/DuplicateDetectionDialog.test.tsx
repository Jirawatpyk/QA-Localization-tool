import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DuplicateInfo } from '../types'

import { DuplicateDetectionDialog } from './DuplicateDetectionDialog'

const DUPLICATE_INFO: DuplicateInfo = {
  isDuplicate: true,
  originalUploadDate: '2025-06-01T10:00:00.000Z',
  existingScore: 87.5,
  existingFileId: 'f1e2d3c4-b5a6-4f1e-8d2c-3b4a5f6e7d8c',
}

describe('DuplicateDetectionDialog', () => {
  const onRerun = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render when open', () => {
    render(
      <DuplicateDetectionDialog
        open={true}
        fileName="report.sdlxliff"
        duplicateInfo={DUPLICATE_INFO}
        onRerun={onRerun}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByText('Duplicate File Detected')).toBeTruthy()
    expect(screen.getByText(/report.sdlxliff/)).toBeTruthy()
  })

  it('should show score text', () => {
    render(
      <DuplicateDetectionDialog
        open={true}
        fileName="report.sdlxliff"
        duplicateInfo={DUPLICATE_INFO}
        onRerun={onRerun}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByText(/87\.5/)).toBeTruthy()
  })

  it('should show "No score yet" when existingScore is null', () => {
    render(
      <DuplicateDetectionDialog
        open={true}
        fileName="report.sdlxliff"
        duplicateInfo={{ ...DUPLICATE_INFO, existingScore: null }}
        onRerun={onRerun}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByText(/No score yet/)).toBeTruthy()
  })

  it('should call onRerun when Re-run QA clicked', async () => {
    render(
      <DuplicateDetectionDialog
        open={true}
        fileName="report.sdlxliff"
        duplicateInfo={DUPLICATE_INFO}
        onRerun={onRerun}
        onCancel={onCancel}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Re-run QA' }))
    expect(onRerun).toHaveBeenCalledOnce()
  })

  it('should call onCancel when Cancel clicked', async () => {
    render(
      <DuplicateDetectionDialog
        open={true}
        fileName="report.sdlxliff"
        duplicateInfo={DUPLICATE_INFO}
        onRerun={onRerun}
        onCancel={onCancel}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('should not render content when closed', () => {
    const { container } = render(
      <DuplicateDetectionDialog
        open={false}
        fileName="report.sdlxliff"
        duplicateInfo={DUPLICATE_INFO}
        onRerun={onRerun}
        onCancel={onCancel}
      />,
    )
    expect(container.textContent).not.toContain('Duplicate File Detected')
  })

  // M11: Radix onOpenChange — Escape key triggers onCancel via Dialog.onOpenChange
  it('should call onCancel when Escape key closes the dialog', async () => {
    render(
      <DuplicateDetectionDialog
        open={true}
        fileName="report.sdlxliff"
        duplicateInfo={DUPLICATE_INFO}
        onRerun={onRerun}
        onCancel={onCancel}
      />,
    )
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
