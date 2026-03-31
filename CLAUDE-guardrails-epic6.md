# Epic 6 Proactive Guardrails — Batch Processing & Team Collaboration

**Date:** 2026-03-30
**Status:** ACTIVE
**Source Research:**

- Notification Spike: `_bmad-output/planning-artifacts/research/notification-spike-2026-03-30.md`
- File Assignment UX Spike: `_bmad-output/planning-artifacts/research/file-assignment-ux-spike-2026-03-30.md`
- Viewport Transition Refactor Plan: `_bmad-output/planning-artifacts/research/viewport-transition-refactor-plan-2026-03-30.md`

---

## File Assignment & Soft Lock

79. **File assignment status: use union type, not bare string** — `FileAssignmentStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled'`. Update existing `FILE_ASSIGNMENT_STATUSES` in `src/types/assignment.ts` (currently `pending/accepted/completed` — AC requires `assigned/in_progress/completed`, add `cancelled` for takeover). `FileAssignmentPriority = 'normal' | 'urgent'`. Never use bare `string` for status/priority fields. (Source: file-assignment-ux-spike S1.3)

80. **Soft lock via DB `last_active_at`, not Supabase Presence** — Use a `last_active_at` timestamptz column on `file_assignments` with 30-second heartbeat via Server Action. Stale threshold = 2 minutes. Do NOT use Supabase Realtime Presence for soft lock — it adds complexity for the 6-9 concurrent user target (NFR20) without benefit. The heartbeat pattern is simpler and sufficient. (Source: file-assignment-ux-spike S3)

81. **Soft lock race condition: optimistic locking on takeover** — "Take Over" must check `current assignment_id = expected` in the UPDATE WHERE clause. If another user took over between load and click, the UPDATE affects 0 rows → return conflict error. Never use `DELETE + INSERT` for takeover — use `UPDATE status = 'cancelled'` on old + `INSERT` new in a transaction. (Source: file-assignment-ux-spike S3)

82. **One active assignment per file** — Enforce via partial unique index: `UNIQUE(file_id, tenant_id) WHERE status IN ('assigned', 'in_progress')`. Multiple cancelled/completed assignments allowed (history). App-level check before INSERT as defense-in-depth. (Source: file-assignment-ux-spike S1.3)

83. **Reviewer workload query: LEFT JOIN + COUNT FILTER** — Use `LEFT JOIN file_assignments` with `COUNT(*) FILTER (WHERE status IN ('assigned', 'in_progress'))` for workload. Never use subquery-per-reviewer (N+1). Sort by workload ASC so lowest-loaded reviewer appears first. Include `withTenant()` on the JOIN. (Source: file-assignment-ux-spike S2.1)

84. **Priority queue via Inngest `priority` config** — Use `priority.run: "event.data.priority === 'urgent' ? 100 : 0"` in Inngest function config. Do NOT create separate urgent/normal queues. The existing `concurrency: [{ key: 'event.data.projectId', limit: 1 }]` serializes per project — priority determines order within the queue. (Source: file-assignment-ux-spike S4)

## Notifications

85. **Centralize notification INSERT into helper** — Create `createNotification()` helper function. Currently 5 scattered INSERT sites (scoreFile, flagForNative, confirmNativeReview, overrideNativeReview, addFindingComment). Epic 6 adds 4 more (analysis_complete, file_assigned, glossary_updated, auto_pass_triggered). Do NOT add more inline `db.insert(notifications)` — use the centralized helper which handles: tenant scoping, non-blocking try/catch (Guardrail #74), consistent metadata shape. (Source: notification-spike S1.2)

86. **Notification grouping: server-side query, not INSERT-time** — Group notifications at display/query time using `project_id` + `type` + 5-minute window. Do NOT merge rows at INSERT time (race conditions from concurrent Inngest steps). The query uses `ROW_NUMBER() OVER (PARTITION BY type, project_id ORDER BY created_at DESC)` to identify group leaders. Client receives grouped results. (Source: notification-spike S3)

87. **Notification schema: add `project_id` FK + `archived_at`** — Add `project_id uuid FK → projects.id CASCADE` (currently in metadata JSONB — move to column for grouping/indexing). Add `archived_at timestamptz` nullable for soft-delete auto-archive. Add partial indexes: `idx_notifications_user_unread` on `(user_id, created_at DESC) WHERE is_read = false`, `idx_notifications_archive` on `(created_at) WHERE archived_at IS NULL`. (Source: notification-spike S7)

88. **Notification auto-archive: Inngest cron, soft delete** — Daily cron (03:00 UTC, same pattern as `cleanBTCache.ts`). Set `archived_at = now()` WHERE `created_at < now() - 30 days AND archived_at IS NULL`. Do NOT hard-delete — archived notifications remain queryable for audit. Register in `src/app/api/inngest/route.ts` functions array. (Source: notification-spike S4)

89. **Notification RLS policy required** — Add `notifications_select_own` policy: `USING (user_id = auth.uid() AND tenant_id = jwt.tenant_id)`. Currently no RLS on notifications — relies on app-level `withTenant()` + `eq(userId)` only. Supabase Realtime respects RLS, so this also secures the Realtime channel. (Source: notification-spike S2.4)

90. **Toast coalescing for batch events** — When batch processing completes (5+ files), use `queueMicrotask` batching in the Realtime handler to coalesce toasts within a single event loop tick. Show "Analysis complete for N files" instead of N individual toasts. The dropdown shows individual items. (Source: notification-spike S6)

## Responsive & Layout

91. **All responsive viewport logic via `useViewportTransition` hook** — New review page UI must use the centralized `useViewportTransition` hook (created in Epic 5 retro P2). Do NOT add viewport-dependent state directly to ReviewPageClient or new components. If the hook needs extension, extend it — don't scatter logic. (Source: viewport-transition-refactor-plan)

92. **Responsive E2E test-first for review page changes** — Any story that modifies review page UI must write responsive E2E tests BEFORE implementation code. Run at desktop (1440+), laptop (1024-1439), and mobile (<1024). This is a process rule, not just a testing rule. (Source: Epic 5 retro A1)

## General Epic 6

93. **`result.output` access: try/catch only** — AI SDK 6.0 `result.output` is a throwing getter. Always wrap in try/catch. Never use `if (!result.output)`, `result.output?.field`, or `expect(result.output).toBeDefined()`. See Guardrail #10 update + anti-pattern list. (Source: BT bug investigation 2026-03-30, proven in L2/L3 production code)

94. **Metadata merge, never replace** — When adding keys to `review_actions.metadata` or `file_assignments.metadata`, always merge with existing keys using spread: `{ ...existing, newKey: value }`. Never `metadata: { newKey: value }` which destroys existing data (e.g., `isManual`, `undoType`, `non_native`). (Source: Epic 5 retro A2, Story 5.2a challenge)
