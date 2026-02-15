# Implementation Patterns & Consistency Rules

### Naming Patterns

#### Database Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Tables | snake_case, plural | `projects`, `findings`, `audit_logs` |
| Columns | snake_case | `tenant_id`, `created_at`, `file_name` |
| Foreign keys | `{referenced_table_singular}_id` | `project_id`, `user_id` |
| Indexes | `idx_{table}_{columns}` | `idx_findings_tenant_created` |
| Enums | snake_case | `finding_status`, `severity_level` |
| Timestamps | `created_at`, `updated_at` | Always `timestamptz` (with timezone) |

#### API / Event Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Route Handlers | `/api/{resource}` kebab-case | `/api/inngest`, `/api/health` |
| Server Action files | `{action}.action.ts` camelCase | `updateFinding.action.ts` |
| Server Action functions | camelCase verb-first | `updateFinding()`, `submitReview()` |
| Inngest events | `{domain}.{verb}` dot-notation | `finding.changed`, `pipeline.started` |
| Inngest function IDs | kebab-case | `recalculate-score`, `process-pipeline-batch` |

#### Code Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Components | PascalCase | `FindingCard.tsx`, `ReviewPanel.tsx` |
| Hooks | `use` + PascalCase | `useReviewStore.ts`, `useKeyboardShortcuts.ts` |
| Stores | `{domain}.store.ts` | `review.store.ts`, `pipeline.store.ts` |
| Utilities | camelCase | `mqmCalculator.ts`, `segmentParser.ts` |
| Types/Interfaces | PascalCase, no `I` prefix | `Finding`, `ReviewSession`, `PipelineConfig` |
| Constants | UPPER_SNAKE_CASE | `MAX_FILE_SIZE_BYTES`, `DEFAULT_BATCH_SIZE` |
| Zod schemas | camelCase + `Schema` suffix | `findingSchema`, `projectConfigSchema` |
| CSS files | kebab-case | `tokens.css`, `animations.css` |

---

### Structure Patterns

#### Test Co-location

| Test Type | Location | Naming |
|-----------|----------|--------|
| Unit tests | Co-located next to source | `mqmCalculator.test.ts` |
| Component tests | Co-located next to component | `FindingCard.test.tsx` |
| RLS tests | `src/db/__tests__/rls/` | `findings.rls.test.ts` |
| E2E tests | `e2e/` (project root) | `review-workflow.spec.ts` |
| Inngest tests | Co-located | `recalculate-score.test.ts` |
| Test factories | `src/test/factories.ts` | Shared factory functions |
| Test setup | `src/test/setup.ts` | Global test configuration |

#### Import Organization (ESLint enforced)

```typescript
// 1. External packages
import { useState } from 'react'
import { create } from 'zustand'

// 2. Internal aliases (@/)
import { Button } from '@/components/ui/button'
import { useReviewStore } from '@/features/review/stores/review.store'

// 3. Relative imports (same feature)
import { FindingCard } from './FindingCard'
```

**Export Pattern:** Named exports only — no default exports (except Next.js page/layout where required)

---

### Format Patterns

#### Server Action Response

All Server Actions must return the standardized `ActionResult<T>` type:

```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string }
```

#### Route Handler Response

```typescript
// Success
NextResponse.json({ data: result }, { status: 200 })

// Error
NextResponse.json({ error: message, code: 'VALIDATION_ERROR' }, { status: 400 })
```

#### Data Formats

| Format | Convention |
|--------|-----------|
| Date/Time in DB | `timestamptz` (stored as UTC) |
| Date/Time in JSON | ISO 8601 `"2026-02-14T10:30:00.000Z"` |
| Date/Time in UI | `Intl.DateTimeFormat` per user locale |
| JSON field naming | camelCase (JavaScript convention) |
| DB column naming | snake_case (PostgreSQL convention) |
| Booleans | `true`/`false` (never 1/0) |

Drizzle handles camelCase ↔ snake_case mapping automatically.

---

### Communication Patterns

#### Inngest Event Structure

```typescript
interface InngestEvent {
  name: string               // "finding.changed"
  data: {
    tenantId: string         // always present
    projectId: string        // always present
    // ... event-specific fields
  }
  user?: { id: string }     // who triggered (if applicable)
}
```

#### Supabase Realtime Subscription

