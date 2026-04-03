import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ProjectError from './error'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

function createMockError(digest?: string): Error & { digest?: string } {
  const error = new Error('Test error') as Error & { digest?: string }
  if (digest) error.digest = digest
  return error
}

describe('ProjectError', () => {
  it('should render error heading with role="alert"', () => {
    render(<ProjectError error={createMockError()} reset={() => {}} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText("This page couldn't load")).toBeInTheDocument()
  })

  it('should render recovery action buttons', () => {
    render(<ProjectError error={createMockError()} reset={() => {}} />)

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByText('Back to Projects')).toBeInTheDocument()
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Contact support')).toBeInTheDocument()
  })

  it('should display error digest when present', () => {
    render(<ProjectError error={createMockError('abc123')} reset={() => {}} />)

    expect(screen.getByText('Error reference: abc123')).toBeInTheDocument()
  })

  it('should not display error digest when absent', () => {
    render(<ProjectError error={createMockError()} reset={() => {}} />)

    expect(screen.queryByText(/Error reference/)).not.toBeInTheDocument()
  })

  it('should call reset when Try again is clicked', async () => {
    const reset = vi.fn()
    render(<ProjectError error={createMockError()} reset={reset} />)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })

  it('should have correct link hrefs', () => {
    render(<ProjectError error={createMockError()} reset={() => {}} />)

    expect(screen.getByText('Back to Projects').closest('a')).toHaveAttribute('href', '/projects')
    expect(screen.getByText('Go to Dashboard').closest('a')).toHaveAttribute('href', '/dashboard')
  })
})
