'use client'

import { useCallback, useEffect, useRef } from 'react'

// ── Types ──

type KeyboardScope = 'global' | 'page' | 'review' | 'modal' | 'dropdown'

type ModifierKey = 'alt' | 'ctrl' | 'meta' | 'shift'

type ParsedKey = {
  key: string
  modifiers: ModifierKey[]
  raw: string
}

type KeyBinding = {
  key: ParsedKey
  scope: KeyboardScope
  handler: (event: KeyboardEvent) => void
  description: string
  category: string
  enabled: boolean
  preventDefault: boolean
  allowInInput: boolean
}

type RegisterOptions = {
  scope?: KeyboardScope
  description: string
  category?: string
  enabled?: boolean
  preventDefault?: boolean
  allowInInput?: boolean
}

type ConflictResult = {
  hasConflict: boolean
  conflictWith: string | null
  scope: KeyboardScope | null
  key: string | null
}

export type { KeyboardScope, KeyBinding, RegisterOptions, ConflictResult, ParsedKey }

// ── Scope priority (higher = takes precedence) ──

const SCOPE_PRIORITY: Record<KeyboardScope, number> = {
  global: 0,
  page: 1,
  review: 2,
  modal: 3,
  dropdown: 4,
}

// ── Browser shortcuts that must NEVER be intercepted (Guardrail #34) ──

const BROWSER_SHORTCUTS = new Set(['ctrl+s', 'ctrl+p', 'ctrl+w', 'ctrl+n', 'ctrl+t', 'f5'])

// ── Input elements where single-key hotkeys are suppressed (Guardrail #28) ──

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

// ── Key normalization ──

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  delete: 'delete',
  arrowup: 'arrowup',
  arrowdown: 'arrowdown',
  arrowleft: 'arrowleft',
  arrowright: 'arrowright',
  ' ': 'space',
}

/**
 * Shift-key character equivalences for cross-platform matching.
 * On some platforms (Linux headless Chromium), Ctrl+Shift+/ produces event.key='/'
 * instead of '?'. This map normalizes shifted keys so registrations work everywhere.
 */
const SHIFT_KEY_MAP: Record<string, string> = {
  '/': '?',
  '1': '!',
  '=': '+',
  '-': '_',
}

function parseKey(raw: string): ParsedKey {
  const parts = raw.toLowerCase().split('+')
  const modifiers: ModifierKey[] = []
  let key = ''

  for (const part of parts) {
    if (part === 'ctrl' || part === 'alt' || part === 'meta' || part === 'shift') {
      modifiers.push(part)
    } else {
      key = KEY_ALIASES[part] ?? part
    }
  }

  modifiers.sort()

  return {
    key,
    modifiers,
    raw: [...modifiers, key].join('+'),
  }
}

function eventToKey(event: KeyboardEvent): string {
  const modifiers: ModifierKey[] = []
  if (event.ctrlKey || event.metaKey) modifiers.push('ctrl')
  if (event.altKey) modifiers.push('alt')
  if (event.shiftKey) modifiers.push('shift')
  modifiers.sort()

  let key = KEY_ALIASES[event.key.toLowerCase()] ?? event.key.toLowerCase()

  // Normalize shifted keys for cross-platform compatibility
  // (Linux headless Chromium: Ctrl+Shift+/ → event.key='/' not '?')
  if (event.shiftKey) {
    key = SHIFT_KEY_MAP[key] ?? key
  }

  return [...modifiers, key].join('+')
}

// ── Singleton binding registry (shared across all hook instances) ──

const bindingsRegistry = new Map<string, KeyBinding[]>()
let scopeStack: KeyboardScope[] = ['review']
let suspended = false

/** Callback for conflict detection warnings — injectable for testing */
let onConflictWarn: (message: string) => void = () => {
  // No-op in production; overridden in tests
}

export function _setConflictWarnHandler(handler: (message: string) => void): void {
  onConflictWarn = handler
}

export function _resetRegistry(): void {
  bindingsRegistry.clear()
  scopeStack = ['review']
  suspended = false
  onConflictWarn = () => {}
}

