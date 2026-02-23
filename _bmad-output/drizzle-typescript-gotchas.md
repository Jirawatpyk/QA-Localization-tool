# Drizzle ORM 0.45.1 + TypeScript Strict Mode Gotchas

**Owner:** Charlie (Senior Dev)
**Created:** 2026-02-23 (Epic 1 Retrospective — Action Item A4)
**Purpose:** Prevent repeated debugging of version-specific and strict-mode issues.
  Read this before writing schema, queries, or test mocks.

---

## DRIZZLE ORM 0.45.1

### 1. `relations()` — NOT `defineRelations()`

**Problem:** v1-beta docs (online) show `defineRelations()` but v0.45.x uses `relations()`.

```typescript
// ✅ CORRECT — v0.45.x API
import { relations } from 'drizzle-orm'

export const findingsRelations = relations(findings, ({ one, many }) => ({
  segment: one(segments, { fields: [findings.segmentId], references: [segments.id] }),
  reviewActions: many(reviewActions),
}))

// ❌ WRONG — v1-beta only, does NOT exist in 0.45.x
import { defineRelations } from 'drizzle-orm'
```

All relations are in `src/db/schema/relations.ts` — one file, separate from table definitions.

---

### 2. `drizzle-zod` — Separate Package, Not a Path

**Problem:** Some docs show `import from 'drizzle-orm/zod'` — this path does NOT exist in 0.45.1.

```typescript
// ✅ CORRECT — separate npm package
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'

// ❌ WRONG — path does not exist
import { createInsertSchema } from 'drizzle-orm/zod'
```

**Package version:** `drizzle-zod@0.8.3`
**Zod compatibility:** Supports both `"zod": "^3.25.0 || ^4.0.0"` — no mismatch issues.

---

### 3. Schema → Zod Flow (Unidirectional)

Always: `drizzle schema → drizzle-zod → extend with Zod`. Never the reverse.

```typescript
import { createInsertSchema } from 'drizzle-zod'
import { z } from 'zod'
import { findings } from '@/db/schema/findings'

// Generate base schema from table definition
const baseInsertSchema = createInsertSchema(findings)

// Extend / refine as needed
export const createFindingSchema = baseInsertSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    severity: z.enum(['critical', 'major', 'minor']),
  })
```

No circular dependencies — schema files never import from `features/`.

---

### 4. Proxy-based Chainable Mock for Drizzle Queries

Complex Drizzle chains (`.select().from().leftJoin().where().orderBy().limit()`) cannot
be mocked with simple `vi.fn()`. Use a Proxy-based chainable mock:

```typescript
// src/test/mocks/drizzle.ts
export function createDrizzleMock(finalResult: unknown) {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') return undefined // not a Promise itself
      // Return the resolved value for terminal calls
      if (['execute', Symbol.iterator].includes(prop as string)) {
        return () => Promise.resolve(finalResult)
      }
      // All other chained calls return the proxy itself
      return new Proxy({}, handler)
    },
    apply() {
      return new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler)
}

// Usage in tests
vi.mock('@/db', () => ({
  db: {
    select: () => createDrizzleMock([{ id: 'uuid-1', name: 'Test' }]),
    insert: () => createDrizzleMock({ rowCount: 1 }),
  },
}))
```

---

### 5. `withTenant()` — Required on Every Query

Every query against a tenant-scoped table MUST use the `withTenant()` helper.
Forgetting this is a **cross-tenant data leak** (highest severity security bug).

```typescript
import { db } from '@/db'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'

// ✅ CORRECT
const results = await db
  .select()
  .from(findings)
  .where(withTenant(findings.tenantId, tenantId))

// ❌ WRONG — missing tenant filter
const results = await db.select().from(findings)
```

Tables WITHOUT `tenant_id` (no `withTenant()` needed):
- `taxonomy_definitions` only

---

### 6. Drizzle `insert().values().returning()`

For inserts that need the created row back, use `.returning()`:

```typescript
const [created] = await db
  .insert(findings)
  .values({ tenantId, projectId, segmentId, severity, category, description, detectedByLayer })
  .returning()

// created is Finding | undefined (noUncheckedIndexedAccess!)
if (!created) throw new Error('Insert returned no rows')
```

---

