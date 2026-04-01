# Story 6.2a: Notification Schema & Helper Centralization

Status: review

## Story

As a developer building the notification system,
I want the notification schema, helper, and type infrastructure fully hardened and complete,
So that Stories 6-2b/c/d can build on a solid, type-safe, and queryable foundation without rework.

## Context: What Story 6.1 Already Delivered

> **CRITICAL:** Story 6.1 absorbed ~80% of the original 6-2a scope. Read this before implementing.

| Artifact | Status | Location |
|----------|--------|----------|
| `notifications` schema (project_id, archived_at columns) | DONE | `src/db/schema/notifications.ts` |
| `createNotification()` + `createBulkNotification()` | DONE | `src/lib/notifications/createNotification.ts` |
| `NotificationType` union type + 8 constants | DONE | `src/lib/notifications/createNotification.ts` |
| All 5 original INSERT sites migrated to helper | DONE | scoreFile, flagForNative, confirmNativeReview, overrideNativeReview, addFindingComment |
| RLS SELECT/UPDATE policies (user-scoped) | DONE | `src/db/migrations/0021_notifications_rls_user_scoped.sql` |
| 2 partial indexes (user_unread, archive_sweep) | DONE | migration 0021 |
| Realtime subscription (postgres_changes INSERT) | DONE | `src/features/dashboard/hooks/useNotifications.ts` |
| NotificationDropdown UI + tests | DONE | `src/features/dashboard/components/NotificationDropdown.tsx` |
| createNotification unit tests | DONE | `src/lib/notifications/createNotification.test.ts` |
| RLS tests for notifications | DONE | `src/db/__tests__/rls/notifications.rls.test.ts` |

**This story closes the remaining gaps to make the foundation production-ready for 6-2b/c/d.**

## Acceptance Criteria

### AC1: `getNotifications` Filters Archived Notifications

**Given** the notifications table has rows with `archived_at` set (will be populated by 6-2d cron)
**When** a user fetches their notification list
**Then** `getNotifications.action.ts` includes `isNull(notifications.archivedAt)` in the WHERE clause
**And** archived notifications are excluded from the dropdown

### AC2: Missing Grouping Index Added

**Given** Story 6-2c will need server-side grouping by `(user_id, type, created_at)`
**When** the grouping query runs
**Then** a partial index exists: `idx_notifications_user_type_created ON notifications (user_id, type, created_at DESC) WHERE archived_at IS NULL`
**And** the migration is idempotent (`CREATE INDEX IF NOT EXISTS`)

### AC3: New Event Type Constants for 6-2b

**Given** Story 6-2b will wire 3 new event types (note: `file_assigned` already exists from 6.1)
**When** 6-2b dev imports from `createNotification.ts`
**Then** `NOTIFICATION_TYPES` adds these 3 constants:
- `ANALYSIS_COMPLETE: 'analysis_complete'`
- `GLOSSARY_UPDATED: 'glossary_updated'`
- `AUTO_PASS_TRIGGERED: 'auto_pass_triggered'`
**And** `NotificationType` union type automatically includes them (derived from `typeof NOTIFICATION_TYPES`)
**And** total constants = 11 (8 existing + 3 new)

### AC4: `AppNotification.type` Uses `NotificationType` (Guardrail #22)

**Given** `AppNotification` in `src/features/dashboard/types.ts` currently uses `type: string`
**When** the dev agent tightens the type
**Then** `type` field is `NotificationType` (imported from `@/lib/notifications/createNotification`)
**And** all consumers compile without error
**And** the Realtime Zod schema (`rawNotificationSchema`) in `useNotifications.ts` validates against known types using `z.enum([...Object.values(NOTIFICATION_TYPES)])`

### AC5: `getNotificationLink()` Navigation Helper

**Given** notifications need click-to-navigate (6-2c depends on this)
**When** a notification is clicked
**Then** a helper function `getNotificationLink(notif: AppNotification): string | null` exists at `src/features/dashboard/helpers/getNotificationLink.ts`
**And** it maps notification types to routes:

