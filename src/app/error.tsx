'use client'

import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef } from 'react'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center" role="alert">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <AlertTriangle size={48} className="text-error" />
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-text-primary outline-none"
        >
          This page couldn&apos;t load
        </h2>
        <p className="text-sm text-text-secondary">
          An unexpected error occurred. Your data is safe.
        </p>
        {error.digest && <p className="text-xs text-text-muted">Error reference: {error.digest}</p>}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            Go to Dashboard
          </Link>
          <span className="text-xs text-text-muted">
            Need help?{' '}
            <a
              href="mailto:support@example.com"
              className="underline hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              Contact support
            </a>
          </span>
        </div>
      </div>
    </div>
  )
}
