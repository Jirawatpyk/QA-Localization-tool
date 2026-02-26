/**
 * ATDD Tests — Story 3.0: Score & Review Infrastructure
 * AC2: Debounced Event Emitter (`createFindingChangedEmitter`)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createFindingChangedEmitter } from '@/features/review/utils/finding-changed-emitter'
import { buildFindingChangedEvent } from '@/test/factories'
import type { FindingChangedEventData } from '@/types/pipeline'

describe('createFindingChangedEmitter', () => {
  let mockTriggerFn: ReturnType<typeof vi.fn<(data: FindingChangedEventData) => Promise<void>>>

  beforeEach(() => {
    vi.useFakeTimers()
    mockTriggerFn = vi.fn<(data: FindingChangedEventData) => Promise<void>>(() => Promise.resolve())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── P0: Core Debounce Behavior ──

  it('should call triggerFn after 500ms of silence', async () => {
    const emitter = createFindingChangedEmitter(mockTriggerFn)
    const event = buildFindingChangedEvent()
    emitter.emit(event)

    expect(mockTriggerFn).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(mockTriggerFn).toHaveBeenCalledOnce()
    expect(mockTriggerFn).toHaveBeenCalledWith(event)
  })

  it('should NOT call triggerFn before 500ms', async () => {
    const emitter = createFindingChangedEmitter(mockTriggerFn)
    emitter.emit(buildFindingChangedEvent())

    await vi.advanceTimersByTimeAsync(400)
    expect(mockTriggerFn).not.toHaveBeenCalled()
  })

  it('should emit only once for rapid changes within 500ms (last-event-wins)', async () => {
    const emitter = createFindingChangedEmitter(mockTriggerFn)
    emitter.emit(buildFindingChangedEvent({ findingId: 'f1' }))
    await vi.advanceTimersByTimeAsync(100)
    emitter.emit(buildFindingChangedEvent({ findingId: 'f2' }))
    await vi.advanceTimersByTimeAsync(100)
    const lastEvent = buildFindingChangedEvent({ findingId: 'f3' })
    emitter.emit(lastEvent)

    await vi.advanceTimersByTimeAsync(500)
    expect(mockTriggerFn).toHaveBeenCalledOnce()
    expect(mockTriggerFn).toHaveBeenCalledWith(lastEvent)
  })

  it('should cancel pending emission via cancel()', async () => {
    const emitter = createFindingChangedEmitter(mockTriggerFn)
    emitter.emit(buildFindingChangedEvent())

    await vi.advanceTimersByTimeAsync(300)
    emitter.cancel()

    await vi.advanceTimersByTimeAsync(500)
    expect(mockTriggerFn).not.toHaveBeenCalled()
  })

  // ── P1: Timer Reset ──

  it('should reset timer on each new emit() call', async () => {
    const emitter = createFindingChangedEmitter(mockTriggerFn)
    emitter.emit(buildFindingChangedEvent({ findingId: 'f1' }))

    await vi.advanceTimersByTimeAsync(400)
    // Re-emit resets the 500ms window
    emitter.emit(buildFindingChangedEvent({ findingId: 'f2' }))

    await vi.advanceTimersByTimeAsync(400)
    expect(mockTriggerFn).not.toHaveBeenCalled() // Only 400ms since last emit

    await vi.advanceTimersByTimeAsync(100)
    expect(mockTriggerFn).toHaveBeenCalledOnce()
  })

  // ── P1-BV: Boundary Values ──

  it('should NOT emit at exactly 499ms', async () => {
    const emitter = createFindingChangedEmitter(mockTriggerFn)
    emitter.emit(buildFindingChangedEvent())

    await vi.advanceTimersByTimeAsync(499)
    expect(mockTriggerFn).not.toHaveBeenCalled()
  })

  it('should emit at exactly 500ms', async () => {
    const emitter = createFindingChangedEmitter(mockTriggerFn)
    emitter.emit(buildFindingChangedEvent())

    await vi.advanceTimersByTimeAsync(500)
    expect(mockTriggerFn).toHaveBeenCalledOnce()
  })

  it('should emit once for 10 rapid changes within 500ms', async () => {
    const emitter = createFindingChangedEmitter(mockTriggerFn)
    for (let i = 0; i < 10; i++) {
      emitter.emit(buildFindingChangedEvent({ findingId: `f${i}` }))
      await vi.advanceTimersByTimeAsync(40) // 10 × 40ms = 400ms total
    }

    await vi.advanceTimersByTimeAsync(500)
    expect(mockTriggerFn).toHaveBeenCalledOnce()
  })
})
