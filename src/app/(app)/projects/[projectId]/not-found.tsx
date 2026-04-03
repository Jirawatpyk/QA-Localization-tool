import { FileQuestion } from 'lucide-react'
import Link from 'next/link'

import { AutoFocusHeading } from '@/components/ui/auto-focus-heading'

export default function ProjectNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-8" role="alert">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <FileQuestion size={48} className="text-text-muted" />
        <AutoFocusHeading className="text-lg font-semibold text-text-primary outline-none">
          Project not found
        </AutoFocusHeading>
        <p className="text-sm text-text-secondary">
          This project doesn&apos;t exist or you don&apos;t have access to it. The URL may contain
          an invalid ID.
        </p>
        <div className="flex flex-col items-center gap-2">
          <Link
            href="/projects"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            Back to Projects
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-text-secondary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
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
