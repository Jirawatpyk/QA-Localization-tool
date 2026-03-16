'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useReviewStore } from '@/features/review/stores/review.store'
import { saveFilterCache } from '@/features/review/utils/filter-cache'

type SiblingFile = {
  fileId: string
  fileName: string
}

type FileNavigationDropdownProps = {
  currentFileName: string
  currentFileId: string
  projectId: string
  siblingFiles: SiblingFile[]
}

/**
 * Compact file selector for navigating between sibling files.
 *
 * WHY window.location.href INSTEAD OF <Link>:
 * Next.js App Router uses React startTransition for <Link> navigation.
 * During transition, the OLD component tree stays mounted alongside the NEW tree.
 * Both trees share the same Zustand singleton store. When resetForFile() runs
 * for the new file, it destructively clears the store — corrupting state for
 * the old tree that's still alive. This causes:
 *   1. Two review zones visible simultaneously (old blocks clicks on new)
 *   2. Filter cache saves default values instead of user's actual filters
 *   3. key={fileId} does NOT prevent this — App Router transitions ignore key
 *
 * Full page reload eliminates the overlap entirely. Filter state persists
 * via sessionStorage (saved before navigate, restored in resetForFile).
 *
 * Future fix: refactor Zustand store to be file-scoped (Map<fileId, FileState>)
 * so concurrent instances don't conflict. See TD-ARCH-001.
 */
export function FileNavigationDropdown({
  currentFileName,
  currentFileId,
  projectId,
  siblingFiles,
}: FileNavigationDropdownProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const handleFileSelect = useCallback(
    (fileId: string) => {
      if (fileId === currentFileId) {
        setOpen(false)
        return
      }
      setOpen(false)
      // Save current filter state to sessionStorage before full reload
      const store = useReviewStore.getState()
      saveFilterCache(currentFileId, {
        filterState: { ...store.filterState },
        searchQuery: store.searchQuery,
        aiSuggestionsEnabled: store.aiSuggestionsEnabled,
      })
      // Full reload — see JSDoc above for why <Link> is not used
      window.location.href = `/projects/${projectId}/review/${fileId}`
    },
    [currentFileId, projectId],
  )

  const allFiles = [{ fileId: currentFileId, fileName: currentFileName }, ...siblingFiles].sort(
    (a, b) => a.fileName.localeCompare(b.fileName),
  )

  return (
    <nav
      aria-label="Switch file"
      data-testid="file-navigation-dropdown"
      ref={dropdownRef}
      className="relative"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
        onClick={() => setOpen(!open)}
        data-testid="file-nav-trigger"
      >
        <span className="truncate max-w-[200px]">{currentFileName}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
          data-testid="file-nav-chevron"
        />
      </button>
      {open && allFiles.length > 0 && (
        <div
          role="listbox"
          aria-label="Select file"
          className="absolute z-50 mt-1 w-64 rounded-md border border-border bg-popover shadow-md py-1 max-h-60 overflow-auto"
          data-testid="file-nav-list"
        >
          {allFiles.map((f) => {
            const isCurrent = f.fileId === currentFileId
            return (
              <button
                key={f.fileId}
                type="button"
                role="option"
                aria-selected={isCurrent}
                data-testid={`file-nav-item-${f.fileId}`}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent ${isCurrent ? 'bg-accent/50 font-medium' : ''}`}
                onClick={() => handleFileSelect(f.fileId)}
              >
                {isCurrent && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                )}
                {!isCurrent && <span className="w-3.5 shrink-0" />}
                <span className="truncate">{f.fileName}</span>
              </button>
            )
          })}
        </div>
      )}
    </nav>
  )
}
