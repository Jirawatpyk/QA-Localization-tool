'use client'

import { Check, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { updateUserLanguages } from '@/features/admin/actions/updateUserLanguages.action'
import { cn } from '@/lib/utils'

export type LanguagePairEditorProps = {
  userId: string
  /** Human-readable name used for accessible labels. Falls back to userId if omitted. */
  displayName?: string
  /** Display value — may include optimistic overrides from the parent. */
  currentLanguages: string[]
  /**
   * Server-confirmed value used as the optimistic-lock baseline (R2-P2).
   * MUST be the raw server prop, never an optimistic override — otherwise
   * rapid double-click sends click #1's in-flight optimistic state as the
   * snapshot for click #2, producing false CONFLICTs against its own writes.
   * Falls back to `currentLanguages` if the parent cannot separate the two.
   */
  serverLanguages?: string[]
  availableLanguages: string[]
  disabled?: boolean
  onUpdate?: (nextLanguages: string[]) => void
  /** Called after the server action resolves (success or failure). Lets parents
   *  clear pending markers so reconciliation can take over from optimistic state. */
  onSettled?: () => void
  /** Render mode: 'popover' (default, for table cell) or 'inline' (for forms). */
  mode?: 'popover' | 'inline'
}

export function LanguagePairEditor({
  userId,
  displayName,
  currentLanguages,
  serverLanguages,
  availableLanguages,
  disabled = false,
  onUpdate,
  onSettled,
  mode = 'popover',
}: LanguagePairEditorProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  // Render-time reset pattern (Guardrail #21) — reset local state on re-open
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
  }

  function handleToggle(lang: string) {
    // Snapshot pre-toggle state at click time. `currentLanguages` is a prop owned
    // by the parent; on rapid double-click the second invocation would otherwise
    // close over the already-mutated prop and revert to the wrong baseline.
    const previousLanguages = currentLanguages
    const isSelected = previousLanguages.includes(lang)
    const nextLanguages = isSelected
      ? previousLanguages.filter((l) => l !== lang)
      : [...previousLanguages, lang]

    // Optimistic-lock baseline (R2-P2): use server-truth, NOT the optimistic
    // override. On rapid double-click, `currentLanguages` reflects click #1's
    // in-flight optimistic state, so sending it as `previousLanguages` would
    // spuriously CONFLICT against our own unlanded write.
    const lockBaseline = serverLanguages ?? previousLanguages

    // Optimistic update
    onUpdate?.(nextLanguages)

    startTransition(async () => {
      try {
        const result = await updateUserLanguages({
          userId,
          nativeLanguages: nextLanguages,
          // Optimistic-lock snapshot (D1) — server rejects if DB no longer matches.
          previousLanguages: lockBaseline,
        })
        if (result.success) {
          toast.success('Language pairs updated')
        } else {
          // Revert optimistic update to the exact pre-click value captured above.
          onUpdate?.(previousLanguages)
          toast.error(result.error || 'Failed to update language pairs')
        }
      } finally {
        onSettled?.()
      }
    })
  }

  const selector = (
    <Command
      className={mode === 'inline' ? 'rounded-md border' : undefined}
      aria-label="Select language pairs"
      data-testid="language-pair-editor"
    >
      <CommandInput placeholder="Search languages..." disabled={disabled || isPending} />
      <CommandList>
        <CommandEmpty>
          {availableLanguages.length === 0 ? (
            <span className="text-xs">
              No language pairs configured for this tenant. Configure them in Projects → Settings
              first.
            </span>
          ) : (
            'No matching languages.'
          )}
        </CommandEmpty>
        <CommandGroup>
          {availableLanguages.map((lang) => {
            const selected = currentLanguages.includes(lang)
            return (
              <CommandItem
                key={lang}
                value={lang}
                onSelect={() => handleToggle(lang)}
                disabled={disabled || isPending}
                data-testid={`language-option-${lang}`}
              >
                <Check
                  className={cn('mr-2 size-4', selected ? 'opacity-100' : 'opacity-0')}
                  aria-hidden="true"
                />
                <span>{lang}</span>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  )

  if (mode === 'inline') {
    return <div data-testid="language-pair-editor-inline">{selector}</div>
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-auto min-h-8 w-full justify-start px-2 py-1 text-left"
          data-testid={`language-pair-trigger-${userId}`}
          aria-label={`Edit language pairs for ${displayName ?? 'user'}`}
        >
          <div className="flex flex-wrap items-center gap-1">
            {currentLanguages.length === 0 ? (
              <span
                className="text-text-muted text-xs italic"
                data-testid="language-pair-empty-label"
              >
                None assigned
              </span>
            ) : (
              currentLanguages.map((lang) => (
                <Badge
                  key={lang}
                  variant="secondary"
                  className="text-xs"
                  data-testid="language-pair-badge"
                >
                  {lang}
                </Badge>
              ))
            )}
            {isPending && (
              <Loader2
                className="text-text-muted ml-1 size-3 animate-spin"
                aria-label="Saving"
                data-testid="language-pair-saving"
              />
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {selector}
      </PopoverContent>
    </Popover>
  )
}
