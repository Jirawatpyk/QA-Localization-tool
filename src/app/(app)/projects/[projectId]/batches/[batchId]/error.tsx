'use client'

import { AlertTriangle } from 'lucide-react'

import { ErrorPageContent } from '@/components/ui/error-page-content'

export default function BatchError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorPageContent
      icon={AlertTriangle}
      title="Batch page couldn't load"
      description="An unexpected error occurred while loading the batch summary. Your data is safe."
      digest={error.digest}
      reset={reset}
      links={[
        { href: '/projects', label: 'Back to Projects' },
        { href: '/dashboard', label: 'Go to Dashboard' },
      ]}
    />
  )
}
