import { FileQuestion } from 'lucide-react'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <FileQuestion size={48} className="text-text-muted" />
        <h2 className="text-lg font-semibold text-text-primary">Page not found</h2>
        <p className="text-sm text-text-secondary">
          The page you are looking for does not exist.
        </p>
        <Link
          href="/dashboard"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}
