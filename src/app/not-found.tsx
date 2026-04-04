import { ErrorPageContent } from '@/components/ui/error-page-content'

export default function NotFound() {
  return (
    <ErrorPageContent
      icon="file-question"
      iconClassName="text-text-muted"
      title="Page not found"
      description="The page you're looking for doesn't exist or has been moved."
      fullScreen
      links={[{ href: '/dashboard', label: 'Go to Dashboard', primary: true }]}
    />
  )
}
