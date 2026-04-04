import { ErrorPageContent } from '@/components/ui/error-page-content'
import { ScoreBadge } from '@/features/batch/components/ScoreBadge'

export function EmptyFileContent({ projectId }: { projectId: string }) {
  return (
    <ErrorPageContent
      icon="file-question"
      iconClassName="text-text-muted"
      title="No translatable content"
      description="This file has no segments to review."
      links={[
        { href: `/projects/${projectId}/files`, label: 'Back to files', primary: true },
        { href: `/projects/${projectId}/upload`, label: 'Upload a different file' },
      ]}
    >
      <ScoreBadge score={null} size="md" />
    </ErrorPageContent>
  )
}