## TYPESCRIPT STRICT MODE

### 7. `noUncheckedIndexedAccess` — Doubly Optional Array Access

With `noUncheckedIndexedAccess: true`, array index access returns `T | undefined`.
Supabase and Drizzle query results need double optional chaining:

```typescript
// ✅ CORRECT
const user = data?.[0]?.email   // data could be null, data[0] could be undefined

// ❌ WRONG — TS2532: Object is possibly undefined
const user = data[0].email
```

**Pattern for "get first or throw":**
```typescript
const [first] = await db.select().from(users).where(...)
if (!first) throw new Error('User not found')
// first is now narrowed to User (not User | undefined)
return first
```

---

### 8. `exactOptionalPropertyTypes` — `null` ≠ `undefined`

With `exactOptionalPropertyTypes: true`, optional property `x?: string` means the
property can be **absent** OR `string`. It CANNOT be `null` unless declared `x?: string | null`.

```typescript
// Schema field: description: text('description') — nullable in DB
// Drizzle infers: description: string | null

// ✅ Setting to null (clear the value)
await db.update(projects).set({ description: null }).where(...)

// ✅ Setting to undefined (omit from SET clause — don't change)
const patch: Partial<...> = {}
if (shouldClearDesc) patch.description = null  // explicit null = clear
// omitting description = don't touch it

// ❌ WRONG — passing undefined where null expected
patch.description = undefined  // may not behave as expected with exactOptionalPropertyTypes
```

---

### 9. Event Handler Types — Explicit Required

TypeScript strict mode won't infer event handler types from JSX context alone.
Always annotate explicitly:

```typescript
// ✅ CORRECT
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setValue(e.target.value)
}
const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault()
}

// ❌ WRONG — implicit any on e
const handleChange = (e) => setValue(e.target.value)
```

---

### 10. `ActionResult<T>` — `error` Not `message`

The standard Server Action return type uses `error`, not `message`:

```typescript
// ✅ CORRECT
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string }

// Check on client:
if (!result.success) {
  toast.error(result.error)  // ← 'error' not 'message'
}

// ❌ WRONG — 'message' field doesn't exist on the type
if (!result.success) toast.error(result.message)
```

---

### 11. Mock Calls Type Safety

`vi.fn(() => value)` creates a mock where `mock.calls[0]?.[0]` throws TS2493 because
the call signature has an empty tuple `[]`.

```typescript
// ✅ CORRECT — rest params for mocks whose calls are inspected
const mockAudit = vi.fn((..._args: unknown[]) => Promise.resolve())
await someAction(...)
expect(mockAudit.mock.calls[0]?.[0]).toMatchObject({ action: 'finding.created' })

// ❌ WRONG — TS2493: Tuple type '[]' of length '0' has no element at index '0'
const mockAudit = vi.fn(() => Promise.resolve())
expect(mockAudit.mock.calls[0]?.[0]).toMatchObject(...)
```

---

### 12. No `enum` — Use `as const` Objects

```typescript
// ✅ CORRECT — string literal union via as const
const SEVERITY = {
  Critical: 'critical',
  Major: 'major',
  Minor: 'minor',
} as const
type Severity = (typeof SEVERITY)[keyof typeof SEVERITY]
// → 'critical' | 'major' | 'minor'

// ❌ FORBIDDEN — enums don't serialize via JSON cleanly
enum Severity { Critical, Major, Minor }
```

---

## Quick Reference

| Gotcha | Fix |
|--------|-----|
| `defineRelations` not found | Use `relations()` from `drizzle-orm` |
| `drizzle-orm/zod` path error | Use `drizzle-zod` package |
| Complex query mock fails | Proxy-based chainable mock |
| Missing tenant filter | `withTenant(table.tenantId, tenantId)` on every query |
| `data[0].x` TS error | `data?.[0]?.x` (doubly optional) |
| `null` vs `undefined` confusion | `exactOptionalPropertyTypes` — absent ≠ null ≠ undefined |
| Event handler implicit any | Explicit `React.ChangeEvent<HTMLInputElement>` etc. |
| `result.message` not found | ActionResult uses `result.error` |
| Mock calls TS2493 | `vi.fn((..._args: unknown[]) => ...)` |
| TypeScript `enum` | `as const` object + derived union type |
