'use client'

import { useEffect, useRef, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useKeyboardActions } from '@/features/review/hooks/use-keyboard-actions'
import { useReducedMotion } from '@/hooks/useReducedMotion'

type ShortcutEntry = {
  keys: string[]
  description: string
}

type ShortcutCategory = {
  name: string
  shortcuts: ShortcutEntry[]
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    name: 'Navigation',
    shortcuts: [
      { keys: ['J', '↓'], description: 'Next finding' },
      { keys: ['K', '↑'], description: 'Previous finding' },
      { keys: ['Enter'], description: 'Expand finding' },
      { keys: ['Esc'], description: 'Collapse / Close' },
    ],
  },
  {
    name: 'Review Actions',
    shortcuts: [
      { keys: ['A'], description: 'Accept finding' },
      { keys: ['R'], description: 'Reject finding' },
      { keys: ['F'], description: 'Flag finding' },
      { keys: ['N'], description: 'Add note' },
      { keys: ['S'], description: 'Source issue' },
      { keys: ['-'], description: 'Severity override' },
      { keys: ['+'], description: 'Add finding' },
    ],
  },
  {
    name: 'Bulk Operations',
    shortcuts: [
      { keys: ['Shift+Click'], description: 'Range select' },
      { keys: ['Ctrl+A'], description: 'Select all' },
      { keys: ['Ctrl+Z'], description: 'Undo' },
    ],
  },
  {
    name: 'Search',
    shortcuts: [
      { keys: ['Ctrl+K'], description: 'Command palette' },
      { keys: ['Ctrl+F'], description: 'Find in page (browser)' },
    ],
  },
  {
    name: 'Panels',
    shortcuts: [{ keys: ['Ctrl+?'], description: 'This keyboard help' }],
  },
]

/**
 * Keyboard Cheat Sheet Modal — Story 4.0 AC6
 *
 * Opens via Ctrl+Shift+/ (Ctrl+?)
 * Shows all available keyboard shortcuts grouped by category.
 * Follows Guardrail #30 (focus trap), #37 (reduced-motion).
 */
export function KeyboardCheatSheet() {
  const [open, setOpen] = useState(false)
  const reducedMotion = useReducedMotion()
  const { register } = useKeyboardActions()
  // Guardrail #30: save trigger element for focus restore on close
  const triggerRef = useRef<Element | null>(null)

  // Register Ctrl+? via keyboard actions system (M4 — respects IME guard + input suppression)
  useEffect(() => {
    const cleanup = register(
      'ctrl+shift+?',
      () => {
        triggerRef.current = document.activeElement
        setOpen(true)
      },
      {
        scope: 'global',
        description: 'Open keyboard cheat sheet',
        category: 'Panels',
        allowInInput: true,
      },
    )
    return cleanup
  }, [register])

  // Guardrail #30: restore focus when dialog closes
  // useEffect runs after React render cycle — more reliable than onCloseAutoFocus
  // which can be overridden by Radix Dialog's exit animation cleanup.
  // setTimeout(250) waits for Radix's 200ms exit animation to finish.
  useEffect(() => {
    if (!open && triggerRef.current instanceof HTMLElement) {
      const el = triggerRef.current
      triggerRef.current = null
      const timer = setTimeout(() => {
        el.focus()
      }, 250)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={reducedMotion ? '[&[data-state]]:duration-0 [&[data-state]]:animate-none' : ''}
        aria-describedby="keyboard-cheat-sheet-desc"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription id="keyboard-cheat-sheet-desc">
            Available keyboard shortcuts for the review interface.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {SHORTCUT_CATEGORIES.map((category) => (
            <div key={category.name}>
              <h3 className="text-sm font-semibold mb-2">{category.name}</h3>
              <div className="space-y-1">
                {category.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <span className="text-muted-foreground">{shortcut.description}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 font-mono text-xs"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
