'use client'

import { AlertTriangle, ArrowUpDown, Info, RotateCcw, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { FindingSeverity } from '@/types/finding'

type SeverityOption = {
  value: FindingSeverity
  label: string
  icon: typeof XCircle
  testId: string
}

/** Guardrail #36: icon shape + text + color per severity */
const SEVERITY_OPTIONS: SeverityOption[] = [
  {
    value: 'critical',
    label: 'Override to Critical',
    icon: XCircle,
    testId: 'override-critical',
  },
  {
    value: 'major',
    label: 'Override to Major',
    icon: AlertTriangle,
    testId: 'override-major',
  },
  {
    value: 'minor',
    label: 'Override to Minor',
    icon: Info,
    testId: 'override-minor',
  },
]

type SeverityOverrideMenuProps = {
  currentSeverity: FindingSeverity
  originalSeverity: FindingSeverity | null
  onOverride: (newSeverity: FindingSeverity) => void
  onReset: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger?: ReactNode | undefined
}

/**
 * SeverityOverrideMenu — DropdownMenu for severity override on findings.
 * Shows 3 severity options (disabling current) plus optional "Reset to original".
 * Guardrail #27: focus indicator 2px indigo, 4px offset.
 * Guardrail #31: Esc closes dropdown (one layer).
 * Keyboard navigable: arrow keys + Enter (built into Radix DropdownMenu).
 */
export function SeverityOverrideMenu({
  currentSeverity,
  originalSeverity,
  onOverride,
  onReset,
  open,
  onOpenChange,
  trigger,
}: SeverityOverrideMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild data-testid="override-menu">
        {trigger ?? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 hover:brightness-110"
            aria-label="Override severity"
          >
            <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
            <span>[-] Override</span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[200px]"
        data-testid="override-menu-content"
      >
        {SEVERITY_OPTIONS.map((option) => {
          const Icon = option.icon
          const isDisabled = currentSeverity === option.value

          return (
            <DropdownMenuItem
              key={option.value}
              disabled={isDisabled}
              onSelect={() => {
                onOverride(option.value)
              }}
              data-testid={option.testId}
              className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{option.label}</span>
            </DropdownMenuItem>
          )
        })}

        {originalSeverity !== null && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onReset}
              data-testid="override-reset"
              className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Reset to original ({originalSeverity})</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
