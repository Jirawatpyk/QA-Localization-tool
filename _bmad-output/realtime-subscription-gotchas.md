# Realtime Subscription Gotchas — qa-localization-tool

**Owner:** Charlie (Senior Dev)
**Created:** 2026-03-08 (Epic 3 Retrospective — knowledge capture)
**Purpose:** Three distinct Supabase Realtime subscription patterns emerged during Epic 3, each with latent bugs that cost debugging time. Read this before writing a new Realtime hook.

---

## Overview

The codebase has five Realtime subscriptions, but three core patterns emerged from the review feature:

| Pattern | Hook | Table | Key Gotcha |
|---------|------|-------|------------|
| Score | `useScoreSubscription` | `scores` | DELETE+INSERT !== UPDATE event |
| Findings | `useFindingsSubscription` | `findings` | N INSERTs = N re-renders without batching |
| Threshold | `useThresholdSubscription` | `language_pair_configs` | Cross-language noise without filter |

Additional hooks (`useRoleSync`, `useNotifications`) follow simpler patterns but share the same cleanup and mock concerns.

---

## Pattern 1: Score Subscription (DELETE+INSERT Lifecycle)

**Hook:** `useScoreSubscription`
**File:** `src/features/review/hooks/use-score-subscription.ts`

### How It Works

Subscribes to both `INSERT` and `UPDATE` events on the `scores` table, filtered by `file_id`. Falls back to polling with exponential backoff (5s -> 10s -> 20s -> 40s -> 60s cap) on `CHANNEL_ERROR`.

### The Gotcha

`scoreFile()` in `src/features/scoring/helpers/scoreFile.ts` persists scores via **DELETE + INSERT in a transaction** — not UPDATE. This is intentional for idempotent re-runs (re-parse, re-score).

```
// scoreFile.ts (line 148-167)
// Persist in transaction: load previous score -> delete -> insert (idempotent)
await db.transaction(async (tx) => {
  await tx.delete(scores).where(...)
  await tx.insert(scores).values(...)
})
```

Consequence: **Supabase Realtime fires an INSERT event, not UPDATE.** If you only listen to `UPDATE`, score changes from the pipeline are invisible.

### Solution

Listen to **both INSERT (primary) and UPDATE (safety net)**:

```typescript
const channel = supabase
  .channel(`scores:${fileId}`)
  .on('postgres_changes', {
    event: 'INSERT',   // <-- Primary: scoreFile does DELETE+INSERT
    schema: 'public',
    table: 'scores',
    filter: `file_id=eq.${fileId}`,
  }, handleScoreChange)
  .on('postgres_changes', {
    event: 'UPDATE',   // <-- Secondary: backward compat if score is patched
    schema: 'public',
    table: 'scores',
    filter: `file_id=eq.${fileId}`,
  }, handleScoreChange)
  .subscribe(...)
```

### Validation in Callback

Realtime payloads are untyped `Record<string, unknown>`. Always validate before updating store:

```typescript
const handleScoreChange = (payload: { new: Record<string, unknown> }) => {
  const row = payload.new
  const mqm_score = typeof row.mqm_score === 'number' ? row.mqm_score : null
  const status = typeof row.status === 'string' ? row.status : null
  if (mqm_score === null || status === null || !isValidScoreStatus(status)) return
  // ...
}
```

Note: `mqm_score === 0` is falsy but valid. Use `typeof === 'number'`, not truthiness.

---

## Pattern 2: Findings Subscription (Burst Batching)

**Hook:** `useFindingsSubscription`
**File:** `src/features/review/hooks/use-findings-subscription.ts`

### How It Works

Subscribes to `INSERT`, `UPDATE`, and `DELETE` events on `findings`, filtered by `file_id`. Handles the full finding lifecycle:
- **INSERT:** New finding from L1/L2/L3 pipeline
- **UPDATE:** Status change (accept/reject by reviewer)
- **DELETE:** Re-process clears old findings

### The Gotcha

L2 processes findings in chunks. A single chunk can produce 10-50 findings, each triggering a separate Realtime INSERT event. Without batching, the UI re-renders N times in rapid succession — visible as flickering and poor perf.

### Solution: `queueMicrotask` Batching

Buffer INSERT events and flush as a single state update via `queueMicrotask`:

