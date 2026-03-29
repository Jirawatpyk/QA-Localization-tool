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

/** Delay for focus restore after Radix Dialog exit animation (200ms) + React re-render headroom */
const RADIX_EXIT_ANIMATION_MS = 250

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
    name: 'Native Review',
    shortcuts: [
      { keys: ['Shift+F'], description: 'Flag for native review' },
      { keys: ['C'], description: 'Confirm (native reviewer)' },
      { keys: ['O'], description: 'Override (native reviewer)' },
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

/** Build a CSS selector to re-find an element after React re-render (Guardrail #30). */
function buildFocusSelector(el: Element | null): string | null {
  if (!el || el === document.body) return null
  if (el.id) return `#${el.id}`
  const findingId = el.getAttribute('data-finding-id')
  if (findingId) return `[data-finding-id="${findingId}"]`
  const testId = el.getAttribute('data-testid')
  if (testId) return `[data-testid="${testId}"]`
  // Fallback: role + tabindex for generic focusable elements
  const role = el.getAttribute('role')
  if (role) return `[role="${role}"][tabindex="0"]`
  return null
}

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
  // Guardrail #30: save a CSS selector to re-query the trigger element after re-render.
  // Storing a DOM ref fails because React may replace the DOM node between open/close.
  const triggerSelectorRef = useRef<string | null>(null)

  // Register Ctrl+? via keyboard actions system (M4 — respects IME guard + input suppression)
  useEffect(() => {
    const cleanup = register(
      'ctrl+shift+?',
      () => {
        triggerSelectorRef.current = buildFocusSelector(document.activeElement)
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

  // Guardrail #30: restore focus when dialog closes.
  // Uses selector-based lookup because React may replace DOM nodes during re-render,
  // making any saved DOM ref point to a detached (stale) node.
  useEffect(() => {
    if (!open && triggerSelectorRef.current) {
      const selector = triggerSelectorRef.current
      triggerSelectorRef.current = null
      const timer = setTimeout(() => {
        const el = document.querySelector(selector)
        if (el instanceof HTMLElement) {
          el.focus()
        }
      }, RADIX_EXIT_ANIMATION_MS)
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
