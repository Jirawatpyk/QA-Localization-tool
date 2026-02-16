import { Bell, User } from 'lucide-react'

export function AppHeader() {
  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-medium text-text-primary">QA Localization Tool</h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          aria-label="Notifications"
        >
          <Bell size={16} />
        </button>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          aria-label="User menu"
        >
          <User size={16} />
        </button>
      </div>
    </header>
  )
}
