# Story S-FIX-7b: `assigned` Row Lifecycle Gap

Status: backlog

## Origin

Discovered during S-FIX-7 code review (2026-04-08). Mary (Analyst) + Winston (Architect) + John (PM) identified that **AC4 of S-FIX-7 only addresses `in_progress` row expiration**, leaving `status='assigned'` rows with no lifecycle management.

The developer bundled a 2nd UPDATE for `assigned` rows into S-FIX-7's cron (`releaseStaleAssignments.ts`), but this was scope expansion beyond AC4. Per guardrail discipline + John's call, S-FIX-7 was reverted to strict spec compliance and this story was created to capture the gap.

## Story

As a **QA Reviewer**,
I want **admin pre-assigned files to eventually expire if I never open them**,
so that **files don't get stuck in perpetual "assigned to X" state blocking other reviewers**.

## Context & Gap Analysis

### The Gap

After S-FIX-7:
- `status='in_progress' + stale lastActiveAt > 30min` → auto-released by cron ✓
- `status='assigned' + null lastActiveAt` (admin pre-assigned, reviewer never opened) → **never expires**
- `status='assigned' + stale lastActiveAt` (reviewer released via "Release file" button) → **never expires**

The partial unique index `uq_file_assignments_active WHERE status IN ('assigned', 'in_progress')` includes both statuses, so a stuck `assigned` row blocks any other reviewer from self-assigning.

### Why the Semantics Matter

Winston's key insight: **inactivity ≠ never-started**. These are two distinct states:

| State | Meaning | Correct TTL |
|---|---|---|
| `in_progress` + stale | Reviewer was working, walked away | 30 min (already done in S-FIX-7) |
| `assigned` + null `startedAt` | Admin pre-assigned, reviewer never opened | ??? (needs product decision — days? weeks?) |
| `assigned` + set `startedAt` | Reviewer started then released via button | Different again (user intent was to release) |

### What Exists Now

- `file_assignments.lastActiveAt` — only set for `in_progress` (via heartbeat)
- `file_assignments.startedAt` — set when `assigned → in_progress` transition
- `file_assignments.createdAt` — set at INSERT
- `updateAssignmentStatus.action.ts` — supports `in_progress → assigned` transition ("release") and sets `startedAt: null, lastActiveAt: null`

### What Needs to Be Decided (PM input required)

1. **TTL for admin pre-assigned never-opened files:** What's the right expiration window? 24h? 7d? 30d? Or no expiration (admin deletes manually)?
2. **TTL for reviewer-released files:** When a reviewer clicks "Release file" (and the self-assignment cancellation path from S-FIX-7 C4 doesn't apply), what state should the row end up in? Should it stay as `assigned`, or transition to `cancelled`?
3. **Notification semantics:** When an `assigned` row expires, should admin get notified? (S-FIX-7 AC4 explicitly chose no notification for `in_progress` expiration.)

## Acceptance Criteria (DRAFT — needs PM refinement)

### AC1: Admin Pre-Assignment TTL

**Given** an admin has created a `file_assignments` row with `status='assigned'` for reviewer X
**And** reviewer X has not opened the file (startedAt IS NULL) for **{TTL_DAYS} days**
**When** the Inngest cron runs
**Then** the row is transitioned to `status='cancelled'` with `completedAt = NOW()`
**And** an audit log entry is written: `action='auto_expire', reason='admin_assignment_not_started'`

### AC2: Released-Then-Abandoned TTL

**Given** a reviewer previously self-started a file (`startedAt IS NOT NULL`) and released it
**And** the row has `status='assigned'` with `startedAt != NULL, lastActiveAt = NULL`
**When** ??? (product decision needed — should released files go back to `assigned` pool or be cancelled immediately?)
**Then** ???

### AC3: Admin Notification (optional)

**Given** an admin pre-assignment expires via AC1
**When** the cron fires
**Then** admin receives a notification: "File X assigned to Reviewer Y was not started within {TTL_DAYS} days and has been released"

## Tasks (DRAFT — finalize after AC lock)

- [ ] Task 1: PM spec-lock session — finalize TTLs and notification rules
- [ ] Task 2: Add `AUTO_EXPIRE_ASSIGNED_DAYS` constant (or config)
- [ ] Task 3: Extend `releaseStaleAssignments.ts` cron OR create new cron `expireUnopenedAssignments.ts`
- [ ] Task 4: Add boundary tests for TTL (at, below, above, exactly)
- [ ] Task 5: If AC3 approved: add notification helper + RLS for admin notifications
- [ ] Task 6: E2E verification via Playwright MCP: create assigned row, wait or time-travel, verify expiration

## Dependencies

- **S-FIX-7 DONE** — this story requires S-FIX-7's cron infrastructure + audit helpers
- **S-FIX-7 C4 fix DONE** — Release button semantics (self-assigned → cancelled, admin-assigned → ???) must be resolved first because it determines what state "released" files end up in

## Notes from S-FIX-7 Review Party Discussion (2026-04-08)

- **Mary:** "Requirements gap, not scope expansion — the question of `assigned` expiry was never asked during S-FIX-7 planning."
- **Winston:** "Architecturally these are different failure modes with different correct TTLs — don't conflate them."
- **John:** "Strict S-FIX-7 scope, new story with PM spec lock before implementation."
- **Murat:** "Whatever TTL chosen, needs explicit boundary tests — don't rely on 'eventually' semantics."
- **Amelia:** "Option C (`startedAt IS NOT NULL` filter in S-FIX-7 cron) was tempting but adds coupling — cleaner to split into new story."

## References

- `_bmad-output/implementation-artifacts/s-fix-7-concurrent-soft-lock.md` — origin AC4 definition
- `src/features/pipeline/inngest/releaseStaleAssignments.ts` — existing cron this could extend
- `src/db/schema/fileAssignments.ts` — schema including `startedAt` nullability
- `src/features/project/actions/updateAssignmentStatus.action.ts:100-104` — Release handling
