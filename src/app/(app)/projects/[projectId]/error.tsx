'use client'

import { ErrorPageContent } from '@/components/ui/error-page-content'

export default function ProjectError({
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
      description="An unexpected error occurred while loading this project. Your data is safe."
      digest={error.digest}
      reset={reset}
      links={[
        { href: '/projects', label: 'Back to Projects' },
        { href: '/dashboard', label: 'Go to Dashboard' },
      ]}
    />
  )
}
