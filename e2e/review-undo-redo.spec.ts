/**
 * Story 4.4b ATDD: Undo/Redo E2E Tests
 * Tests: AC1 (single undo), AC2 (bulk undo), AC3 (severity undo), AC5 (redo), AC6 (stack lifecycle)
 *
 * TDD RED phase — all tests use test.skip() pending implementation.
 */
import { test, expect } from '@playwright/test'

test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')

// ── P0: AC1 — Single undo via Ctrl+Z ──

test.skip('E-01: should undo accept via Ctrl+Z and revert finding to pending', async ({ page }) => {
  // TODO(story-4.4b):
  // 1. signupOrLogin → createTestProject → seedFileWithFindings (status='pending')
  // 2. Navigate to review page, wait for hydration
  // 3. Click finding row → press 'a' (accept) → wait for success toast
  // 4. Verify finding status = 'accepted' in UI
  // 5. Press Ctrl+Z → wait for "Undone:" toast
  // 6. Verify finding status = 'pending' in UI
  // 7. Verify score recalculated
})

// ── P1: AC2 — Bulk undo via Ctrl+Z ──

test.skip('E-02: should undo bulk accept and revert all findings', async ({ page }) => {
  // TODO(story-4.4b):
  // 1. Seed 3+ findings
  // 2. Multi-select (Shift+Click or Ctrl+A)
  // 3. Bulk accept → wait for toast
  // 4. Ctrl+Z → all 3 revert to pending
})

// ── P1: AC5 — Redo via Ctrl+Shift+Z ──

test.skip('E-03: should redo via Ctrl+Shift+Z after undo', async ({ page }) => {
  // TODO(story-4.4b):
  // 1. Accept finding → Ctrl+Z (undo) → Ctrl+Shift+Z (redo)
  // 2. Verify finding back to 'accepted'
})

// ── P2: AC3 — Severity override undo ──

test.skip('E-04: should undo severity override and restore original severity', async ({ page }) => {
  // TODO(story-4.4b):
  // 1. Override severity Critical → Minor
  // 2. Ctrl+Z → severity reverts to Critical
  // 3. Score updates
})

// ── P1: AC6 — Stack clears on file switch ──

test.skip('E-05: should clear undo stack on file switch (Ctrl+Z = no-op)', async ({ page }) => {
  // TODO(story-4.4b):
  // 1. Accept finding → verify undo available
  // 2. Navigate to different file
  // 3. Ctrl+Z → nothing happens (no toast, no revert)
})