| Type | Link Pattern |
|------|-------------|
| `analysis_complete` | `/projects/{projectId}/review/{fileId}` |
| `file_assigned` | `/projects/{projectId}/review/{fileId}` |
| `file_reassigned` | `/projects/{projectId}/review/{fileId}` |
| `file_urgent` | `/projects/{projectId}/review/{fileId}` |
| `assignment_completed` | `/projects/{projectId}/review/{fileId}` |
| `glossary_updated` | `/projects/{projectId}/glossary` |
| `auto_pass_triggered` | `/projects/{projectId}/review/{fileId}` |
| `finding_flagged_for_native` | `/projects/{projectId}/review/{fileId}?findingId={findingId}` |
| `native_review_completed` | `/projects/{projectId}/review/{fileId}?findingId={findingId}` |
| `native_comment_added` | `/projects/{projectId}/review/{fileId}?findingId={findingId}` |
| `language_pair_graduated` | `/projects/{projectId}/settings` |

**And** returns `null` when metadata is missing required IDs
**And** has unit tests covering each type + null fallback

**Metadata contract** (verified from actual code — `projectId` column is separate from metadata):

| Type | metadata shape | Notes |
|------|---------------|-------|
| `file_assigned` | `{ fileId, assignmentId, priority }` | projectId via column |
| `file_urgent` | `{ fileId, assignmentId }` | projectId via column |
| `file_reassigned` | `{ fileId, oldAssignmentId, newAssignmentId }` | projectId via column |
| `assignment_completed` | `{ fileId, assignmentId }` | projectId via column |
| `finding_flagged_for_native` | `{ findingId, projectId, fileId, assignmentId }` | projectId in metadata too |
| `native_review_completed` | `{ findingId, projectId, fileId, assignmentId }` | projectId in metadata too |
| `native_comment_added` | `{ findingId, assignmentId, commentId }` | **NO projectId, NO fileId** |
| `language_pair_graduated` | `{ sourceLang, targetLang, fileCount, projectId }` | projectId in metadata |
| `analysis_complete` | TBD (6-2b) | |
| `glossary_updated` | TBD (6-2b) | |
| `auto_pass_triggered` | TBD (6-2b) | |

**WARNING for `getNotificationLink()`:** `native_comment_added` lacks `projectId` and `fileId` in metadata. The helper MUST handle this gracefully — look up from `assignmentId` or return `null`. Do NOT assume all types have `projectId` in metadata; check column first, then metadata fallback.

### AC6: Notification Event Type Icon Mapping

**Given** Story 6-2c needs event-specific icons for the dropdown
**When** rendering a notification
**Then** a mapping `NOTIFICATION_ICON_MAP` exists at `src/features/dashboard/helpers/notificationIcons.ts`
**And** maps each `NotificationType` to `{ icon: LucideIcon, colorClass: string }`:

| Type | Icon | Color Class |
|------|------|-------------|
| `analysis_complete` | `CheckCircle` | `text-success` |
| `file_assigned` | `FileText` | `text-primary` |
| `file_reassigned` | `ArrowRightLeft` | `text-warning` |
| `file_urgent` | `AlertTriangle` | `text-destructive` |
| `assignment_completed` | `CheckSquare` | `text-success` |
| `glossary_updated` | `BookOpen` | `text-info` |
| `auto_pass_triggered` | `ShieldCheck` | `text-success` |
| `finding_flagged_for_native` | `Flag` | `text-warning` |
| `native_review_completed` | `CheckSquare` | `text-success` |
| `native_comment_added` | `MessageSquare` | `text-info` |
| `language_pair_graduated` | `GraduationCap` | `text-success` |

**And** uses design token color classes (not arbitrary Tailwind colors per anti-pattern)
**And** has a sensible fallback for unknown types: `{ icon: Bell, colorClass: 'text-muted-foreground' }`

### AC7: `visibilitychange` Re-fetch in `useNotifications`

