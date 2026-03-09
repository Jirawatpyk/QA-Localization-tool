/**
 * Centralized screen reader announcer — Story 4.0 AC3
 *
 * Creates and manages two aria-live regions for dynamic announcements:
 * - Polite container (default): score changes, progress, filter counts
 * - Assertive container: errors, conflicts, budget alerts
 *
 * Separate containers per Guardrail #33 — screen readers may not pick up
 * politeness level changes on the same element.
 *
 * Containers are pre-mounted in the DOM (Guardrail #33) so content changes
 * are reliably picked up by screen readers.
 */

const POLITE_ID = 'sr-announcer'
const ASSERTIVE_ID = 'sr-announcer-assertive'
const DEBOUNCE_MS = 150

let debounceTimer: ReturnType<typeof setTimeout> | null = null

/** Shared visually-hidden styles for screen reader containers */
const SR_ONLY_STYLES: Record<string, string> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  borderWidth: '0',
}

function applyHiddenStyles(el: HTMLElement): void {
  for (const [key, value] of Object.entries(SR_ONLY_STYLES)) {
    el.style.setProperty(
      key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
      value,
    )
  }
}

/** Get or create the polite announcer element */
function getPoliteElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null

  let el = document.getElementById(POLITE_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = POLITE_ID
    el.setAttribute('aria-live', 'polite')
    el.setAttribute('aria-atomic', 'true')
    el.setAttribute('role', 'status')
    applyHiddenStyles(el)
    el.textContent = ''
    document.body.appendChild(el)
  }
  return el
}

/** Get or create the assertive announcer element */
function getAssertiveElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null

  let el = document.getElementById(ASSERTIVE_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = ASSERTIVE_ID
    el.setAttribute('aria-live', 'assertive')
    el.setAttribute('aria-atomic', 'true')
    el.setAttribute('role', 'alert')
    applyHiddenStyles(el)
    el.textContent = ''
    document.body.appendChild(el)
  }
  return el
}

/**
 * Announce a message to screen readers via aria-live region.
 * Polite messages are debounced — only the last message is announced.
 * Assertive messages bypass debounce — never swallow errors/alerts.
 */
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  if (politeness === 'assertive') {
    const el = getAssertiveElement()
    if (!el) return
    el.textContent = ''
    requestAnimationFrame(() => {
      el.textContent = message
    })
    return
  }

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
  }

  debounceTimer = setTimeout(() => {
    const el = getPoliteElement()
    if (!el) return
    // Clear then set — forces re-announcement for identical messages
    el.textContent = ''
    requestAnimationFrame(() => {
      el.textContent = message
    })
    debounceTimer = null
  }, DEBOUNCE_MS)
}

/**
 * Mount both announcer containers in the DOM.
 * Call this during layout mount to ensure containers exist before any content changes.
 */
export function mountAnnouncer(): void {
  getPoliteElement()
  getAssertiveElement()
}

/** Clean up both announcers (for testing and unmount) */
export function unmountAnnouncer(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  const polite = document.getElementById(POLITE_ID)
  if (polite) polite.remove()
  const assertive = document.getElementById(ASSERTIVE_ID)
  if (assertive) assertive.remove()
}
