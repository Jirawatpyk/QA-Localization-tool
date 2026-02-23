import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FileSizeWarning } from './FileSizeWarning'

describe('FileSizeWarning', () => {
  it('should render nothing when fileNames is empty', () => {
    const { container } = render(<FileSizeWarning fileNames={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('should render a role=alert when fileNames is non-empty', () => {
    render(<FileSizeWarning fileNames={['large.sdlxliff']} />)
    expect(screen.getByRole('alert')).not.toBeNull()
  })

  it('should display the file name in the alert', () => {
    render(<FileSizeWarning fileNames={['large.sdlxliff']} />)
    expect(screen.getByRole('alert').textContent).toContain('large.sdlxliff')
  })

  it('should list multiple file names joined by comma', () => {
    render(<FileSizeWarning fileNames={['a.sdlxliff', 'b.xliff', 'c.xlsx']} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('a.sdlxliff')
    expect(alert.textContent).toContain('b.xliff')
    expect(alert.textContent).toContain('c.xlsx')
  })
})