```typescript
type InsertBuffer = {
  findings: Finding[]
  scheduled: boolean
}

const insertBufferRef = useRef<InsertBuffer>({ findings: [], scheduled: false })

const flushInsertBuffer = () => {
  const buf = insertBufferRef.current
  const batch = buf.findings
  buf.findings = []
  buf.scheduled = false
  if (batch.length === 0) return
  const store = useReviewStore.getState()
  const newMap = new Map(store.findingsMap)
  for (const f of batch) {
    newMap.set(f.id, f)
  }
  store.setFindings(newMap)  // Single state update for all buffered findings
}

const handleInsert = (payload: { new: Record<string, unknown> }) => {
  const finding = mapRowToFinding(payload.new)
  if (!finding) return
  const buf = insertBufferRef.current
  buf.findings.push(finding)
  if (!buf.scheduled) {
    buf.scheduled = true
    queueMicrotask(flushInsertBuffer)  // Coalesces synchronous burst into one flush
  }
}
```

Why `queueMicrotask` and not `setTimeout(0)` or debounce: Supabase delivers the burst of events synchronously within a single event loop tick. `queueMicrotask` runs after all synchronous handlers but before the next paint — perfect for coalescing a burst without introducing visible delay.

### Testing the Batch

Use `async act()` to flush the microtask queue:

```typescript
await act(async () => {
  for (let i = 0; i < 5; i++) {
    onInsertHandler({ new: { id: `finding-${i}`, severity: 'major', ... } })
  }
})
// Verify: setFindings called once (not 5 times)
expect(setFindingsSpy).toHaveBeenCalledTimes(1)
```

### UPDATE and DELETE: No Batching Needed

UPDATE (accept/reject) and DELETE (re-process) are user-triggered or infrequent — they update store directly without buffering.

---

## Pattern 3: Threshold Subscription (Cross-Language Filter)

**Hook:** `useThresholdSubscription`
**File:** `src/features/review/hooks/use-threshold-subscription.ts`

### How It Works

Subscribes to `UPDATE` events on `language_pair_configs` to detect threshold changes. Shows a debounced toast notification. Falls back to polling at 30s interval. Skips subscription entirely when `targetLang` is empty (language pair not yet resolved).

### The Gotcha

Supabase Realtime filters support **single column equality** only. The `language_pair_configs` table has a composite key (`source_lang`, `target_lang`). You can filter by `source_lang` in the subscription, but not both columns simultaneously.

Consequence: If a reviewer is viewing `en-US -> th-TH` and someone updates thresholds for `en-US -> ja-JP`, the event passes the Realtime filter and reaches the callback.

### Solution: Client-Side Filter + Debounced Toast

```typescript
// Supabase filter: source_lang only (Realtime limitation)
.on('postgres_changes', {
  event: 'UPDATE',
  schema: 'public',
  table: 'language_pair_configs',
  filter: `source_lang=eq.${sourceLang}`,
}, handleThresholdChange)

// Client-side: verify targetLang matches
const handleThresholdChange = (payload: { new: Record<string, unknown> }) => {
  const row = payload.new
  if (row.target_lang !== targetLang) return  // <-- Defense-in-depth filter

  const l2 = typeof row.l2_confidence_min === 'number' ? row.l2_confidence_min : null
  const l3 = typeof row.l3_confidence_min === 'number' ? row.l3_confidence_min : null
  if (l2 !== null && l3 !== null) {
    updateThresholds({ l2ConfidenceMin: l2, l3ConfidenceMin: l3 })
    showDebouncedToast()  // 500ms debounce prevents toast spam on rapid changes
  }
}
```

### Guard: Empty Language Pair

When a file's language pair hasn't been resolved yet, `targetLang` arrives as `''`. The hook exits early:

```typescript
if (!sourceLang || !targetLang) return  // No subscription, no polling
```

---

## Common Gotchas

### 1. Channel Cleanup in `useEffect` Return

Every subscription **must** be cleaned up in the effect's destructor. Failure = memory leaks + stale callbacks after navigation.

```typescript
useEffect(() => {
  const supabase = createBrowserClient()
  const channel = supabase.channel(...).on(...).subscribe(...)

  return () => {
    stopPolling()               // Stop any fallback polling
    supabase.removeChannel(channel)  // Unsubscribe from Realtime
  }
}, [fileId, ...])
```

