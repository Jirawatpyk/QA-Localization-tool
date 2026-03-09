import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { announce, mountAnnouncer, unmountAnnouncer } from '@/features/review/utils/announce'

describe('announce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    unmountAnnouncer()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('[P1] G1a: should create polite announcer and deliver message after debounce', () => {
    announce('Score updated to 85')

    // Polite element is created inside setTimeout callback (DEBOUNCE_MS=150ms),
    // so it does not exist before the timer fires
    expect(document.getElementById('sr-announcer')).toBeNull()

    // Advance past DEBOUNCE_MS (150ms) — element created + message set via rAF
    vi.advanceTimersByTime(150)

    const el = document.getElementById('sr-announcer')
    expect(el).not.toBeNull()
    expect(el!.getAttribute('aria-live')).toBe('polite')
    expect(el!.getAttribute('aria-atomic')).toBe('true')
    expect(el!.getAttribute('role')).toBe('status')
    expect(el!.textContent).toBe('Score updated to 85')
  })

  it('[P1] G1b: should create assertive announcer and deliver message immediately (bypass debounce)', () => {
    announce('Budget exhausted', 'assertive')

    // Assertive bypasses debounce — no timer advancement needed
    const el = document.getElementById('sr-announcer-assertive')
    expect(el).not.toBeNull()
    expect(el!.getAttribute('aria-live')).toBe('assertive')
    expect(el!.getAttribute('aria-atomic')).toBe('true')
    expect(el!.getAttribute('role')).toBe('alert')
    expect(el!.textContent).toBe('Budget exhausted')
  })

  it('[P1] G1c: should debounce rapid polite messages — only last message delivered', () => {
    announce('Message 1')
    vi.advanceTimersByTime(50)
    announce('Message 2')
    vi.advanceTimersByTime(50)
    announce('Message 3')

    // Polite element created inside setTimeout — not yet in DOM
    expect(document.getElementById('sr-announcer')).toBeNull()

    // Advance 150ms from last call — only Message 3 should be delivered
    vi.advanceTimersByTime(150)

    const el = document.getElementById('sr-announcer')
    expect(el).not.toBeNull()
    expect(el!.textContent).toBe('Message 3')
  })

  it('[P1] G1d: mountAnnouncer should pre-create both containers in DOM', () => {
    // Neither element exists yet
    expect(document.getElementById('sr-announcer')).toBeNull()
    expect(document.getElementById('sr-announcer-assertive')).toBeNull()

    mountAnnouncer()

    const polite = document.getElementById('sr-announcer')
    const assertive = document.getElementById('sr-announcer-assertive')

    expect(polite).not.toBeNull()
    expect(assertive).not.toBeNull()
    expect(polite!.getAttribute('aria-live')).toBe('polite')
    expect(assertive!.getAttribute('aria-live')).toBe('assertive')
    expect(polite!.textContent).toBe('')
    expect(assertive!.textContent).toBe('')

    // Calling mountAnnouncer again should not create duplicates
    mountAnnouncer()
    expect(document.querySelectorAll('#sr-announcer')).toHaveLength(1)
    expect(document.querySelectorAll('#sr-announcer-assertive')).toHaveLength(1)
  })
})
