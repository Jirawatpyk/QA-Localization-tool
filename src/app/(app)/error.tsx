'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error boundary caught:', error)
  }, [error])

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <AlertTriangle size={40} className="text-error" />
        <h2 className="text-lg font-semibold text-text-primary">Something went wrong</h2>
        <p className="text-sm text-text-secondary">
          An error occurred while loading this page.
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
