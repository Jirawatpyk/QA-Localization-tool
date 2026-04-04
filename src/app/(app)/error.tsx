'use client'

import { ErrorPageContent } from '@/components/ui/error-page-content'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorPageContent
      icon="alert-triangle"
      title="This page couldn't load"
      description="An unexpected error occurred. Your data is safe."
      digest={error.digest}
      reset={reset}
      links={[{ href: '/dashboard', label: 'Go to Dashboard' }]}
    />
  )
}
