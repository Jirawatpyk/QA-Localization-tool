'use client'

import { AlertTriangle, Check, ChevronDown, Loader2, Star, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { ReviewerOption } from '@/features/project/actions/getEligibleReviewers.action'
import { cn } from '@/lib/utils'

type ReviewerSelectorProps = {
  reviewers: ReviewerOption[]
  fallbackReviewers?: ReviewerOption[] | undefined
  fallbackLoading?: boolean | undefined
  /** True while the primary (matching) reviewer list is being fetched. Suppresses
   *  the empty-state flash that would otherwise appear during the 50–300 ms
   *  window before the first results arrive (R2-P7). */
  isLoading?: boolean | undefined
  value: string | null
  onValueChange: (userId: string) => void
  onLoadFallback?: (() => void) | undefined
  disabled?: boolean | undefined
  targetLanguage: string
  isAdmin?: boolean | undefined
}

export function ReviewerSelector({
  reviewers,
  fallbackReviewers,
  fallbackLoading = false,
  isLoading = false,
  value,
  onValueChange,
  onLoadFallback,
  disabled = false,
  targetLanguage,
  isAdmin = false,
}: ReviewerSelectorProps) {
  const [fallbackOpen, setFallbackOpen] = useState(false)
  const hasMatchingReviewers = reviewers.length > 0

  // R2-P8: when the parent clears `fallbackReviewers` (e.g. targetLanguage
  // change), collapse the fallback UI so the user can re-open and re-fetch.
  // Without this, the Collapsible stays visually open but `handleFallbackOpenChange`
  // only fires on `open -> open` transitions, so no new fetch is triggered.
  // Uses render-time adjustment pattern (CLAUDE.md React Compiler rule) — NOT
  // useEffect+setState, which triggers cascading-render errors.
  const [prevFallbackPresent, setPrevFallbackPresent] = useState(fallbackReviewers != null)
  const fallbackPresent = fallbackReviewers != null
  if (prevFallbackPresent !== fallbackPresent) {
    setPrevFallbackPresent(fallbackPresent)
    if (!fallbackPresent && fallbackOpen) {
      setFallbackOpen(false)
    }
  }

  function handleFallbackOpenChange(next: boolean) {
    setFallbackOpen(next)
    if (next && onLoadFallback && !fallbackReviewers) {
      onLoadFallback()
    }
  }

  return (
    <div className="space-y-3">
      {hasMatchingReviewers ? (
        <Command
          className="rounded-md border"
          aria-label="Select reviewer"
          data-testid="reviewer-selector"
        >
          <CommandInput placeholder="Search reviewers..." disabled={disabled} />
          <CommandList>
            <CommandEmpty>No matching reviewers found.</CommandEmpty>
            <CommandGroup>
              {reviewers.map((reviewer) => (
                <ReviewerItem
                  key={reviewer.userId}
                  reviewer={reviewer}
                  value={value}
                  onSelect={() => onValueChange(reviewer.userId)}
                  disabled={disabled}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      ) : isLoading ? (
        // R2-P7: during initial fetch, show a skeleton loader instead of the
        // empty-state CTA. Without this the admin sees "No reviewers available
        // for th-TH / Go to User Management" flash before real data arrives,
        // which mis-advertises the tenant state.
        <div
          className="rounded-md border"
          data-testid="reviewer-selector"
          role="status"
          aria-live="polite"
          aria-label="Loading reviewers"
        >
          <div className="flex items-center gap-2 px-4 py-6 text-text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            <span className="text-sm">Loading reviewers…</span>
          </div>
        </div>
      ) : (
        // D3 fix: cmdk's CommandEmpty only renders after a filter miss — when
        // the list starts empty (zero reviewers fetched), CommandEmpty never
        // appears. Render the empty state as a sibling instead, so it shows
        // unconditionally when there are no matched reviewers.
        <div
          className="rounded-md border"
          data-testid="reviewer-selector"
          role="region"
          aria-label="Reviewer selector — no matches"
        >
          <EmptyReviewerState targetLanguage={targetLanguage} isAdmin={isAdmin} />
        </div>
      )}

      {!hasMatchingReviewers && !isLoading && (
        <Collapsible open={fallbackOpen} onOpenChange={handleFallbackOpenChange}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-between"
              data-testid="show-all-reviewers-trigger"
              disabled={disabled}
            >
              <span>Show all reviewers (any language)</span>
              <ChevronDown
                className={cn(
                  'size-4 transition-transform',
                  fallbackOpen ? 'rotate-180' : 'rotate-0',
                )}
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="rounded-md border" data-testid="fallback-reviewers-list">
              {fallbackLoading && (
                <p className="text-text-muted px-3 py-4 text-center text-sm">
                  Loading all reviewers...
                </p>
              )}
              {!fallbackLoading && fallbackReviewers && fallbackReviewers.length === 0 && (
                <p className="text-text-muted px-3 py-4 text-center text-sm">
                  No reviewers in this tenant.
                </p>
              )}
              {!fallbackLoading && fallbackReviewers && fallbackReviewers.length > 0 && (
                <Command aria-label="All reviewers" data-testid="fallback-reviewer-command">
                  <CommandList className="max-h-[240px]">
                    <CommandGroup>
                      {fallbackReviewers.map((reviewer) => (
                        <ReviewerItem
                          key={reviewer.userId}
                          reviewer={reviewer}
                          value={value}
                          onSelect={() => onValueChange(reviewer.userId)}
                          disabled={disabled}
                          showUnmatchedBadge
                        />
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

function ReviewerItem({
  reviewer,
  value,
  onSelect,
  disabled,
  showUnmatchedBadge = false,
}: {
  reviewer: ReviewerOption
  value: string | null
  onSelect: () => void
  disabled: boolean
  showUnmatchedBadge?: boolean
}) {
  const isUnmatched = showUnmatchedBadge && !reviewer.isLanguageMatch
  return (
    <CommandItem
      value={`${reviewer.displayName} ${reviewer.email}`}
      onSelect={onSelect}
      disabled={disabled}
      data-testid={`reviewer-option-${reviewer.userId}`}
      {...(reviewer.isAutoSuggested ? { 'data-suggested': true } : {})}
      {...(isUnmatched ? { 'data-unmatched': true } : {})}
    >
      <Check
        className={cn('mr-2 size-4', value === reviewer.userId ? 'opacity-100' : 'opacity-0')}
        aria-hidden="true"
      />
      <div className="flex flex-1 items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {reviewer.isAutoSuggested && (
            <Star
              className="size-4 fill-yellow-400 text-yellow-400"
              aria-label="Auto-suggested (lowest workload)"
              data-testid="reviewer-suggested"
            />
          )}
          <span>{reviewer.displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          {isUnmatched && (
            <Badge
              variant="outline"
              className="border-amber-500 text-xs text-amber-600 dark:text-amber-400"
              data-testid="reviewer-unmatched-badge"
            >
              <AlertTriangle className="mr-1 size-3" aria-hidden="true" />
              No match
            </Badge>
          )}
          {(reviewer.nativeLanguages ?? []).map((lang) => (
            <Badge key={lang} variant="secondary" className="text-xs" data-testid="language-badge">
              {lang}
            </Badge>
          ))}
          <span className="text-muted-foreground text-xs" data-testid="workload-count">
            {reviewer.workload} file{reviewer.workload !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </CommandItem>
  )
}

function EmptyReviewerState({
  targetLanguage,
  isAdmin,
}: {
  targetLanguage: string
  isAdmin: boolean
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 px-4 py-6 text-center"
      data-testid="reviewer-empty-state"
    >
      <div className="bg-muted flex size-12 items-center justify-center rounded-full">
        <UserPlus className="text-text-muted size-6" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">
          {targetLanguage
            ? `No reviewers available for ${targetLanguage}`
            : 'No reviewers available for this file'}
        </p>
        {isAdmin ? (
          <p className="text-text-muted text-xs">
            Assign language pairs to reviewers in User Management, or invite new team members.
          </p>
        ) : (
          <p className="text-text-muted text-xs">
            Contact your admin to assign reviewers for this language pair.
          </p>
        )}
      </div>
      {isAdmin && (
        <Button asChild size="sm" variant="outline" data-testid="go-to-user-management">
          <Link href="/admin">Go to User Management</Link>
        </Button>
      )}
    </div>
  )
}