```typescript
// Every subscription must filter by project + cleanup on unmount
useEffect(() => {
  const channel = supabase
    .channel(`{table}:{projectId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: '{table}',
      filter: `project_id=eq.${projectId}`
    }, handler)
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [projectId])
```

#### Zustand Store Template

```typescript
interface ReviewState {
  // State
  activeSegmentId: string | null
  findings: Finding[]

  // Actions (verb-first naming)
  setActiveSegment: (id: string) => void
  updateFinding: (finding: Finding) => void
  resetState: () => void
}

export const useReviewStore = create<ReviewState>()((set) => ({
  activeSegmentId: null,
  findings: [],
  setActiveSegment: (id) => set({ activeSegmentId: id }),
  updateFinding: (finding) => set((s) => ({
    findings: s.findings.map(f => f.id === finding.id ? finding : f)
  })),
  resetState: () => set({ activeSegmentId: null, findings: [] }),
}))
```

---

### Data Access Patterns

#### Server-Side DB Access: Drizzle Only

```typescript
// ✅ Server-side: Drizzle ORM for all DB queries
const findings = await db
  .select()
  .from(findingsTable)
  .where(and(
    eq(findingsTable.projectId, projectId),
    eq(findingsTable.tenantId, tenantId)
  ))

// ❌ FORBIDDEN: raw SQL via Drizzle
await db.execute(sql`SELECT * FROM findings WHERE ...`)

// ❌ FORBIDDEN: Supabase client for DB queries on server
const { data } = await supabase.from('findings').select('*')
```

**Rule:** Supabase client is for Auth, Storage, and Realtime subscriptions only. All DB queries go through Drizzle ORM.

#### Supabase Client Instantiation

Three factory files — always import from these:

| File | Use Case | Runtime |
|------|----------|---------|
| `src/lib/supabase/server.ts` | Server Components, Server Actions | Node.js |
| `src/lib/supabase/client.ts` | Client Components (Auth, Realtime) | Browser |
| `src/lib/supabase/admin.ts` | Admin operations (role sync, seed) | Node.js server-only |

Do not instantiate Supabase clients inline.

#### Environment Variable Access

```typescript
// src/lib/env.ts — centralized, Zod-validated
import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  OPENAI_API_KEY: z.string(),
  ANTHROPIC_API_KEY: z.string(),
  INNGEST_EVENT_KEY: z.string(),
  INNGEST_SIGNING_KEY: z.string(),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string(),
})

export const env = envSchema.parse(process.env)
```

**Rule:** All env access through `@/lib/env` — do not use `process.env` directly.

---

### Error Handling Patterns

| Context | Pattern |
|---------|---------|
| Server Action (expected) | Return `{ success: false, error, code }` via ActionResult |
| Server Action (unexpected) | Throw → caught by Error Boundary |
| Inngest steps | No try-catch — let Inngest handle retries |
| Audit-critical errors | Must never silently fail → throw + pino.error |

#### Server Action Error Pattern

```typescript
export async function updateFinding(input: Input): Promise<ActionResult<Finding>> {
  try {
    const result = await db.update(...)
    await auditLog('finding.updated', { ... })  // never skip audit
    return { success: true, data: result }
  } catch (error) {
    logger.error({ error, input }, 'Failed to update finding')
    return { success: false, error: 'Failed to update finding', code: 'UPDATE_FAILED' }
  }
}
```

#### Inngest Step Error Pattern

```typescript
// Let step.run() handle retries — no try-catch inside
const result = await step.run("process-L1-segment-42", async () => {
  return await processLayer1(segment)  // if fails, Inngest retries
})
```

---

### Loading State Patterns

| Context | Pattern |
|---------|---------|
| RSC page load | `loading.tsx` or `<Suspense fallback={<Skeleton />}>` |
| Server Action pending | `useActionState` → `isPending` → disable button + spinner |
| Pipeline progress | Supabase Realtime → Zustand → animated progress |
| Score recalculating | "Recalculating..." badge → Realtime push |

Skeletons must match compact density (0.75x) to prevent layout shift.

---

### Accessibility Patterns

| Requirement | Implementation |
|------------|---------------|
| Interactive elements | Must be keyboard accessible (no tabindex > 0) |
| Images | Must have `alt` (or `alt=""` if decorative) |
| Form fields | Must have associated `<Label htmlFor>` |
| Loading states | `role="status" aria-live="polite"` |
| Error messages | `role="alert" aria-live="assertive"` |
| Color contrast | ≥ 4.5:1 text, ≥ 3:1 UI components |
| Focus order | Logical tab sequence |

---

### Responsive Patterns

Desktop-first approach (review tool = desktop primary):

| Breakpoint | Width | Usage |
|-----------|-------|-------|
| 2xl | 1536px+ | Ultra-wide layouts |
| xl | 1280px+ | Full desktop (primary) |
| lg | 1024px+ | Small laptop |
| md | 768px+ | Tablet |
| sm | 640px+ | Mobile (limited) |

**Rule:** Use Tailwind default breakpoints only — no arbitrary `min-[1100px]:` values.

---

### Notification Pattern

Use `sonner` (shadcn/ui recommended) as sole toast/notification library:

```typescript
import { toast } from 'sonner'

