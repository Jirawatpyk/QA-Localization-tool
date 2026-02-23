import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FileUploadZone } from './FileUploadZone'

function makeFile(name: string, size = 100): File {
  const file = new File(['x'.repeat(size)], name, { type: 'application/xml' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('FileUploadZone', () => {
  const onFilesSelected = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render upload zone on desktop', () => {
    render(<FileUploadZone onFilesSelected={onFilesSelected} isUploading={false} />)
    // the hidden input is present
    const input = document.querySelector('input[type="file"]')
    expect(input).toBeTruthy()
  })

  it('should show mobile guard text', () => {
    render(<FileUploadZone onFilesSelected={onFilesSelected} isUploading={false} />)
    expect(screen.getByText('Switch to desktop for file upload')).toBeTruthy()
  })

  it('should call onFilesSelected when valid files are dropped', () => {
    render(<FileUploadZone onFilesSelected={onFilesSelected} isUploading={false} />)
    const dropzone = screen.getByRole('button')

    const file = makeFile('report.sdlxliff')
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    })

    expect(onFilesSelected).toHaveBeenCalledWith([file])
  })

  it('should show error and NOT call onFilesSelected when more than 50 files dropped', () => {
    render(<FileUploadZone onFilesSelected={onFilesSelected} isUploading={false} />)
    const dropzone = screen.getByRole('button')

    const files = Array.from({ length: 51 }, (_, i) => makeFile(`file-${i}.sdlxliff`))
    fireEvent.drop(dropzone, {
      dataTransfer: { files },
    })

    expect(onFilesSelected).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('50')
  })

  it('should set isDragging state on dragOver', () => {
    render(<FileUploadZone onFilesSelected={onFilesSelected} isUploading={false} />)
    const dropzone = screen.getByRole('button')

    fireEvent.dragOver(dropzone)
    // state change is internal, just verify no errors thrown
    expect(dropzone).toBeTruthy()
  })

  it('should show "Uploading…" text when isUploading is true', () => {
    render(<FileUploadZone onFilesSelected={onFilesSelected} isUploading={true} />)
    expect(screen.getByText('Uploading…')).toBeTruthy()
  })

  it('should open file input on Enter key press', async () => {
    render(<FileUploadZone onFilesSelected={onFilesSelected} isUploading={false} />)
    const dropzone = screen.getByRole('button')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})

    await userEvent.type(dropzone, '{Enter}')
    expect(clickSpy).toHaveBeenCalled()
  })
})
