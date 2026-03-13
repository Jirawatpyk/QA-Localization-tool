'use client'

import {
  ArrowUpDown,
  Check,
  FileWarning,
  Flag,
  Loader2,
  MessageSquare,
  Plus,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type ActionButtonConfig = {
  key: string
  label: string
  hotkey: string
  icon: LucideIcon
  colorClass: string
  ariaKeyshortcuts: string
}

const ACTION_BUTTONS: ActionButtonConfig[] = [
  {
    key: 'accept',
    label: 'Accept',
    hotkey: 'A',
    icon: Check,
    colorClass: 'text-success',
    ariaKeyshortcuts: 'a',
  },
  {
    key: 'reject',
    label: 'Reject',
    hotkey: 'R',
    icon: X,
    colorClass: 'text-error',
    ariaKeyshortcuts: 'r',
  },
  {
    key: 'flag',
    label: 'Flag',
    hotkey: 'F',
    icon: Flag,
    colorClass: 'text-warning-foreground',
    ariaKeyshortcuts: 'f',
  },
  {
    key: 'note',
    label: 'Note',
    hotkey: 'N',
    icon: MessageSquare,
    colorClass: 'text-info',
    ariaKeyshortcuts: 'n',
  },
  {
    key: 'source',
    label: 'Source',
    hotkey: 'S',
    icon: FileWarning,
    colorClass: 'text-source-issue',
    ariaKeyshortcuts: 's',
  },
  {
    key: 'override',
    label: 'Override',
    hotkey: '-',
    icon: ArrowUpDown,
    colorClass: 'text-muted-foreground',
    ariaKeyshortcuts: '-',
  },
  {
    key: 'add',
    label: 'Add',
    hotkey: '+',
    icon: Plus,
    colorClass: 'text-muted-foreground',
    ariaKeyshortcuts: '+',
  },
]

// Actions enabled in Story 4.2 — rest deferred to Story 4.3
const ENABLED_ACTIONS = new Set(['accept', 'reject', 'flag'])

type ReviewActionBarProps = {
  onAccept?: (() => void) | undefined
  onReject?: (() => void) | undefined
  onFlag?: (() => void) | undefined
  isDisabled?: boolean | undefined
  isInFlight?: boolean | undefined
}

const ACTION_HANDLER_MAP: Record<
  string,
  keyof Pick<ReviewActionBarProps, 'onAccept' | 'onReject' | 'onFlag'>
> = {
  accept: 'onAccept',
  reject: 'onReject',
  flag: 'onFlag',
}

/**
 * Review Action Bar — 7 action buttons in a toolbar.
 * Accept/Reject/Flag enabled (Story 4.2). Note/Source/Override/Add disabled (Story 4.3).
 */
export function ReviewActionBar({
  onAccept,
  onReject,
  onFlag,
  isDisabled = false,
  isInFlight = false,
}: ReviewActionBarProps) {
  const handlers: ReviewActionBarProps = { onAccept, onReject, onFlag }

  return (
    <TooltipProvider delayDuration={500}>
      <div
        role="toolbar"
        aria-label="Review actions"
        className="flex items-center gap-2 border-t pt-4 mt-4"
        tabIndex={0}
        data-testid="review-action-bar"
      >
        {ACTION_BUTTONS.map((btn) => {
          const Icon = btn.icon
          const isEnabled = ENABLED_ACTIONS.has(btn.key)
          const handlerKey = ACTION_HANDLER_MAP[btn.key]
          const handler = handlerKey ? handlers[handlerKey] : undefined
          const btnDisabled = !isEnabled || isDisabled

          return (
            <Tooltip key={btn.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={btnDisabled}
                  onClick={handler}
                  aria-keyshortcuts={btn.ariaKeyshortcuts}
                  aria-label={`${btn.label} finding, press ${btn.hotkey}`}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 hover:brightness-110 ${btn.colorClass}`}
                >
                  {isInFlight && isEnabled && !btnDisabled ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>
                    [{btn.hotkey}] {btn.label}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Press {btn.hotkey} — {btn.label}
                </p>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