Key: `removeChannel()` (not `channel.unsubscribe()`). The Supabase client manages channel lifecycle — calling `removeChannel` both unsubscribes and cleans up.

### 2. Stale Closure in `.on()` Callback

The callback registered in `.on()` captures variables from the enclosing scope at registration time. If the hook re-renders but the effect doesn't re-run (deps unchanged), the callback sees stale values.

Pattern used in this codebase: access Zustand store imperatively via `useReviewStore.getState()` inside callbacks instead of closing over React state:

```typescript
// CORRECT: always gets latest store state
const handleScoreChange = (payload) => {
  useReviewStore.getState().updateScore(mqmScore, status, layerCompleted)
}

// WRONG: would close over stale updateScore if component re-renders
const updateScore = useReviewStore((s) => s.updateScore)
const handleScoreChange = (payload) => {
  updateScore(mqmScore, status, layerCompleted)  // Stale reference
}
```

Exception: `useThresholdSubscription` uses `useReviewStore((s) => s.updateThresholds)` as a selector — this works because the function reference from Zustand is stable (same function identity across renders). But for values (not functions), always use `getState()`.

### 3. Polling Fallback Architecture

All three hooks implement polling fallback on `CHANNEL_ERROR`. Two patterns exist:

| Pattern | Used By | Mechanism |
|---------|---------|-----------|
| Exponential backoff (5s -> 60s cap) | Score, Findings | `setTimeout` chain with `Math.min(interval * 2, MAX)` |
| Fixed interval (30s) | Threshold | `setInterval` |

On `SUBSCRIBED` callback, polling **must** stop immediately to avoid duplicate updates.

### 4. `useRef` for Supabase Client

Score and Findings hooks store the Supabase client in a ref so the polling fallback (which runs outside the effect) can access it:

```typescript
const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)

useEffect(() => {
  const supabase = createBrowserClient()
  supabaseRef.current = supabase  // Available to startPolling callback
  // ...
}, [fileId])
```

### 5. Testing: Mock Pattern for Supabase Realtime Channels

The codebase has a shared mock at `src/test/mocks/supabase.ts`, but each Realtime test file builds a more specific mock. The critical detail:

```typescript
// CORRECT: .on() returns the channel (chainable)
const mockChannel = {
  on: vi.fn().mockReturnValue(undefined as unknown),
  subscribe: vi.fn(),
}
mockChannel.on.mockReturnValue(mockChannel)  // Must self-reference AFTER creation

// WRONG: mockReturnThis() does NOT work
mockChannel.on.mockReturnThis()  // `this` is the mock function, not mockChannel
```

To extract the registered callback from a specific event type in tests:

```typescript
const insertCall = mockChannel.on.mock.calls.find(
  (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
)
const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void
```

For `queueMicrotask` batching tests, use `await act(async () => { ... })` to flush the microtask queue.

### 6. RLS and Realtime

Supabase Realtime respects RLS policies. If a user's JWT doesn't match the `tenant_id` on a row, the event won't be delivered. However, defense-in-depth client-side guards are still recommended (e.g., `useNotifications` checks `raw.tenant_id !== tenantId`).

---

## Checklist for New Subscriptions

Before shipping a new `use*Subscription` hook, verify:

