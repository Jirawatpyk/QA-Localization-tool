'use client'

import { ChevronDown } from 'lucide-react'

type FileNavigationDropdownProps = {
  currentFileName: string
}

/**
 * Compact file selector for laptop/tablet breakpoints (AC2).
 * Replaces the static sidebar when viewport < 1440px.
 * Currently a placeholder — real file switching deferred to future story.
 */
export function FileNavigationDropdown({ currentFileName }: FileNavigationDropdownProps) {
  return (
    <nav aria-label="File navigation" data-testid="file-navigation-dropdown">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
      >
        <span className="truncate max-w-[200px]">{currentFileName}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
          data-testid="file-nav-chevron"
        />
      </button>
    </nav>
  )
}
