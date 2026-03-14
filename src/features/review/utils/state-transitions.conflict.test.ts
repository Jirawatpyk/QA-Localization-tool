/**
 * Epic 3 P1 Tests — previous_state Mismatch Conflict (P1-16, Chaos #9)
 * Tests: getNewState transition validation used for conflict detection.
 * When the DB state has changed between optimistic UI update and server action,
 * the client-side getNewState result will differ from what the server sees.
 *
 * These tests validate the transition matrix produces correct results for
 * the conflict detection scenario (Guardrail #35: undo stack verifies previous_state).
 */
import { describe, it, expect } from 'vitest'

import { getNewState } from '@/features/review/utils/state-transitions'

describe('state-transitions — conflict detection (P1-16)', () => {
  it('[P1] should return "accepted" when transitioning from pending → accept (matching DB state)', () => {
    // Scenario: UI shows pending, DB is pending — transition matches
    const dbState = 'pending' as const
    const action = 'accept' as const

    const result = getNewState(action, dbState)

    // Success: transition produces 'accepted'
    expect(result).toBe('accepted')
  })

  it('[P1] should produce mismatch when UI expects pending but DB is rejected', () => {
    // Scenario: UI attempted accept on 'pending', but another reviewer
    // already rejected it. The server will compute transition from 'rejected' state.

    // Client-side: UI thinks state is 'pending' → accept → expects 'accepted'
    const clientTransition = getNewState('accept', 'pending')
    expect(clientTransition).toBe('accepted')

    // Server-side: actual DB state is 'rejected' → accept → produces 're_accepted'
    const serverTransition = getNewState('accept', 'rejected')
    expect(serverTransition).toBe('re_accepted')

    // Conflict: client expected 'accepted' but server produces 're_accepted'
    // This mismatch triggers conflict dialog (Guardrail #35)
    expect(clientTransition).not.toBe(serverTransition)
  })

  it('[P1] should return "rejected" when transitioning from accepted → reject (matching DB state)', () => {
    // Scenario: UI shows accepted, DB is accepted — reviewer changes mind
    const dbState = 'accepted' as const
    const action = 'reject' as const

    const result = getNewState(action, dbState)

    // Success: valid transition from accepted → rejected
    expect(result).toBe('rejected')
  })
})
