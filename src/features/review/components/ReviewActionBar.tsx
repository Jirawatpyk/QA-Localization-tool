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
import type { ReviewAction } from '@/features/review/utils/state-transitions'
import { useReducedMotion } from '@/hooks/useReducedMotion'

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

// Story 4.3: all 7 actions enabled
const ENABLED_ACTIONS = new Set<string>([
  'accept',
  'reject',
  'flag',
  'note',
  'source',
  'override',
  'add',
])

type ReviewActionBarProps = {
  onAccept?: (() => void) | undefined
  onReject?: (() => void) | undefined
  onFlag?: (() => void) | undefined
  onNote?: (() => void) | undefined
  onSource?: (() => void) | undefined
  onOverride?: (() => void) | undefined
  onAdd?: (() => void) | undefined
  isDisabled?: boolean | undefined
  isInFlight?: boolean | undefined
  activeAction?: ReviewAction | null | undefined
  findingNumber?: number | undefined
  /** Manual findings can't be noted/sourced/etc — disable action buttons except override */
  isManualFinding?: boolean | undefined
  /** Story 5.2c: Native reviewer confirm/override props */
  isNativeReviewer?: boolean | undefined
  onConfirmNative?: (() => void) | undefined
  onOverrideNative?: (() => void) | undefined
}

type HandlerKeys =
  | 'onAccept'
  | 'onReject'
  | 'onFlag'
  | 'onNote'
  | 'onSource'
  | 'onOverride'
  | 'onAdd'

const ACTION_HANDLER_MAP: Partial<Record<string, HandlerKeys>> = {
  accept: 'onAccept',
  reject: 'onReject',
  flag: 'onFlag',
  note: 'onNote',
  source: 'onSource',
  override: 'onOverride',
  add: 'onAdd',
}

/**
 * Review Action Bar — 7 action buttons in a toolbar.
 * All enabled (Story 4.3). Manual findings: only override is active.
 */
export function ReviewActionBar({
  onAccept,
  onReject,
  onFlag,
  onNote,
  onSource,
  onOverride,
  onAdd,
  isDisabled = false,
  isInFlight = false,
  activeAction = null,
  findingNumber,
  isManualFinding = false,
  isNativeReviewer = false,
  onConfirmNative,
  onOverrideNative,
}: ReviewActionBarProps) {
  const reducedMotion = useReducedMotion()
  const handlers: ReviewActionBarProps = {
    onAccept,
    onReject,
    onFlag,
    onNote,
    onSource,
    onOverride,
    onAdd,
  }

  return (
    <TooltipProvider delayDuration={500}>
      <div
        role="toolbar"
        aria-label="Review actions"
        className="flex items-center gap-2 flex-wrap border-t pt-4 mt-4"
        tabIndex={0}
        data-testid="review-action-bar"
      >
        {/* Story 5.2c: Native reviewer actions */}
        {isNativeReviewer && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={isDisabled || isInFlight}
                  onClick={onConfirmNative}
                  data-testid="action-confirm-native"
                  aria-keyshortcuts="c"
                  aria-label="Confirm finding, press C"
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 hover:brightness-110 border-success/20 bg-success/10 text-success"
                >
                  [C] Confirm
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Press C — Confirm as native reviewer</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={isDisabled || isInFlight}
                  onClick={onOverrideNative}
                  data-testid="action-override-native"
                  aria-keyshortcuts="o"
                  aria-label="Override finding, press O"
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 hover:brightness-110 border-warning/20 bg-warning/10 text-warning"
                >
                  [O] Override
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Press O — Override with new status</p>
              </TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Standard QA reviewer actions — hidden for native reviewer (CR-H1: AC3 says "replace") */}
        {!isNativeReviewer &&
          ACTION_BUTTONS.map((btn) => {
            const Icon = btn.icon
            const isEnabled = ENABLED_ACTIONS.has(btn.key)
            const handlerKey = ACTION_HANDLER_MAP[btn.key]
            const handler = handlerKey ? handlers[handlerKey] : undefined
            // Manual findings: only override and add are active (AC5 — no accept/reject/flag/note/source)
            const manualDisabled = isManualFinding && !['override', 'add'].includes(btn.key)
            const btnDisabled = !isEnabled || isDisabled || manualDisabled
            // CR-R2-H2: spinner only on the specific button being actioned
            const showSpinner = isInFlight && activeAction === btn.key && !btnDisabled

            return (
              <Tooltip key={btn.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={btnDisabled || isInFlight}
                    onClick={handler}
                    data-testid={`action-${btn.key}`}
                    aria-keyshortcuts={btn.ariaKeyshortcuts}
                    aria-label={`${btn.label}${findingNumber !== undefined ? ` finding ${findingNumber}` : ' finding'}, press ${btn.hotkey}`}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 hover:brightness-110 ${btn.colorClass}`}
                  >
                    {showSpinner ? (
                      <Loader2
                        className={`h-4 w-4 ${reducedMotion ? '' : 'animate-spin'}`}
                        aria-hidden="true"
                      />
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
