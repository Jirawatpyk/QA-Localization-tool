/**
 * Centralized screen reader announcer — Story 4.0 AC3
 *
 * Creates and manages an aria-live region for dynamic announcements.
 * The container is pre-mounted in the DOM (Guardrail #33) so content changes
 * are reliably picked up by screen readers.
 */

const ANNOUNCER_ID = 'sr-announcer'
const DEBOUNCE_MS = 150

let debounceTimer: ReturnType<typeof setTimeout> | null = null

/** Get or create the announcer element */
function getAnnouncerElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null

  let el = document.getElementById(ANNOUNCER_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = ANNOUNCER_ID
    el.setAttribute('aria-live', 'polite')
    el.setAttribute('aria-atomic', 'true')
    el.setAttribute('role', 'status')
    // Visually hidden but accessible
    el.style.position = 'absolute'
    el.style.width = '1px'
    el.style.height = '1px'
    el.style.padding = '0'
    el.style.margin = '-1px'
    el.style.overflow = 'hidden'
    el.style.clip = 'rect(0,0,0,0)'
    el.style.whiteSpace = 'nowrap'
    el.style.borderWidth = '0'
    el.textContent = ''
    document.body.appendChild(el)
  }
  return el
}

/**
 * Announce a message to screen readers via aria-live region.
 * Debounces rapid successive calls — only the last message is announced.
 */
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  // Assertive messages bypass debounce — never swallow errors/alerts (M7)
  if (politeness === 'assertive') {
    const el = getAnnouncerElement()
    if (!el) return
    el.setAttribute('aria-live', 'assertive')
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
    const el = getAnnouncerElement()
    if (!el) return
    el.setAttribute('aria-live', politeness)
    // Clear then set — forces re-announcement for identical messages
    el.textContent = ''
    requestAnimationFrame(() => {
      el.textContent = message
    })
    debounceTimer = null
  }, DEBOUNCE_MS)
}

/**
 * Mount the announcer container in the DOM.
 * Call this during layout mount to ensure the container exists before any content changes.
 */
export function mountAnnouncer(): void {
  getAnnouncerElement()
}

/** Clean up the announcer (for testing) */
export function unmountAnnouncer(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  const el = document.getElementById(ANNOUNCER_ID)
  if (el) {
    el.remove()
  }
}
