import type { FindingChangedEventData } from '@/types/pipeline'

/**
 * Creates a debounced emitter for finding.changed events.
 * Plain utility function — works outside React lifecycle (Server Actions in Epic 4).
 *
 * Debounces at 500ms: if multiple findings change within 500ms, only the last
 * event is emitted. Architecture Decision 3.4.
 */
export function createFindingChangedEmitter(
  triggerFn: (data: FindingChangedEventData) => Promise<void>,
) {
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    emit(data: FindingChangedEventData) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        triggerFn(data).catch(() => {
          // Non-critical — emitter is best-effort (score recalculation will retry via Inngest)
        })
        timer = null
      }, 500)
    },
    cancel() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}