- [ ] **1. Event type matches DB mutation pattern.** If the server code does DELETE+INSERT, listen for INSERT (not just UPDATE). Trace the server action or Inngest function that mutates the table.
- [ ] **2. Channel name is unique per entity.** Use `tableName:${entityId}` format. Duplicate channel names silently share events.
- [ ] **3. Burst batching considered.** If the server can INSERT N rows rapidly (pipeline chunks, batch operations), implement `queueMicrotask` batching. Single-row mutations (user actions) don't need it.
- [ ] **4. Realtime filter limitations checked.** Supabase supports `column=eq.value` only (single column, equality only). For composite keys or range filters, add client-side validation in the callback.
- [ ] **5. Callback avoids stale closures.** Use `useReviewStore.getState()` (imperative) for reading store values inside callbacks. Zustand selector functions are stable references and safe to close over.
- [ ] **6. Polling fallback implemented.** Subscribe callback should start polling on `CHANNEL_ERROR` and stop on `SUBSCRIBED`. Use exponential backoff for high-frequency tables, fixed interval for low-frequency.
- [ ] **7. Cleanup in useEffect return.** Must call `supabase.removeChannel(channel)`, stop polling timers, and clear any debounce timers.
- [ ] **8. Payload validation before store update.** Every field from `payload.new` must be type-checked (`typeof x === 'number'`). Never trust Realtime payloads. Falsy-but-valid values (0, `''`) must be handled correctly.
- [ ] **9. Empty/null guard on subscription params.** If the entity ID or filter value might be empty (e.g., unresolved language pair), skip subscription entirely with an early return.
- [ ] **10. Unit tests cover: setup, event handling, cleanup, polling fallback, invalid payloads.** Use the mock pattern from `use-score-subscription.test.ts` as reference.

---

## Anti-Patterns

### 1. Listening to Only UPDATE When Server Does DELETE+INSERT

```typescript
// WRONG: scoreFile() does DELETE+INSERT — this misses all score changes
.on('postgres_changes', { event: 'UPDATE', table: 'scores', ... }, handler)
```

Always trace the server-side mutation pattern before choosing the event type.

### 2. Individual Store Updates in Burst Loops

```typescript
// WRONG: N findings = N re-renders
const handleInsert = (payload) => {
  const finding = mapRowToFinding(payload.new)
  useReviewStore.getState().setFinding(finding.id, finding)  // Re-render per event
}
```

Use `queueMicrotask` batching for any table that receives burst INSERTs.

### 3. `mockReturnThis()` for Channel Mock

```typescript
// WRONG: `this` refers to the vi.fn() wrapper, not the mockChannel object
mockChannel.on.mockReturnThis()
```

Use `mockChannel.on.mockReturnValue(mockChannel)` explicitly.

### 4. Closing Over React State in Realtime Callbacks

```typescript
// WRONG: `count` is captured at effect creation time
const [count, setCount] = useState(0)
useEffect(() => {
  channel.on('postgres_changes', { ... }, () => {
    setCount(count + 1)  // Always uses initial `count` value
  })
}, [])  // No re-subscription on count change
```

Either use a `useRef` for mutable state, use Zustand's `getState()`, or include the value in the effect dependency array (which re-subscribes on every change — usually not what you want).

### 5. Forgetting to Stop Polling on `SUBSCRIBED`

```typescript
// WRONG: polling continues alongside Realtime — duplicate updates
.subscribe((status) => {
  if (status === 'CHANNEL_ERROR') startPolling()
  // Missing: if (status === 'SUBSCRIBED') stopPolling()
})
```

### 6. Using `channel.unsubscribe()` Instead of `supabase.removeChannel(channel)`

```typescript
// WRONG: channel object may not be fully cleaned up
return () => { channel.unsubscribe() }

// CORRECT: Supabase client manages the full lifecycle
return () => { supabase.removeChannel(channel) }
```

### 7. Subscribing When Filter Values Are Empty

```typescript
// WRONG: subscribes with empty filter — receives ALL rows from the table
.on('postgres_changes', {
  event: 'UPDATE',
  table: 'language_pair_configs',
  filter: `source_lang=eq.`,  // Empty value = no filter
}, handler)
```

Always guard with an early return when required filter values are falsy.

---

## Quick Reference

| Situation | Solution |
|-----------|----------|
| Server does DELETE+INSERT | Listen for INSERT (primary) + UPDATE (safety net) |
| Burst of N INSERTs | `queueMicrotask` batching with `InsertBuffer` ref |
| Composite key filter | Filter by one column in Realtime + client-side check for others |
| Channel error | Start polling fallback with exponential backoff |
| Channel recovered | Stop polling on `SUBSCRIBED` callback |
| Cleanup | `supabase.removeChannel(channel)` + stop timers |
| Testing `.on()` chain | `mockChannel.on.mockReturnValue(mockChannel)` (not `mockReturnThis`) |
| Testing `queueMicrotask` | `await act(async () => { ... })` |
| Stale closure in callback | Use `useReviewStore.getState()` for current values |
| Unresolved filter value | Early return before creating channel |
