import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { UploadProgress } from '../types'

import { UploadProgressList } from './UploadProgressList'

function makeProgress(overrides: Partial<UploadProgress> = {}): UploadProgress {
  return {
    fileId: 'f1',
    fileName: 'report.sdlxliff',
    fileSizeBytes: 1024,
    bytesUploaded: 0,
    percent: 0,
    etaSeconds: null,
    status: 'pending',
    error: null,
    ...overrides,
  }
}

describe('UploadProgressList', () => {
  it('should render nothing when files array is empty', () => {
    const { container } = render(<UploadProgressList files={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('should render file name', () => {
    render(<UploadProgressList files={[makeProgress()]} />)
    expect(screen.getByText('report.sdlxliff')).toBeTruthy()
  })

  it('should show progress bar when status is uploading', () => {
    render(<UploadProgressList files={[makeProgress({ status: 'uploading', percent: 45 })]} />)
    const progressBar = document.querySelector('[role="progressbar"]')
    expect(progressBar).toBeTruthy()
    expect(screen.getByText('45%')).toBeTruthy()
  })

  it('should show "Uploaded" when status is uploaded', () => {
    render(<UploadProgressList files={[makeProgress({ status: 'uploaded', percent: 100 })]} />)
    expect(screen.getByText('Uploaded')).toBeTruthy()
  })

  it('should show error message when status is error', () => {
    render(
      <UploadProgressList files={[makeProgress({ status: 'error', error: 'NETWORK_ERROR' })]} />,
    )
    expect(screen.getByRole('alert').textContent).toContain('Upload failed')
  })

  it('should show batch counter when batchTotal > 1', () => {
    const files = [
      makeProgress({ fileId: 'f1', status: 'uploaded' }),
      makeProgress({ fileId: 'f2', fileName: 'data.xlsx', status: 'uploading' }),
    ]
    render(<UploadProgressList files={files} batchTotal={2} />)
    expect(screen.getByText('1 of 2 uploaded…')).toBeTruthy()
  })

  it('should show ETA when uploading with eta', () => {
    render(
      <UploadProgressList
        files={[makeProgress({ status: 'uploading', percent: 30, etaSeconds: 45 })]}
      />,
    )
    expect(screen.getByText('~45s remaining')).toBeTruthy()
  })

  // M10: all remaining error codes
  it('should show error message for FILE_SIZE_EXCEEDED', () => {
    render(
      <UploadProgressList
        files={[makeProgress({ status: 'error', error: 'FILE_SIZE_EXCEEDED' })]}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('15MB')
  })

  it('should show error message for UNSUPPORTED_FORMAT', () => {
    render(
      <UploadProgressList
        files={[makeProgress({ status: 'error', error: 'UNSUPPORTED_FORMAT' })]}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('Unsupported')
  })

  it('should show error message for STORAGE_ERROR', () => {
    render(
      <UploadProgressList files={[makeProgress({ status: 'error', error: 'STORAGE_ERROR' })]} />,
    )
    expect(screen.getByRole('alert').textContent).toContain('Storage error')
  })

  it('should show error message for BATCH_SIZE_EXCEEDED', () => {
    render(
      <UploadProgressList
        files={[makeProgress({ status: 'error', error: 'BATCH_SIZE_EXCEEDED' })]}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('Batch limit')
  })

  it('should show error message for DUPLICATE_FILE', () => {
    render(
      <UploadProgressList files={[makeProgress({ status: 'error', error: 'DUPLICATE_FILE' })]} />,
    )
    expect(screen.getByRole('alert').textContent).toContain('Duplicate')
  })

  it('should show fallback "Upload failed" when error is null', () => {
    render(<UploadProgressList files={[makeProgress({ status: 'error', error: null })]} />)
    expect(screen.getByRole('alert').textContent).toContain('Upload failed')
  })
})
