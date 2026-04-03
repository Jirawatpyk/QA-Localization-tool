'use client'

import { AlertTriangle } from 'lucide-react'

import { ErrorPageContent } from '@/components/ui/error-page-content'

export default function ReviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorPageContent
      icon={AlertTriangle}
      title="Review page couldn't load"
      description="An unexpected error occurred while loading the review. Your data is safe."
      digest={error.digest}
      reset={reset}
      links={[
        { href: '/projects', label: 'Back to Projects' },
        { href: '/dashboard', label: 'Go to Dashboard' },
      ]}
    />
  )
}
