'use client'

import { ArrowUpDown, Check, FileWarning, Flag, MessageSquare, Plus, X } from 'lucide-react'
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

/**
 * Review Action Bar — Story 4.0 AC5
 *
 * 7 action buttons in a toolbar, all disabled until Story 4.2.
 * Each button shows hotkey label, icon (aria-hidden), and tooltip.
 */
export function ReviewActionBar() {
  return (
    <TooltipProvider delayDuration={500}>
      <div
        role="toolbar"
        aria-label="Review actions"
        className="flex items-center gap-2 border-t pt-4 mt-4"
        tabIndex={0}
      >
        {ACTION_BUTTONS.map((btn) => {
          const Icon = btn.icon
          return (
            <Tooltip key={btn.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled
                  aria-keyshortcuts={btn.ariaKeyshortcuts}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 ${btn.colorClass}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
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
