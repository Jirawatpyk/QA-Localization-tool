'use client'

import { Check, Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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
  value: string | null
  onValueChange: (userId: string) => void
  disabled?: boolean
}

export function ReviewerSelector({
  reviewers,
  value,
  onValueChange,
  disabled = false,
}: ReviewerSelectorProps) {
  return (
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
            <CommandItem
              key={reviewer.userId}
              value={`${reviewer.displayName} ${reviewer.email}`}
              onSelect={() => onValueChange(reviewer.userId)}
              disabled={disabled}
              data-testid={`reviewer-option-${reviewer.userId}`}
              {...(reviewer.isAutoSuggested ? { 'data-suggested': true } : {})}
            >
              <Check
                className={cn(
                  'mr-2 size-4',
                  value === reviewer.userId ? 'opacity-100' : 'opacity-0',
                )}
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
                  {(reviewer.nativeLanguages ?? []).map((lang) => (
                    <Badge
                      key={lang}
                      variant="secondary"
                      className="text-xs"
                      data-testid="language-badge"
                    >
                      {lang}
                    </Badge>
                  ))}
                  <span className="text-muted-foreground text-xs" data-testid="workload-count">
                    {reviewer.workload} file{reviewer.workload !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