toast.success('Finding accepted')
toast.error('Failed to update finding')
toast.promise(asyncAction(), {
  loading: 'Updating...',
  success: 'Updated',
  error: 'Failed',
})
```

No `alert()`, no custom modals, no inline messages for action feedback.

---

### Test Patterns

#### Test Naming Convention

```typescript
describe('MQMCalculator', () => {
  it('should return 100 when no penalties exist', () => { ... })
  it('should deduct 25 points per critical finding', () => { ... })
  it('should never return below 0', () => { ... })
})
```

Pattern: `describe("{Unit}")` → `it("should {behavior} when {condition}")`

#### Test Data Factory

```typescript
// src/test/factories.ts
export function buildFinding(overrides?: Partial<Finding>): Finding {
  return {
    id: faker.string.uuid(),
    tenantId: 'test-tenant',
    projectId: 'test-project',
    segmentId: faker.string.uuid(),
    severity: 'major',
    category: 'accuracy',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}
```

**Rule:** Test data via factory functions — never hardcode test data inline.

#### TypeScript Strictness

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

---

### Anti-Patterns (Forbidden)

| # | Anti-Pattern | Correct Approach |
|---|-------------|-----------------|
| 1 | Default export (except page/layout) | Use named exports |
| 2 | `any` type | Define proper types/interfaces |
| 3 | Raw SQL in **application code** (Server Actions, API routes, lib/) | Use Drizzle ORM query builder. **Exception:** Raw SQL is required and expected in `src/db/migrations/` and `supabase/migrations/` for RLS policies, triggers, functions, and partition DDL — these are infrastructure SQL, not application queries. |
| 4 | `service_role` key in client code | Use `anon` key for client, restrict `service_role` to server-only |
| 5 | Hardcode tenant_id | Read from JWT/session |
| 6 | Mutate Zustand state directly | Use `set()` function |
| 7 | `"use client"` on page component | Use feature boundary pattern |
| 8 | Skip audit log for state change | Log every state change to audit |
| 9 | `console.log` in production (Node.js runtime) | Use pino logger (Node.js) or `edgeLogger` (Edge Runtime) |
| 10 | Inline Tailwind colors | Use CSS custom properties from tokens.css |
| 11 | `process.env` direct access | Use `@/lib/env` validated config |
| 12 | Inline Supabase client creation | Use factory from `@/lib/supabase/` |
| 13 | try-catch inside Inngest step.run() | Let Inngest handle retries |
| 14 | Arbitrary responsive breakpoints | Use Tailwind defaults only |
| 15 | Hardcoded test data | Use factory functions from `src/test/factories.ts` |

**SQL Boundary Clarification:**

| Location | Raw SQL Allowed? | Purpose |
|----------|:---------------:|---------|
| `src/db/migrations/*.sql` | **YES** | Drizzle-generated DDL |
| `supabase/migrations/*.sql` | **YES** | RLS policies, triggers, auth hooks, partition DDL |
| `src/**/*.ts` (application code) | **NO** | Use Drizzle query builder only |
| `src/db/__tests__/rls/*.test.ts` | **YES** | RLS tests need raw SQL to test policies with different JWT claims |

### Enforcement

- **ESLint:** Import order, no default exports, no console.log, RSC boundary props check
- **TypeScript:** Strict mode + noUncheckedIndexedAccess catches type issues at compile time
- **CI Quality Gate:** lint → type-check → unit tests → RLS tests → build all pass before merge
- **Code Review:** AI agents must verify patterns before submitting changes