**Given** a user has multiple browser tabs open
**When** they mark notifications as read in one tab and switch to another
**Then** `useNotifications` listens for `visibilitychange` events
**And** re-fetches from `getNotifications()` when tab becomes visible
**And** merges fresh data into state (replacing stale data)
**And** does NOT fire on initial mount (only on tab re-focus)

### AC8: Unit Tests for New Helpers

**Given** the new helpers and changes
**When** tests run
**Then** the following test files exist and pass:
- `src/features/dashboard/helpers/getNotificationLink.test.ts` — each type + null cases
- `src/features/dashboard/helpers/notificationIcons.test.ts` — each type + fallback
- Updated `src/features/dashboard/hooks/useNotifications.test.ts` — visibilitychange behavior
- Updated `src/lib/notifications/createNotification.test.ts` — new type constants

## Tasks / Subtasks

- [x] **T1: Migration — add grouping index** (AC: #2)
  - [x] Create migration `src/db/migrations/0024_notifications_grouping_index.sql` (latest is 0023)
  - [x] `CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created ON notifications (user_id, type, created_at DESC) WHERE archived_at IS NULL;`
  - [x] Add journal entry in `src/db/migrations/meta/_journal.json` — copy format from existing entries: `{ "idx": 25, "version": "7", "when": <unix_ms>, "tag": "0024_notifications_grouping_index", "breakpoints": true }`
  - [x] Snapshot skipped — consistent with existing manual SQL pattern (0016, 0021, 0022 have no snapshots)
  - [x] Verify with `npm run db:generate` — no drift ✅
  - [x] Also fixed missing journal entry for 0023_story_6_1_realtime_index_fix (idx 24)

- [x] **T2: Add new NOTIFICATION_TYPES constants** (AC: #3)
  - [x] Add `ANALYSIS_COMPLETE`, `GLOSSARY_UPDATED`, `AUTO_PASS_TRIGGERED` to `NOTIFICATION_TYPES` in `src/lib/notifications/types.ts` (extracted to shared types module)
  - [x] `NotificationType` union auto-updates (derived type)
  - [x] Update createNotification.test.ts to cover new types — 11 constants verified

- [x] **T3: Tighten `AppNotification.type` to `NotificationType`** (AC: #4)
  - [x] Import `NotificationType` in `src/features/dashboard/types.ts`
  - [x] Change `type: string` to `type: NotificationType`
  - [x] Update `rawNotificationSchema` in `useNotifications.ts`: change `type: z.string()` to `z.enum([...Object.values(NOTIFICATION_TYPES)] as [string, ...string[]])`
  - [x] Run `npm run type-check` — fixed 6 type errors across 4 files

- [x] **T4: Fix `getNotifications` archived filter + fix test mock** (AC: #1, #8)
  - [x] Add `isNull(notifications.archivedAt)` to WHERE clause in `src/features/dashboard/actions/getNotifications.action.ts`
  - [x] Import `isNull` from `drizzle-orm`
  - [x] Fix `TODO(TD-TEST-013)` — replaced Proxy mock with `drizzleMock`, removed TODO, added DB error test

- [x] **T5: Create `getNotificationLink()` helper** (AC: #5)
  - [x] Create `src/features/dashboard/helpers/getNotificationLink.ts`
  - [x] Type-safe switch on `NotificationType`, extract IDs from `metadata`
  - [x] Return `string | null` (null when metadata lacks required IDs)
  - [x] Create `src/features/dashboard/helpers/getNotificationLink.test.ts` — 19 tests

- [x] **T6: Create notification icon mapping** (AC: #6)
  - [x] Create `src/features/dashboard/helpers/notificationIcons.ts`
  - [x] Export `NOTIFICATION_ICON_MAP: Record<NotificationType, { icon: LucideIcon; colorClass: string }>`
  - [x] Add fallback for unknown types (`getNotificationIcon()` returns `Bell` + `text-muted-foreground`)
  - [x] Create `src/features/dashboard/helpers/notificationIcons.test.ts` — 6 tests

- [x] **T7: Add `visibilitychange` re-fetch to `useNotifications`** (AC: #7)
  - [x] Add `useEffect` with `visibilitychange` listener
  - [x] On `document.visibilityState === 'visible'` → call `getNotifications()` and replace state
  - [x] Wrap `.then().catch(() => {})` (non-critical, non-blocking)
  - [x] Add unit test for the behavior — 2 tests (visible + hidden)

- [x] **T8: Verify and run all tests** (AC: #8)
  - [x] `npm run test:unit` — 4520 pass (2 pre-existing NoteInput failures, unrelated)
  - [x] `npm run lint` — 0 errors
  - [x] `npm run type-check` — 0 errors
  - [x] Regression check: 22 files, 215 tests pass in dashboard + notifications modules
  - [x] Verify existing createNotification.test.ts still passes with new types ✅

## Dev Notes

### Architecture & Patterns

- **Feature module location:** `src/features/dashboard/` — notifications live under dashboard feature (established in Epic 1)
- **Centralized helper location:** `src/lib/notifications/` — shared across features (established in Story 6.1)
- **Helpers go in:** `src/features/dashboard/helpers/` — create this directory if needed
- **Named exports only** — no `export default`
- **`@/` alias** for all imports

### Existing Files to Modify

| File | Change |
|------|--------|
| `src/lib/notifications/createNotification.ts` | Add 3 new type constants |
| `src/features/dashboard/types.ts` | Change `type: string` → `type: NotificationType` |
| `src/features/dashboard/hooks/useNotifications.ts` | Add Zod enum validation + `visibilitychange` re-fetch |
| `src/features/dashboard/actions/getNotifications.action.ts` | Add `isNull(archivedAt)` filter |

### New Files to Create

| File | Purpose |
|------|---------|
| `src/db/migrations/XXXX_notifications_grouping_index.sql` | Grouping query index |
| `src/features/dashboard/helpers/getNotificationLink.ts` | Click-to-navigate mapping |
| `src/features/dashboard/helpers/getNotificationLink.test.ts` | Tests |
| `src/features/dashboard/helpers/notificationIcons.ts` | Icon + color mapping per type |
| `src/features/dashboard/helpers/notificationIcons.test.ts` | Tests |

### Critical Guardrails

| # | Rule | How It Applies |
|---|------|----------------|
| #22 | No bare `string` for status/severity | Tighten `AppNotification.type` to `NotificationType` union |
| #85 | Centralize notification INSERT into helper | Already done — verify no new inline `db.insert(notifications)` |
| #86 | Grouping: server-side, not INSERT-time | Add index now, grouping query in 6-2c |
| #87 | Schema: `project_id` + `archived_at` + indexes | project_id/archived_at done, add missing grouping index |
| #89 | RLS policy required | Already done — SELECT + UPDATE user-scoped |
| #90 | Toast coalescing for batch events | `queueMicrotask` batching deferred to 6-2c |
| #2 | Audit log non-fatal | Notification helpers are already non-blocking (try/catch + logger.error). No audit log needed for notification reads/UI changes — only state-changing actions require audit |
| #94 | Metadata merge, never replace | `getNotificationLink()` reads metadata only. But if future code updates notification metadata, MUST spread: `{ ...existing, newKey }` — never overwrite |

### Tech Debt Addressed in This Story

| TD | File | Issue | Task |
|----|------|-------|------|
| `TODO(TD-TEST-013)` | `src/features/dashboard/actions/__tests__/getNotifications.action.test.ts:163` | Proxy mock doesn't verify `withTenant()` in WHERE — replace with `drizzleMock` | T4 |
| TD-DASH-003 extension | `src/features/dashboard/hooks/useNotifications.ts` | Zod validation uses `z.string()` (too loose) — tighten to `z.enum(NOTIFICATION_TYPES)` | T3 |

### Blocking Dependencies

- **6-2b depends on:** T2 (new type constants) — cannot wire new events without constants
- **6-2c depends on:** T5 (getNotificationLink), T6 (icon mapping) — cannot build click-to-navigate or icon UI without helpers
- **6-2d depends on:** T1 (grouping index uses `WHERE archived_at IS NULL`), T4 (getNotifications filter)

### Migration Gotchas (from Memory)

- **Manual SQL files need journal entries** — without `_journal.json` entry, Drizzle skips them
- `CREATE INDEX IF NOT EXISTS` for idempotency
- Run `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx drizzle-kit migrate` for local
- Do NOT run `db:migrate` from multiple agents concurrently — race condition

### Zod Schema Tightening (AC4)

The `rawNotificationSchema` in `useNotifications.ts` currently uses `type: z.string()`. Tighten to:

```typescript
import { NOTIFICATION_TYPES } from '@/lib/notifications/createNotification'

const notificationTypeValues = Object.values(NOTIFICATION_TYPES)

const rawNotificationSchema = z.object({
  // ...existing fields...
  type: z.enum(notificationTypeValues as [string, ...string[]]),
  // ...
})
```

**Discarded type logging:** If `rawNotificationSchema.safeParse()` fails on the `type` field, log it (rate-limited, once per minute) so new types added without updating `NOTIFICATION_TYPES` are discoverable:

```typescript
// In Realtime handler, after safeParse fails:
if (!parsed.success) {
  logger.warn({ payload: payload.new, error: parsed.error }, 'Unknown notification type in Realtime')
  return
}
```

**Caution:** If a future event type is inserted without adding to `NOTIFICATION_TYPES` first, the Zod parse will reject it and the Realtime handler will silently skip it. This is intentional — forces type-safety. But document this in the helper JSDoc.

### `visibilitychange` Pattern (AC7)

```typescript
// In useNotifications — add alongside existing useEffects
useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      getNotifications()
        .then((result) => {
          if (result.success) setNotifications(result.data)
        })
        .catch(() => {}) // Non-critical
    }
  }
  document.addEventListener('visibilitychange', handleVisibility)
  return () => document.removeEventListener('visibilitychange', handleVisibility)
}, []) // No deps needed — getNotifications uses server auth context
```

**Note:** This is a full-replace merge (not deep merge) — last response wins. If another tab changes state during the fetch, the refetch result replaces everything.

### Design Token Color Classes

Use existing token-based classes from `src/styles/tokens.css`. Do NOT use arbitrary Tailwind colors:
- `text-success` / `text-destructive` / `text-warning` / `text-primary` / `text-info` / `text-muted-foreground`
- **Verified:** `--color-success` (#047857) and `--color-info` (#3b82f6) exist in `tokens.css`. Tailwind v4 `@theme` auto-generates `text-success`, `text-info` utilities. Already used in: `UploadProgressList`, `ConfidenceIndicator`, `ScoreBadge`

### Previous Story Intelligence (Story 6.1)

**Key learnings from Story 6.1:**
- `createNotification` uses fire-and-forget pattern: caller does `.catch(() => {})` 
- Bulk notifications use `createBulkNotification()` for multiple recipients (e.g., all admins)
- `metadata` contains contextual IDs: `{ fileId, projectId, assignmentId, priority, ... }`
- The `projectId` is stored both as a column AND in metadata (column for queries, metadata for context)
- RLS policies use `((SELECT auth.jwt()) ->> 'sub')::uuid` pattern (not `auth.uid()`)
- All file assignment actions (assignFile, takeOverFile, updateAssignmentStatus) already use the centralized helper

**Code Review findings from 6.1 (R1+R2):**
- SoftLockWrapper needed `mountedRef` fix for unmount race
- Heartbeat needed to fire for both `assigned` and `in_progress` statuses
- `getFileAssignment` needed ownership check (security)
- FileAssignmentCell needed ARIA labels

### Project Structure Notes

- All new files follow existing dashboard feature module structure
- Helpers directory (`helpers/`) is a standard pattern in feature modules
- Icon mappings follow the severity icon pattern from Guardrail #15 (shape + text + color)
- Tests co-located next to source files

### References

- [Source: `_bmad-output/planning-artifacts/research/notification-spike-2026-03-30.md`] — Full notification system design
- [Source: `CLAUDE-guardrails-epic6.md#85-90`] — Notification guardrails
- [Source: `src/lib/notifications/createNotification.ts`] — Existing helper (8 types, 92 lines)
- [Source: `src/db/migrations/0021_notifications_rls_user_scoped.sql`] — RLS + indexes
- [Source: `src/features/dashboard/hooks/useNotifications.ts`] — Realtime subscription hook
- [Source: `src/features/dashboard/components/NotificationDropdown.tsx`] — UI component
- [Source: `_bmad-output/implementation-artifacts/6-1-file-assignment-language-pair-matching.md`] — Previous story

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- T1: Fixed missing 0023 journal entry before creating 0024 — Drizzle would have skipped it
- T3: Linter extracted `NOTIFICATION_TYPES` to `@/lib/notifications/types.ts` (client-safe, no server-only deps) — adapted all imports
- T3: Fixed 6 type errors from tightening `AppNotification.type` — test mocks used invalid types (`file_processed`, `score_updated`, `info`)
- T3: `z.enum()` with `[string, ...string[]]` cast loses literal types — used `as NotificationType` cast in mappers

### Completion Notes List

- **AC1** ✅ `getNotifications` filters archived via `isNull(notifications.archivedAt)`
- **AC2** ✅ Migration `0024_notifications_grouping_index.sql` — partial index on `(user_id, type, created_at DESC) WHERE archived_at IS NULL`
- **AC3** ✅ 3 new constants: `ANALYSIS_COMPLETE`, `GLOSSARY_UPDATED`, `AUTO_PASS_TRIGGERED` — total 11
- **AC4** ✅ `AppNotification.type` is `NotificationType`, Zod schema uses `z.enum()` with known types
- **AC5** ✅ `getNotificationLink()` — 11 types mapped to routes, null fallback for missing metadata
- **AC6** ✅ `NOTIFICATION_ICON_MAP` — 11 types with Lucide icons + design token colors, Bell fallback
- **AC7** ✅ `visibilitychange` re-fetch replaces stale state on tab focus
- **AC8** ✅ All test files exist and pass: 19 link + 6 icon + 9 hook + 6 action + 6 createNotification tests
- **TD-TEST-013** ✅ Resolved — Proxy mock replaced with `drizzleMock`
- **TD-DASH-003** ✅ Resolved — Zod `z.string()` tightened to `z.enum(NOTIFICATION_TYPES)`

### File List

**New files:**
- `src/db/migrations/0024_notifications_grouping_index.sql`
- `src/lib/notifications/types.ts` (extracted by linter from createNotification.ts)
- `src/features/dashboard/helpers/getNotificationLink.ts`
- `src/features/dashboard/helpers/getNotificationLink.test.ts`
- `src/features/dashboard/helpers/notificationIcons.ts`
- `src/features/dashboard/helpers/notificationIcons.test.ts`

**Modified files:**
- `src/db/migrations/meta/_journal.json` (added entries for 0023 + 0024)
- `src/lib/notifications/createNotification.ts` (re-exports from types.ts)
- `src/lib/notifications/createNotification.test.ts` (new type assertions)
- `src/features/dashboard/types.ts` (type: string → NotificationType)
- `src/features/dashboard/hooks/useNotifications.ts` (Zod enum + visibilitychange)
- `src/features/dashboard/hooks/useNotifications.test.ts` (server-only mock + visibility tests)
- `src/features/dashboard/actions/getNotifications.action.ts` (isNull archived filter)
- `src/features/dashboard/actions/__tests__/getNotifications.action.test.ts` (drizzleMock replacement)
- `src/features/dashboard/components/NotificationDropdown.test.tsx` (fixed invalid type strings)

## Change Log

- **2026-04-01:** Story 6-2a implemented — all 8 tasks complete, 8 ACs satisfied, 2 TDs resolved
