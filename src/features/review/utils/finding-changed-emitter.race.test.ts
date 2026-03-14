/**
 * P0-10 / R3-002: Race condition tests for finding-changed debounce emitter
 *
 * Verifies that rapid finding changes produce exactly the correct number
 * of score recalculation calls via debounce behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createFindingChangedEmitter } from '@/features/review/utils/finding-changed-emitter'
import { buildFindingChangedEvent } from '@/test/factories'
import type { FindingChangedEventData } from '@/types/pipeline'

describe('createFindingChangedEmitter — race conditions (R3-002)', () => {
  let mockTriggerFn: ReturnType<typeof vi.fn<(data: FindingChangedEventData) => Promise<void>>>

  beforeEach(() => {
    vi.useFakeTimers()
    mockTriggerFn = vi.fn<(data: FindingChangedEventData) => Promise<void>>(() => Promise.resolve())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('[P0] should call triggerFn exactly once with last event data when 3 events fire within 100ms', async () => {
    const emitter = createFindingChangedEmitter(mockTriggerFn)

    const event1 = buildFindingChangedEvent({ findingId: 'race-1' })
    const event2 = buildFindingChangedEvent({ findingId: 'race-2' })
    const event3 = buildFindingChangedEvent({ findingId: 'race-3' })

    // Event 1 at 0ms
    emitter.emit(event1)

    // Event 2 at 30ms
    await vi.advanceTimersByTimeAsync(30)
    emitter.emit(event2)

    // Event 3 at 80ms (30 + 50)
    await vi.advanceTimersByTimeAsync(50)
    emitter.emit(event3)

    // Not yet fired at 80ms
    expect(mockTriggerFn).not.toHaveBeenCalled()

    // Advance to 580ms (80 + 500) — last emit + debounce window
    await vi.advanceTimersByTimeAsync(500)

    expect(mockTriggerFn).toHaveBeenCalledTimes(1)
    expect(mockTriggerFn).toHaveBeenCalledWith(event3)
  })

  it('[P0] should call triggerFn exactly once when 3 events span 600ms with rolling resets', async () => {
    const emitter = createFindingChangedEmitter(mockTriggerFn)

    const event1 = buildFindingChangedEvent({ findingId: 'rolling-1' })
    const event2 = buildFindingChangedEvent({ findingId: 'rolling-2' })
    const event3 = buildFindingChangedEvent({ findingId: 'rolling-3' })

    // Event 1 at 0ms
    emitter.emit(event1)

    // Event 2 at 300ms — resets timer (within 500ms window)
    await vi.advanceTimersByTimeAsync(300)
    emitter.emit(event2)

    // Event 3 at 600ms (300 + 300) — resets timer again (within 500ms from event 2)
    await vi.advanceTimersByTimeAsync(300)
    emitter.emit(event3)

    // At 600ms: no call yet (event 3 just reset the timer)
    expect(mockTriggerFn).not.toHaveBeenCalled()

    // Advance to 1100ms (600 + 500) — event 3's debounce fires
    await vi.advanceTimersByTimeAsync(500)

    expect(mockTriggerFn).toHaveBeenCalledTimes(1)
    expect(mockTriggerFn).toHaveBeenCalledWith(event3)
  })

  it('[P0] should call triggerFn twice when 2 events are 600ms apart (outside debounce window)', async () => {
    const emitter = createFindingChangedEmitter(mockTriggerFn)

    const event1 = buildFindingChangedEvent({ findingId: 'separate-1' })
    const event2 = buildFindingChangedEvent({ findingId: 'separate-2' })

    // Event 1 at 0ms
    emitter.emit(event1)

    // Advance to 500ms — event 1 fires
    await vi.advanceTimersByTimeAsync(500)
    expect(mockTriggerFn).toHaveBeenCalledTimes(1)
    expect(mockTriggerFn).toHaveBeenCalledWith(event1)

    // Event 2 at 600ms (100ms after event 1 fired)
    await vi.advanceTimersByTimeAsync(100)
    emitter.emit(event2)

    // Advance to 1100ms (600 + 500) — event 2 fires
    await vi.advanceTimersByTimeAsync(500)
    expect(mockTriggerFn).toHaveBeenCalledTimes(2)
    expect(mockTriggerFn).toHaveBeenLastCalledWith(event2)
  })
})
