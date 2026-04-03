import { FileQuestion } from 'lucide-react'

import { ErrorPageContent } from '@/components/ui/error-page-content'

export default function ProjectNotFound() {
  return (
    <ErrorPageContent
      icon={FileQuestion}
      iconClassName="text-text-muted"
      title="Project not found"
      description="This project doesn't exist or you don't have access to it. The URL may contain an invalid ID."
      links={[
        { href: '/projects', label: 'Back to Projects', primary: true },
        { href: '/dashboard', label: 'Go to Dashboard' },
      ]}
    />
  )
}
