# Notification Spike: Epic 6 Story 6.2 -- Event Notifications & Real-time Updates

**Owner:** Research Spike
**Created:** 2026-03-30
**Epic:** 6 (Batch Processing & Team Collaboration)
**FR:** FR60 (User Notifications)
**Status:** Research complete -- ready for story creation

---

## Table of Contents

1. [Current State Inventory](#1-current-state-inventory)
2. [Supabase Realtime Channel Design](#2-supabase-realtime-channel-design)
3. [Grouped Notification Pattern](#3-grouped-notification-pattern)
4. [30-Day Auto-Archive Strategy](#4-30-day-auto-archive-strategy)
5. [Toast + Persistent Dropdown Pattern](#5-toast--persistent-dropdown-pattern)
6. [Performance Considerations](#6-performance-considerations)
7. [Schema Changes Required](#7-schema-changes-required)
8. [Summary of Recommendations](#8-summary-of-recommendations)

---

## 1. Current State Inventory

### 1.1 Existing `notifications` Table Schema

The table already exists in `src/db/schema/notifications.ts`:

```
notifications
  id           uuid PK (default random)
  tenant_id    uuid NOT NULL FK -> tenants.id (restrict)
  user_id      uuid NOT NULL FK -> users.id (cascade)
  type         varchar(50) NOT NULL
  title        varchar(255) NOT NULL
  body         text NOT NULL
  is_read      boolean NOT NULL default false
  metadata     jsonb (Record<string, unknown>)
  created_at   timestamptz NOT NULL default now()
```

**Missing columns for Story 6.2:**
- `event_type` -- AC says the DB should have `event_type`; currently we use `type` (varchar 50). This is functionally equivalent. No rename needed -- just document that `type` = `event_type` from the AC.
- `project_id` -- not a column, stored inside `metadata` JSONB. Needed for grouping. See Section 3.
- `group_id` -- does not exist. Needed for notification grouping.
- `archived_at` -- does not exist. Needed for 30-day auto-archive.
- `link_url` -- not a column; navigation target stored in `metadata`. Could stay in metadata.

### 1.2 Existing Notification INSERT Points (5 places)

| Location | Type | Target User |
|----------|------|-------------|
| `scoreFile.ts` (line 344) | `language_pair_graduated` | All admins in tenant |
| `flagForNative.action.ts` (line 231) | `finding_flagged_for_native` | Assigned native reviewer |
| `confirmNativeReview.action.ts` (line 210) | `native_review_completed` | Original flagger |
| `overrideNativeReview.action.ts` (line 186) | `native_review_completed` | Original flagger |
| `addFindingComment.action.ts` (line 110) | `native_comment_added` | Other party in assignment |

### 1.3 New Event Types Required by AC

| Event | Type string | Target Users | Source |
|-------|-------------|--------------|--------|
| Analysis complete | `analysis_complete` | File assignee (or project members) | Inngest pipeline completion |
| File assigned | `file_assigned` | Assigned reviewer | Story 6.1 file assignment action |
| Glossary updated | `glossary_updated` | All project members | Glossary import/update actions |
| Auto-pass triggered | `auto_pass_triggered` | File assignee + admins | `autoPassChecker.ts` |

### 1.4 Existing Realtime Hook

`src/features/dashboard/hooks/useNotifications.ts` already:
- Subscribes to `postgres_changes` INSERT on `notifications` filtered by `user_id`
- Validates payload with Zod
- Client-side tenant guard (defense-in-depth)
- Shows toast via sonner on new notification
- Fetches initial notifications via `getNotifications.action.ts` (limit 50)

### 1.5 Existing UI

`src/features/dashboard/components/NotificationDropdown.tsx`:
- Bell icon with unread count badge (9+ cap)
- Dropdown with chronological list (newest first)
- Mark as read on click, mark all read button
- Mounted in `src/components/layout/app-header.tsx`

---

## 2. Supabase Realtime Channel Design

### 2.1 Current Pattern

The existing `useNotifications` hook already uses the correct pattern:

```typescript
supabase
  .channel(`notifications:${userId}:${tenantId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`,
  }, handler)
  .subscribe()
```

### 2.2 Channel Granularity Analysis

| Option | Channel | Filter | Pros | Cons |
|--------|---------|--------|------|------|
| **Per-user (current)** | `notifications:{userId}:{tenantId}` | `user_id=eq.{userId}` | Minimal noise, RLS-aligned, simple | 1 channel per logged-in user |
| Per-tenant | `notifications:{tenantId}` | `tenant_id=eq.{tenantId}` | Fewer channels | Client receives ALL tenant notifications, must filter |
| Per-project | `notifications:{projectId}` | N/A (no project_id column) | Would need schema change | Over-subscribes for multi-project users |

**Recommended:** Keep the per-user pattern (Option 1). It is already implemented, filters at the DB level via Supabase Realtime's `filter` parameter, and aligns with RLS (each user only sees their own notifications).

### 2.3 postgres_changes vs broadcast vs presence

| Pattern | Use Case | Fits? |
|---------|----------|-------|
| `postgres_changes` | React to DB INSERT/UPDATE/DELETE | **Yes** -- notifications are DB-persisted, need both Realtime push AND persistence |
| `broadcast` | Ephemeral messages, no DB persistence | No -- notifications must persist for dropdown |
| `presence` | Online status tracking | No -- not relevant to notifications |

**Recommended:** Stay with `postgres_changes` on INSERT. The notification is written to DB (for persistence/dropdown), and Realtime delivers it to the connected client for the toast. This is the correct dual-delivery pattern.

### 2.4 RLS Consideration

Supabase Realtime respects RLS policies. The `notifications` table currently has no RLS policy (relies on app-level `withTenant()` + `eq(userId)` filtering). For Epic 6, an RLS policy should be added:

```sql
CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid() AND tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);
```

This provides defense-in-depth alongside the app-level guards already in `useNotifications.ts`.

---

## 3. Grouped Notification Pattern

### 3.1 The Requirement

> "Similar events are grouped if: same event_type AND created_at within 5 minutes AND same project_id"
> Example: "Analysis complete for 5 files" instead of 5 individual notifications.

### 3.2 Option A: Group at INSERT Time (Server-Side)

**Mechanism:** Before inserting a new notification, query for a recent "group parent" with matching `type` + `project_id` within 5 minutes. If found, increment a counter on the parent instead of inserting a new row.

```typescript
// In notification helper (pseudocode)
async function createOrGroupNotification(params: {
  tenantId: TenantId, userId: string, type: string,
  title: string, body: string, metadata: Record<string, unknown>,
  projectId: string,
}) {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)

  // Find existing group parent
  const [existing] = await db
    .select()
    .from(notifications)
    .where(and(
      eq(notifications.userId, params.userId),
      eq(notifications.type, params.type),
      withTenant(notifications.tenantId, params.tenantId),
      gte(notifications.createdAt, fiveMinAgo),
      sql`${notifications.metadata}->>'projectId' = ${params.projectId}`,
    ))
    .orderBy(desc(notifications.createdAt))
    .limit(1)

  if (existing && existing.metadata?.groupCount) {
    // Update existing group
    const newCount = (existing.metadata.groupCount as number) + 1
    await db.update(notifications)
      .set({
        title: `${params.type === 'analysis_complete' ? 'Analysis complete' : params.title} for ${newCount} files`,
        metadata: { ...existing.metadata, groupCount: newCount, childIds: [...(existing.metadata.childIds as string[] || []), ...] },
        isRead: false, // Re-mark unread on update
      })
      .where(eq(notifications.id, existing.id))
    // Realtime delivers UPDATE event
  } else {
    // Insert new (potential group parent)
    await db.insert(notifications).values({
      ...params,
      metadata: { ...params.metadata, groupCount: 1 },
    })
  }
}
```

| Pros | Cons |
|------|------|
| Fewer rows in DB | Race condition between concurrent Inngest steps |
| Simpler client rendering | Requires UPDATE subscription (not just INSERT) |
| Unread count stays accurate | Grouping logic duplicated if multiple INSERT sites |
| Works for offline users | 5-minute window query on every INSERT |

### 3.3 Option B: Group at Display Time (Client-Side)

**Mechanism:** Insert every notification individually. Group them in the UI when rendering the dropdown.

```typescript
// In NotificationDropdown or useNotifications hook
function groupNotifications(notifications: AppNotification[]): GroupedNotification[] {
  const groups = new Map<string, AppNotification[]>()

  for (const notif of notifications) {
    const projectId = (notif.metadata as Record<string, unknown>)?.projectId as string ?? 'none'
    const timeWindow = Math.floor(new Date(notif.createdAt).getTime() / (5 * 60 * 1000))
    const key = `${notif.type}:${projectId}:${timeWindow}`

    const existing = groups.get(key)
    if (existing) {
      existing.push(notif)
    } else {
      groups.set(key, [notif])
    }
  }

  return Array.from(groups.values()).map(items => ({
    ...items[0]!,
    count: items.length,
    children: items.length > 1 ? items : undefined,
    title: items.length > 1
      ? `${items[0]!.title} (${items.length} items)`
      : items[0]!.title,
  }))
}
```

| Pros | Cons |
|------|------|
| No race conditions | Unread count = individual count (inflated) |
| No schema change needed | More rows in DB |
| Individual notifications preserved | Client must fetch all items in window |
| Grouping logic in one place | Realtime burst = N toasts before grouping |

### 3.4 Option C: Hybrid -- Insert Individual + Group on Read (Recommended)

**Mechanism:**
1. **INSERT:** Always insert individual notification rows (simple, no race conditions).
2. **Server query (`getNotifications`):** Group results server-side before returning to client. This keeps the dropdown clean.
3. **Realtime (toast):** Use `queueMicrotask` batching (same pattern as `useFindingsSubscription`) to coalesce burst INSERTs into a single grouped toast.
4. **Unread count:** Query `COUNT(DISTINCT group_key)` or compute client-side from grouped results.

**Why hybrid is best:**
- INSERT remains simple and non-blocking (Guardrail #74 -- notifications non-blocking).
- No race conditions from concurrent Inngest steps writing to same row.
- Grouping logic lives in exactly one place (the query/display layer).
- Individual rows preserved for "expand group" UX requirement.
- Realtime batching already proven in the codebase (`queueMicrotask` pattern from findings subscription).

**Schema addition needed:** Add a computed `group_key` or store `project_id` as a proper column for efficient grouping queries.

### 3.5 Recommended: Option C (Hybrid)

**Server-side grouping in `getNotifications`:**

```typescript
// Add to getNotifications.action.ts
const rows = await db
  .select()
  .from(notifications)
  .where(and(
    eq(notifications.userId, currentUser.id),
    withTenant(notifications.tenantId, currentUser.tenantId),
  ))
  .orderBy(desc(notifications.createdAt))
  .limit(100) // Fetch more, group will reduce

// Group in app code
const grouped = groupByTypeProjectAndTimeWindow(rows, 5 * 60 * 1000)
return { success: true, data: grouped.slice(0, 50) }
```

**Client-side Realtime batching for toast:**

```typescript
// In useNotifications -- add queueMicrotask batching (same pattern as useFindingsSubscription)
const insertBufferRef = useRef<{ items: AppNotification[]; scheduled: boolean }>({
  items: [], scheduled: false,
})

const flushInsertBuffer = () => {
  const buf = insertBufferRef.current
  const batch = buf.items
  buf.items = []
  buf.scheduled = false
  if (batch.length === 0) return

  // Add all to state
  setNotifications(prev => [...batch, ...prev])

  // Show grouped toast if batch > 1
  if (batch.length > 1) {
    toast.info(`${batch.length} new notifications`, { duration: 4000 })
  } else {
    toast.info(batch[0]!.title, { description: batch[0]!.body, duration: 4000 })
  }
}

// In Realtime handler:
const handleInsert = (payload) => {
  // ... validate ...
  const buf = insertBufferRef.current
  buf.items.push(newNotif)
  if (!buf.scheduled) {
    buf.scheduled = true
    queueMicrotask(flushInsertBuffer)
  }
}
```

---

## 4. 30-Day Auto-Archive Strategy

### 4.1 Option A: Inngest Cron (Like `cleanBTCache.ts`)

The codebase already has an established pattern in `src/features/bridge/inngest/cleanBTCache.ts`:

```typescript
// Runs daily at 03:00 UTC, cross-tenant sweep
inngest.createFunction(
  { id: 'clean-bt-cache', retries: 3, onFailure: onFailureFn },
  { cron: '0 3 * * *' },
  handlerFn,
)
```

Notification archive would follow the same pattern:

```typescript
// archiveOldNotifications.ts
inngest.createFunction(
  { id: 'archive-old-notifications', retries: 3, onFailure: ... },
  { cron: '0 4 * * *' }, // 04:00 UTC daily
  async ({ step }) => {
    const count = await step.run('archive-notifications', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      // Soft delete: set archived_at
      const result = await db.update(notifications)
        .set({ archivedAt: new Date() })
        .where(and(
          lt(notifications.createdAt, thirtyDaysAgo),
          isNull(notifications.archivedAt),
        ))
      return result.rowCount
    })
    return { archivedCount: count }
  },
)
```

### 4.2 Option B: Supabase pg_cron

```sql
SELECT cron.schedule('archive-old-notifications', '0 4 * * *', $$
  UPDATE notifications
  SET archived_at = now()
  WHERE created_at < now() - interval '30 days'
    AND archived_at IS NULL;
$$);
```

### 4.3 Option C: Hard DELETE

Same as Option A/B but with `DELETE FROM` instead of `UPDATE SET archived_at`.

### 4.4 Comparison

| Aspect | Inngest Cron (A) | pg_cron (B) | Hard DELETE (C) |
|--------|------------------|-------------|-----------------|
| Observability | Inngest dashboard, logger | pg_cron logs only | Same as A or B |
| Retry on failure | Built-in (retries: 3) | None (manual) | Same as A or B |
| Consistency with codebase | Matches `cleanBTCache.ts` | New pattern | -- |
| Audit trail | Can write audit log | Cannot (pure SQL) | Loses data permanently |
| Reversibility | Soft delete = reversible | Same if soft delete | Irreversible |
| Maintenance | In app code, version controlled | In DB, harder to track | -- |

### 4.5 Recommended: Inngest Cron + Soft Delete (Option A with `archived_at`)

**Rationale:**
1. Consistent with existing `cleanBTCache.ts` pattern -- same team, same tooling.
2. Inngest provides retry, observability, and onFailure handler.
3. Soft delete (`archived_at` column) is reversible and preserves audit trail.
4. `getNotifications` query adds `isNull(notifications.archivedAt)` filter -- minimal change.
5. A future hard-delete cron can purge rows where `archived_at < 90 days ago` if storage becomes a concern.

**Schema change:** Add `archived_at timestamptz NULL` to `notifications` table.

---

## 5. Toast + Persistent Dropdown Pattern

### 5.1 Current Flow (Already Working)

```
DB INSERT (notification)
  --> Supabase Realtime (postgres_changes INSERT)
    --> useNotifications hook
      --> (1) setNotifications([new, ...prev])  -- dropdown state
      --> (2) toast.info(title, { description })  -- sonner toast
```

This dual-delivery is already implemented. Epic 6 enhancements:

### 5.2 Enhancements Needed

1. **Click-to-navigate:** Currently `DropdownMenuItem` only marks as read. Need to add navigation based on `metadata.link` or compute link from notification type + metadata.

```typescript
// Compute link from notification type
function getNotificationLink(notif: AppNotification): string | null {
  const meta = notif.metadata as Record<string, string> | null
  if (!meta) return null

  switch (notif.type) {
    case 'analysis_complete':
    case 'file_assigned':
      return `/projects/${meta.projectId}/review/${meta.fileId}`
    case 'glossary_updated':
      return `/projects/${meta.projectId}/glossary`
    case 'auto_pass_triggered':
      return `/projects/${meta.projectId}/review/${meta.fileId}`
    case 'finding_flagged_for_native':
    case 'native_review_completed':
      return `/projects/${meta.projectId}/review/${meta.fileId}?findingId=${meta.findingId}`
    default:
      return null
  }
}
```

2. **Grouped notification expand:** When a grouped notification is clicked, show child items in an expandable section.

3. **Event type icons:** Map notification `type` to Lucide icons (consistent with severity icon pattern from Guardrail #15).

| Type | Icon | Color Token |
|------|------|-------------|
| `analysis_complete` | `CheckCircle` | `--color-success` |
| `file_assigned` | `FileText` | `--color-primary` |
| `glossary_updated` | `BookOpen` | `--color-info` |
| `auto_pass_triggered` | `ShieldCheck` | `--color-success` |
| `finding_flagged_for_native` | `Flag` | `--color-warning` |
| `native_review_completed` | `CheckSquare` | `--color-success` |
| `native_comment_added` | `MessageSquare` | `--color-info` |

### 5.3 Unread Count: Zustand Store vs Server Query

| Approach | Pros | Cons |
|----------|------|------|
| **Local state (current)** | Fast, no extra query, updates via Realtime | Stale on tab re-focus (other tab marked read) |
| **Zustand store** | Shared across components, persist option | Same staleness issue |
| **Server query on focus** | Always accurate | Extra DB round-trip on every tab focus |

**Recommended:** Keep local state (current `useState` in `useNotifications`), but add a **re-fetch on window focus** using `visibilitychange` event. This matches the "polling fallback" philosophy from the Realtime gotchas doc:

```typescript
useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      // Re-fetch to catch changes from other tabs
      getNotifications().then(result => {
        if (result.success) setNotifications(result.data)
      }).catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', handleVisibility)
  return () => document.removeEventListener('visibilitychange', handleVisibility)
}, [userId, tenantId])
```

No Zustand store needed -- the notification state is scoped to the header dropdown and does not need cross-component sharing.

---

## 6. Performance Considerations

### 6.1 Batch Processing Notification Burst

**Scenario:** Batch upload of 20 files completes analysis. Pipeline fires 20 `analysis_complete` events. Each generates a notification INSERT for the file assignee.

**Mitigations:**

1. **DB level:** Individual INSERTs are fine (each is a separate Inngest step). No burst within a single transaction.

2. **Realtime delivery:** Supabase delivers 20 INSERT events. The `queueMicrotask` batching in `useNotifications` (from Section 3.5) coalesces them into 1 state update + 1 grouped toast.

3. **Notification creation rate limiting:** Not needed at the INSERT level (Inngest serial queue already rate-limits pipeline execution via `concurrency: { key: projectId, limit: 1 }`). Each file completes sequentially, so notifications arrive at pipeline speed, not instantaneously.

### 6.2 Notification Helper: Centralize INSERT Logic

Currently, 5 different files do `db.insert(notifications).values(...)` with slightly different patterns. For Epic 6 (adding 4 more event types), centralize:

```typescript
// src/features/dashboard/helpers/createNotification.ts
export async function createNotification(params: {
  tenantId: TenantId
  userId: string
  type: NotificationType
  title: string
  body: string
  metadata?: Record<string, unknown>
  projectId?: string  // Extracted to top-level for grouping queries
}): Promise<void> {
  try {
    await db.insert(notifications).values({
      tenantId: params.tenantId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      metadata: params.metadata ?? null,
      projectId: params.projectId ?? null,
    })
  } catch (err) {
    logger.error({ err, type: params.type, userId: params.userId }, 'Failed to create notification')
    // Non-blocking: swallow error (Guardrail #74)
  }
}
```

### 6.3 Database Indexes

Current state: No indexes on `notifications` beyond the PK.

**Required indexes for Epic 6 query patterns:**

```sql
-- Primary query: user's unread notifications (dropdown)
CREATE INDEX idx_notifications_user_read_created
  ON notifications (user_id, is_read, created_at DESC)
  WHERE archived_at IS NULL;

-- Grouping query: find recent same-type notifications
CREATE INDEX idx_notifications_user_type_created
  ON notifications (user_id, type, created_at DESC)
  WHERE archived_at IS NULL;

-- Archive cron: find old non-archived notifications
CREATE INDEX idx_notifications_archive_sweep
  ON notifications (created_at)
  WHERE archived_at IS NULL;
```

### 6.4 Query Limit

Current `getNotifications` fetches 50 rows. With grouping, we should fetch 100 rows (to have enough to group) but return at most 50 grouped items. The `archived_at IS NULL` partial index keeps the working set small.

### 6.5 Estimated Row Growth

- ~5 notifications per file processed (analysis complete, assignment, etc.)
- ~20 files/day for active tenant
- ~100 notifications/day/tenant
- 30-day archive = ~3,000 rows/tenant max
- With 20 tenants = 60,000 rows -- trivial for PostgreSQL with proper indexes.

---

## 7. Schema Changes Required

### 7.1 Migration: Add Columns to `notifications`

```sql
ALTER TABLE notifications
  ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN group_key varchar(255),
  ADD COLUMN archived_at timestamptz;
```

- `project_id`: Extracted from metadata for efficient grouping queries. Nullable (some notifications like `language_pair_graduated` span multiple projects).
- `group_key`: Optional computed field `{type}:{project_id}:{5min_window}`. Can be computed at query time instead -- defer this column until performance requires it.
- `archived_at`: NULL = active, non-NULL = archived. Used by both query filter and archive cron.

### 7.2 Drizzle Schema Update

```typescript
// src/db/schema/notifications.ts -- additions
import { projects } from './projects'

export const notifications = pgTable('notifications', {
  // ... existing columns ...
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
})
```

### 7.3 RLS Policy (New)

```sql
CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT
  USING (
    user_id = auth.uid()
    AND tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid
  );

CREATE POLICY "notifications_update_own"
  ON notifications FOR UPDATE
  USING (
    user_id = auth.uid()
    AND tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid
  )
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid
  );
```

INSERT is server-side only (service_role), so no INSERT policy needed for authenticated users.

---

## 8. Summary of Recommendations

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| **Realtime channel** | Per-user (`user_id=eq.{userId}`) | Already implemented, minimal noise, RLS-aligned |
| **Realtime pattern** | `postgres_changes` INSERT | Notifications are DB-persisted, dual-delivery (toast + dropdown) |
| **Grouping strategy** | Hybrid: insert individual rows, group at query/display time | No race conditions, individual rows preserved for expand, proven `queueMicrotask` batching for Realtime |
| **Auto-archive** | Inngest cron + soft delete (`archived_at`) | Consistent with `cleanBTCache.ts`, observable, reversible |
| **Toast + dropdown** | Keep current dual-delivery, add `queueMicrotask` batching | Proven pattern from findings subscription |
| **Unread count** | Local state + re-fetch on `visibilitychange` | Simple, no Zustand needed, handles cross-tab |
| **Click navigation** | Compute link from `type` + `metadata` | Flexible, no extra column needed |
| **Notification creation** | Centralized `createNotification()` helper | DRY, consistent error handling, single place for future enhancements |
| **DB indexes** | 3 partial indexes (user+read+created, user+type+created, archive sweep) | Cover all query patterns, partial index on `archived_at IS NULL` keeps index small |
| **Schema additions** | `project_id` (FK), `archived_at` (timestamp) | Grouping queries and archive cron |

### Implementation Order

1. **Migration:** Add `project_id`, `archived_at` columns + indexes + RLS policies
2. **Helper:** Create `createNotification()` centralized helper, migrate existing 5 INSERT sites
3. **New events:** Add notification INSERTs for `analysis_complete`, `file_assigned`, `glossary_updated`, `auto_pass_triggered`
4. **Grouping:** Update `getNotifications.action.ts` with server-side grouping logic
5. **Realtime batching:** Add `queueMicrotask` batching to `useNotifications` hook
6. **UI:** Enhance `NotificationDropdown` with navigation, event icons, grouped expansion
7. **Archive cron:** Create `archiveOldNotifications.ts` Inngest cron function
8. **Tests:** Unit tests for grouping logic, integration test for Realtime delivery, E2E for full flow

### Estimated Complexity

- Schema migration: 1-2 hours
- Centralized helper + migrate existing sites: 2-3 hours
- New event notifications: 3-4 hours (4 events, each in different feature)
- Server-side grouping: 2-3 hours
- Realtime batching + UI enhancements: 3-4 hours
- Archive cron: 1-2 hours
- Tests: 4-5 hours

**Total estimate: 16-23 hours (3-4 dev days)**

Consider splitting into sub-stories:
- **6.2a:** Schema migration + centralized helper + migrate existing INSERT sites
- **6.2b:** New event notifications (4 types) + server grouping
- **6.2c:** UI enhancements (navigation, icons, grouped expand, batching)
- **6.2d:** Archive cron + indexes + RLS policies