function getActiveScope(): KeyboardScope {
  return scopeStack[scopeStack.length - 1] ?? 'review'
}

function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  if (INPUT_TAGS.has(target.tagName)) return true
  if (target.getAttribute('contenteditable') === 'true') return true
  return false
}

// ── Hook ──

type UseKeyboardActionsReturn = {
  register: (
    key: string,
    handler: (event: KeyboardEvent) => void,
    options: RegisterOptions,
  ) => () => void
  unregister: (key: string, scope?: KeyboardScope) => void
  pushScope: (scope: KeyboardScope) => void
  popScope: (scope: KeyboardScope) => void
  activeScope: KeyboardScope
  getAllBindings: () => KeyBinding[]
  checkConflict: (key: string, scope?: KeyboardScope) => ConflictResult
  suspend: () => void
  resume: () => void
}

export function useKeyboardActions(): UseKeyboardActionsReturn {
  const cleanupFns = useRef<Array<() => void>>([])

  // Global keydown handler
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // IME guard (Guardrail: CJK/Thai composition)
      if (event.isComposing || event.keyCode === 229) return

      if (suspended) return

      const normalizedKey = eventToKey(event)

      // Browser shortcut passthrough (Guardrail #34)
      if (BROWSER_SHORTCUTS.has(normalizedKey)) return

      const activeScope = getActiveScope()
      const bindings = bindingsRegistry.get(normalizedKey)

      if (!bindings || bindings.length === 0) return

      // Find highest-priority binding that matches active scope or lower
      const activePriority = SCOPE_PRIORITY[activeScope]

      // Only fire bindings at the active scope level
      const matchingBindings = bindings.filter((b) => {
        if (!b.enabled) return false
        const bindingPriority = SCOPE_PRIORITY[b.scope]
        // A binding fires if its scope priority <= active scope priority
        // AND specifically at the active scope level (scoped isolation)
        // Exception: 'global' scope always fires unless overridden
        if (b.scope === 'global') return true
        return bindingPriority === activePriority && b.scope === activeScope
      })

      if (matchingBindings.length === 0) return

      // Pick highest priority binding
      const sorted = matchingBindings.sort(
        (a, b) => SCOPE_PRIORITY[b.scope] - SCOPE_PRIORITY[a.scope],
      )
      const binding = sorted[0]!

      // Input guard (Guardrail #28)
      if (!binding.allowInInput && isInputElement(event.target)) return

      if (binding.preventDefault) {
        event.preventDefault()
      }

      binding.handler(event)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const cleanup of cleanupFns.current) {
        cleanup()
      }
      cleanupFns.current = []
    }
  }, [])

  const register = useCallback(
    (key: string, handler: (event: KeyboardEvent) => void, options: RegisterOptions) => {
      const parsed = parseKey(key)
      const scope = options.scope ?? 'review'

      // Conflict detection
      const existing = bindingsRegistry.get(parsed.raw)
      if (existing) {
        const conflict = existing.find((b) => b.scope === scope)
        if (conflict) {
          onConflictWarn(
            `Duplicate key "${parsed.raw}" in scope "${scope}" — overriding "${conflict.description}" with "${options.description}"`,
          )
          // Remove the conflicting binding
          const filtered = existing.filter((b) => b.scope !== scope)
          if (filtered.length === 0) {
            bindingsRegistry.delete(parsed.raw)
          } else {
            bindingsRegistry.set(parsed.raw, filtered)
          }
        }
      }

      const binding: KeyBinding = {
        key: parsed,
        scope,
        handler,
        description: options.description,
        category: options.category ?? 'General',
        enabled: options.enabled ?? true,
        preventDefault: options.preventDefault ?? true,
        allowInInput: options.allowInInput ?? false,
      }

      const arr = bindingsRegistry.get(parsed.raw) ?? []
      arr.push(binding)
      bindingsRegistry.set(parsed.raw, arr)

      const cleanup = () => {
        const current = bindingsRegistry.get(parsed.raw)
        if (current) {
          const filtered = current.filter((b) => b !== binding)
          if (filtered.length === 0) {
            bindingsRegistry.delete(parsed.raw)
          } else {
            bindingsRegistry.set(parsed.raw, filtered)
          }
        }
      }

      cleanupFns.current.push(cleanup)
      return cleanup
    },
    [],
  )

  const unregister = useCallback((key: string, scope?: KeyboardScope) => {
    const parsed = parseKey(key)
    const targetScope = scope ?? 'review'
    const current = bindingsRegistry.get(parsed.raw)
    if (current) {
      const filtered = current.filter((b) => b.scope !== targetScope)
      if (filtered.length === 0) {
        bindingsRegistry.delete(parsed.raw)
      } else {
        bindingsRegistry.set(parsed.raw, filtered)
      }
    }
  }, [])

  const pushScope = useCallback((scope: KeyboardScope) => {
    scopeStack.push(scope)
  }, [])

  const popScope = useCallback((scope: KeyboardScope) => {
    const idx = scopeStack.lastIndexOf(scope)
    if (idx >= 0) {
      scopeStack.splice(idx, 1)
    }
  }, [])

  const getAllBindings = useCallback((): KeyBinding[] => {
    const result: KeyBinding[] = []
    for (const bindings of bindingsRegistry.values()) {
      result.push(...bindings)
    }
    return result
  }, [])

  const checkConflict = useCallback((key: string, scope?: KeyboardScope): ConflictResult => {
    const parsed = parseKey(key)
    const targetScope = scope ?? 'review'
    const existing = bindingsRegistry.get(parsed.raw)
    if (existing) {
      const conflict = existing.find((b) => b.scope === targetScope)
      if (conflict) {
        return {
          hasConflict: true,
          conflictWith: conflict.description,
          scope: conflict.scope,
          key: parsed.raw,
        }
      }
    }
    return { hasConflict: false, conflictWith: null, scope: null, key: null }
  }, [])

  const suspend = useCallback(() => {
    suspended = true
  }, [])

  const resume = useCallback(() => {
    suspended = false
  }, [])

  return {
    register,
    unregister,
    pushScope,
    popScope,
    activeScope: getActiveScope(),
    getAllBindings,
    checkConflict,
    suspend,
    resume,
  }
}

