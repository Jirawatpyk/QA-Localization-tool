# Debug Explorer — Persistent Memory

## @dnd-kit + Playwright Mouse Drag Pattern (confirmed 2026-03-03)

**Root cause of "Mappings reordered" toast not appearing in CI:**

Two distinct bugs in the E2E test for taxonomy reorder:

### Bug 1 — `hover()` does not pin Playwright mouse state (retry1: no `[pressed]`)

- `dragHandle.hover()` moves the real browser pointer but does NOT update Playwright's
  internal mouse coordinate tracker
- When `page.mouse.down()` is called after `hover()` (without a prior `page.mouse.move()`),
  Playwright sends CDP `mousePressed` at whatever its last tracked position was — which may
  NOT match the hover position
- Fix: always call `page.mouse.move(cx, startY)` BEFORE `page.mouse.down()`

### Bug 2 — `over` state not settled before `mouse.up()` (retry2: drag works, toast fails)

- @dnd-kit DragEnd handler has `if (!over || active.id === over.id) return` guard
- If `page.mouse.up()` fires immediately after `page.mouse.move()`, @dnd-kit may not have
  processed the final pointermove event yet → `over` is null or equals `activeId`
- ARIA live region shows "was moved over droppable area" but then `mouse.up()` fires before
  React reconciles the over state
- Fix: `await page.waitForTimeout(800)` AFTER final `mouse.move()`, BEFORE `mouse.up()`

### Bug 3 — Stale bounding box for drop target (retry2: drops on wrong row)

- `targetBox.y + targetBox.height + 5` captures position BEFORE drag animation starts
- Row positions shift during drag (drag item has opacity:0.5, other rows animate)
- Fix: use `targetBox.y + targetBox.height / 2` (row center) — more stable than bottom edge

### Correct pattern (see e2e-testing-gotchas.md section 9 for full code):

```
boundingBox() → mouse.move(cx,startY) → mouse.down() → wait(200)
→ mouse.move(cx, startY+20, steps:5) → wait(300)   // activate sensor
→ mouse.move(cx, endY, steps:20) → wait(800)        // settle over state
→ mouse.up()
```

## Key Architecture Notes

- **Trace directory pattern**: Error context snapshots saved in `taxonomy-admin-Story-*/error-context.md`
- **ARIA live region**: @dnd-kit writes drag state to a `role=status` element — check this
  in error-context.md to diagnose whether drag activated (moved over) vs. never activated
- **`[active] [pressed]` on drag handle**: confirms mouse.down() hit the correct element
- **DragOverlay = second `<table>`** in DOM — appears alongside main table during drag

## Files Modified

- `e2e/taxonomy-admin.spec.ts` — lines 395–445: fixed drag pattern
- `_bmad-output/e2e-testing-gotchas.md` — added section 9 with @dnd-kit pattern

## RSC initialData re-render → optimistic overwrite (confirmed 2026-03-14)

**Root cause of E-R1: `data-status` flips back to `pending` after optimistic accept**

### Pattern

```
ReviewPageClient receives `initialData` prop (SSR)
useEffect([..., initialData]) calls resetForFile() + setFindings(pending state)
Server Action triggers RSC revalidation → new initialData reference
useEffect re-runs → resetForFile() + setFindings(pending) overwrites optimistic state
```

### Fix 1 (Critical): Use ref to capture initialData once

```ts
const initialDataRef = useRef(initialData)  // capture on first render
useEffect(() => {
  const data = initialDataRef.current        // use ref, not prop
  resetForFile(fileId)
  setFindings(initialMap from data)
}, [fileId, projectId, tenantId, ...])       // initialData NOT in deps
```

File: `src/features/review/components/ReviewPageClient.tsx`

### Fix 2 (High): Realtime handleUpdate needs updatedAt guard

Without guard, delayed/out-of-order Supabase Realtime UPDATE events can overwrite
optimistic updates. Add same merge logic as polling:

```ts
const handleUpdate = (payload) => {
  const finding = mapRowToFinding(payload.new)
  if (!finding) return
  const existing = store.findingsMap.get(finding.id)
  if (existing && finding.updatedAt <= existing.updatedAt) return // ← guard
  store.setFinding(finding.id, finding)
}
```

File: `src/features/review/hooks/use-findings-subscription.ts`

### General Rule

Any `useEffect` that calls `resetForFile()` or `setFindings()` must NOT include
`initialData` (SSR prop) in its dependency array. Use a ref to snapshot it once.