// ── Review action hotkey registration (Task 1.2) ──

export const REVIEW_HOTKEYS = [
  { key: 'a', description: 'Accept finding', category: 'Review Actions' },
  { key: 'r', description: 'Reject finding', category: 'Review Actions' },
  { key: 'f', description: 'Flag finding', category: 'Review Actions' },
  { key: 'n', description: 'Add note', category: 'Review Actions' },
  { key: 's', description: 'Source issue', category: 'Review Actions' },
  { key: '-', description: 'Severity override', category: 'Review Actions' },
  { key: '+', description: 'Add finding', category: 'Review Actions' },
] as const

type ReviewHotkeyHandlers = {
  accept?: (findingId: string) => void
  reject?: (findingId: string) => void
  flag?: (findingId: string) => void
}

// Map hotkey key to handler name
const HOTKEY_ACTION_MAP: Record<string, keyof ReviewHotkeyHandlers> = {
  a: 'accept',
  r: 'reject',
  f: 'flag',
}

/** Register 7 review hotkeys — A/R/F wired to handlers, N/S/-/+ remain no-op (Story 4.3) */
export function useReviewHotkeys(
  handlers: ReviewHotkeyHandlers = {},
  getSelectedId?: () => string | null,
): void {
  const { register } = useKeyboardActions()
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    const cleanups: Array<() => void> = []

    for (const hotkey of REVIEW_HOTKEYS) {
      const actionName = HOTKEY_ACTION_MAP[hotkey.key]
      const cleanup = register(
        hotkey.key,
        () => {
          if (!actionName) return // N, S, -, + remain no-op
          const handler = handlersRef.current[actionName]
          if (!handler) return
          const selectedId = getSelectedId?.()
          if (!selectedId) return // Guard: no finding selected
          handler(selectedId)
        },
        {
          scope: 'review',
          description: hotkey.description,
          category: hotkey.category,
        },
      )
      cleanups.push(cleanup)
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }, [register, getSelectedId])
}
