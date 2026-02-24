---
project_name: 'qa-localization-tool'
user_name: 'Mona'
date: '2026-02-15'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality_style', 'dev_workflow', 'critical_rules']
status: 'complete'
rule_count: 120
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

> ⚠️ Project is pre-implementation. Versions below are from Architecture Document.
> Run `verify` commands after `npm init` to confirm actual installed versions.

### Core Framework
- **Next.js 16** — App Router, Turbopack dev, React Compiler, `next.config.ts` (TypeScript config)
- **React 19** — RSC + Client Components
- **TypeScript 5.x** — strict mode (see Language Rules)
- **Node.js 18+ LTS** — MUST have full ICU (`small-icu` will SEGFAULT on Intl.Segmenter)
- **npm** — Package manager (NOT pnpm, NOT bun)

### UI & Styling
- **Tailwind CSS v4** — `@theme` directive for design tokens, CSS custom properties in `src/styles/tokens.css`
- **shadcn/ui** — 16 base + custom shared (StatusBadge, ProgressRing, EmptyState)
- **Inter** (UI) + **JetBrains Mono** (code) — loaded via `next/font`
- **Indigo primary** (#4F46E5)

### Backend & Data
- **Supabase** (Pro plan) — Auth + PostgreSQL + Storage + Realtime
  - Connection pooling: Supavisor, Transaction mode, Pool Size 15
  - Connect via pooler URL (port 6543), NOT direct (port 5432)
- **Drizzle ORM** — Schema-first + `drizzle-zod` for validation
  - Flow: `drizzle schema → drizzle-zod → extend with Zod` (unidirectional, no circular deps)
- **Inngest** — Durable functions, 3-tier pipeline orchestration
- **Supabase CLI** — Required for local dev (`supabase start`) and RLS tests in CI

### AI & Processing
- **Vercel AI SDK** — Multi-provider abstraction (verify actual version at project init)
- **L2 Primary:** OpenAI `gpt-4o-mini` | Fallback: Google `gemini-2.0-flash`
- **L3 Primary:** Anthropic `claude-sonnet-4-5-20250929` | Fallback: OpenAI `gpt-4o`
- **fast-xml-parser** — SDLXLIFF/XLIFF parsing with namespace support

### State & Realtime
- **Zustand** — Domain-split stores (1 store per feature, no God Store)
- **Supabase Realtime** — postgres_changes subscriptions per project

### Testing
- **Vitest ^3.x** + `@vitest/coverage-v8` — Workspace: unit (jsdom) + rls (node)
- **Playwright ^1.x** — E2E (4 critical path tests)
- **@testing-library/react ^16.x** — Must match React 19
- **@faker-js/faker** — Test data factories (dev dependency)

### Infrastructure
- **Vercel** (Pro plan) — Hosting, deploy, analytics
- **GitHub Actions** — CI: quality-gate (every PR) + e2e-gate (main) + chaos-test (weekly)
- **Upstash Redis** — Edge-compatible rate limiting (sliding window)
- **Better Stack** — Uptime monitoring (5 monitors)

### Key Libraries
- **pino** — Structured JSON logging (Node.js runtime ONLY)
- **sonner** — Sole toast/notification library
- **React Hook Form + Zod** — Complex forms + validation
- **@upstash/ratelimit** — Edge middleware rate limiting
- **@supabase/ssr** — Supabase client for Next.js App Router (NOT legacy `createClient`)
- **drizzle-zod** — Schema-to-Zod bridge (unidirectional flow)

### Runtime Compatibility (CRITICAL)

| Runtime | Compatible Libraries | DO NOT Import Here |
|---------|---------------------|-------------------|
| **Edge Runtime** (middleware.ts) | `@upstash/ratelimit`, `@upstash/redis`, `@supabase/ssr` | `pino`, `drizzle-orm`, `fast-xml-parser`, `inngest` |
| **Node.js Runtime** (Server Components, Actions, Inngest) | `pino`, `drizzle-orm`, `fast-xml-parser`, `inngest`, `@supabase/ssr` | — |
| **Browser** (Client Components) | `zustand`, `sonner`, `react-hook-form`, `@supabase/ssr` | `pino`, `drizzle-orm`, server-only modules |

### Version Constraints
- Node.js MUST be 18+ with full ICU data (Intl.Segmenter CJK/Thai)
- Drizzle ORM 0.x → monitor for 1.0 breaking changes (migration plan in architecture)
- Next.js 16 `"use cache"` is stable — do NOT use legacy `unstable_cache`
- `@testing-library/react` version MUST match React major version

---

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

#### TypeScript Configuration (STRICT)
- `strict: true` — no implicit any, strict null checks, strict function types
- `noUncheckedIndexedAccess: true` — array/object index access returns `T | undefined`
- `exactOptionalPropertyTypes: true` — `{ x?: string }` means `string | undefined`, NOT `string | undefined | null`
- These 3 settings catch most type bugs at compile time — NEVER disable them

#### Import/Export Rules
- **Named exports ONLY** — no `export default` (exception: Next.js `page.tsx`, `layout.tsx`, `error.tsx`, `loading.tsx`, `not-found.tsx`)
- **Import order** (ESLint enforced):
  1. External packages (`react`, `zustand`, `zod`)
  2. Internal aliases (`@/components/`, `@/features/`, `@/lib/`)
  3. Relative imports (`./FindingCard`)
- **Path alias:** Always use `@/` — never relative paths across features (`../../features/review/` is FORBIDDEN)

#### Server Boundary Rules
- **`"use server"`** directive: file-level at top of every Server Action file — NOT per-function
- **`import 'server-only'`** MUST be at top of these files to prevent client import:
  - `src/lib/env.ts`
  - `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
  - `src/db/index.ts`, `src/db/connection.ts`
  - All `features/*/actions/*.action.ts`

#### Type Definitions
- PascalCase for types/interfaces: `Finding`, `ReviewSession`, `PipelineConfig`
- No `I` prefix: `Finding` not `IFinding`
- No `Type` suffix: `Finding` not `FindingType`
- Zod schemas: camelCase + `Schema` suffix: `findingSchema`, `projectConfigSchema`
- Constants: UPPER_SNAKE_CASE: `MAX_FILE_SIZE_BYTES`, `DEFAULT_BATCH_SIZE`

#### No Enums — Use String Literals
- NEVER use TypeScript `enum` — use `as const` objects or union types
- Reason: string literals serialize via JSON, no cross-module imports, tree-shakeable
```typescript
// ❌ FORBIDDEN
enum Severity { Critical, Major, Minor }

// ✅ Use const object + derived type
const SEVERITY = { Critical: 'critical', Major: 'major', Minor: 'minor' } as const
type Severity = (typeof SEVERITY)[keyof typeof SEVERITY]
```

#### Standardized Return Type (ActionResult<T>)
- ALL Server Actions MUST return this exact type — no exceptions:
```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string }
```

#### Error Handling by Context

| Context | Pattern |
|---------|---------|
| Server Action (expected error) | try-catch → return `{ success: false, error, code }` |
| Server Action (unexpected) | Throw → caught by Error Boundary |
| Inngest steps | NO try-catch — let Inngest handle retries |
| Audit-critical | MUST throw + `pino.error()` — never silently fail |
| Edge Middleware | Use `edgeLogger` (structured JSON) — never `console.log` |

#### Async Patterns
- Prefer `async/await` over raw Promises
- Server Components can be `async` directly (React 19 RSC)
- Client Components CANNOT be `async` — use `useEffect` or data fetching hooks
- Inngest steps: `await step.run("deterministic-id", async () => { ... })`

#### Null Handling
- `null` for intentional absence (DB columns, API responses)
- `undefined` for optional parameters and missing object properties
- With `exactOptionalPropertyTypes`, these are NOT interchangeable

#### Type Safety in Tests
- NEVER use `as any` to bypass strict mode in tests
- Use factory functions from `src/test/factories.ts`:
```typescript
// ❌ FORBIDDEN
const result = await updateFinding({} as any)

// ✅ Use factories
const result = await updateFinding(buildFinding({ severity: 'critical' }))
```

#### `satisfies` Operator
- Use `satisfies` for config objects needing both type validation AND literal type inference:
```typescript
const LAYER_MODELS = {
  L2: { primary: { provider: 'openai', model: 'gpt-4o-mini' } },
} satisfies Record<string, { primary: ModelConfig }>
```

### Framework-Specific Rules

#### Next.js 16 App Router

**Route Group Conventions:**
- `(auth)/` — public routes: login, signup, callback (no app shell, no sidebar)
- `(app)/` — protected routes: everything after login (with sidebar + header)

**RSC/Client Component Boundaries:**

| Feature | Default | Rationale |
|---------|---------|-----------|
| Review panel | 🔴 Client | Keyboard shortcuts, inline editing, real-time |
| Dashboard | 🟢 Server + 🔴 Client charts | Data-heavy layout server, charts client |
| Project list/detail | 🟢 Server | Data display, minimal interactivity |
| Settings/Config | 🟢 Server + 🔴 Client forms | Layout server, forms client |
| Glossary editor | 🔴 Client | Dynamic fields, real-time validation |

- NEVER put `"use client"` on a `page.tsx` — use feature boundary pattern (Server wrapper → Client entry)
- Server Components fetch data → pass as props to Client Component entry point
- Wrap every RSC boundary in `<Suspense fallback={<Skeleton />}>` — skeleton MUST match compact density (0.75x)

**Edge Middleware Flow (`src/middleware.ts`):**
```
1. Rate limit check (Upstash Redis — @upstash/ratelimit)
2. Read session cookie → verify JWT valid
3. No session → redirect /login
4. Extract tenant_id from JWT claims
5. Tenant mismatch → 403
6. Pass through to server
```
```typescript
// Matcher: exclude static assets
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/).*)']
}
```

**RBAC: `requireRole()` M3 Pattern (CRITICAL):**

| Operation | Trust Source | Why |
|-----------|-------------|-----|
| **Read** (UI guards, data display) | JWT `app_metadata` claims | Fast, no DB query |
| **Write** (mutations, approve, delete) | `user_roles` DB table query | Accurate, blocks stale JWT |

- NEVER trust JWT claims for write operations — always query DB

**Caching:**
- Use `"use cache"` directive (stable in Next.js 16) + `cacheTag()` / `cacheLife()`
- NEVER use legacy `unstable_cache`
- Cache isolation: `src/lib/cache/{domain}Cache.ts`
- **Invalidation:** MUST call `revalidateTag()` in every Server Action that mutates cached data
```typescript
// Cache
"use cache"
cacheTag(`glossary-${projectId}`)

// Invalidate (in Server Action after mutation)
revalidateTag(`glossary-${projectId}`)
```

**API Patterns:**

| Use Server Actions | Use Route Handlers |
|---|---|
| UI forms, review actions, glossary CRUD, score override, settings | Inngest serve (`/api/inngest`), webhooks, file upload w/ progress, health check |

- Server Actions co-located: `src/features/{feature}/actions/{name}.action.ts`
- Route Handlers: `src/app/api/{resource}/route.ts`

**Loading & Error:**
- `loading.tsx` for route-level loading states
- `error.tsx` at 3 levels: root, `(app)/`, `projects/[projectId]/`
- `not-found.tsx` at root

**Environment Validation:**
- `src/lib/env.ts` validates ALL env vars via Zod at **module load time**
- Missing env var → app crashes immediately at startup — this is INTENTIONAL (fail fast)
- NEVER use `process.env` directly — always import from `@/lib/env`

#### React 19 Rules

**Hooks:**
- `useActionState` for form submission states (replaces `useFormState`)
- `useOptimistic` for optimistic UI updates on review actions
- Custom hooks: `features/{feature}/hooks/use{Name}.ts`
- Hooks CANNOT be called conditionally or inside loops

**State Management (Zustand):**

| Store | Scope | Location |
|-------|-------|----------|
| `useReviewStore` | Review panel UI | `features/review/stores/review.store.ts` |
| `usePipelineStore` | Pipeline progress | `features/pipeline/stores/pipeline.store.ts` |
| `useUIStore` | Global UI | `src/stores/ui.store.ts` |
| `useKeyboardStore` | Keyboard shortcuts | `src/stores/keyboard.store.ts` |

- 1 store per feature domain — NO God Store
- NEVER mutate state directly — always use `set()`
- Realtime: `Supabase Realtime → Zustand Store → UI` (unidirectional)

**Forms:**

| Complexity | Approach |
|-----------|----------|
| Simple (login, project create) | Native `<form>` + `useActionState` + Zod at Server Action |
| Complex (glossary, taxonomy) | React Hook Form + Zod + field arrays |
| Keyboard actions (accept/reject) | Direct Server Action call via Zustand (NOT a form) |

**UI Density & Notifications:**
- Default spacing: **compact (0.75x)** — professional review tool, not consumer app
- `src/components/layout/compact-layout.tsx` as wrapper
- Skeleton fallbacks MUST match compact density to prevent layout shift
- **sonner is the SOLE toast/notification library** — NEVER create custom toast/notification components
- No `alert()`, no custom modals for action feedback
- Use `toast.promise()` for async actions with loading → success → error states

**Accessibility in RSC Boundaries:**
- `aria-live="polite"` on score display (updates via Realtime)
- `role="status"` on pipeline progress indicators
- `role="alert" aria-live="assertive"` on error messages
- All interactive elements keyboard accessible (no `tabindex > 0`)
- Form fields MUST have `<Label htmlFor>`, color contrast ≥ 4.5:1

#### Supabase Rules

**Client Factories — ALWAYS import from these:**

| File | Use Case |
|------|----------|
| `src/lib/supabase/server.ts` | Server Components, Server Actions |
| `src/lib/supabase/client.ts` | Client Components (Auth, Realtime) |
| `src/lib/supabase/admin.ts` | Admin ops (role sync, seed) — server-only |

- NEVER instantiate Supabase client inline
- Supabase client for **Auth, Storage, Realtime ONLY** — all DB queries via Drizzle ORM

**Realtime Subscription:**
- Every subscription MUST filter by `project_id`
- MUST cleanup on unmount: `return () => { supabase.removeChannel(channel) }`

#### Drizzle ORM Rules
- ALL DB queries through Drizzle query builder — NEVER raw SQL in app code
- Raw SQL allowed ONLY in: `src/db/migrations/`, `supabase/migrations/`, RLS test files
- Every query MUST include tenant filter via `withTenant(query, tenantId)` helper
- Schema files: `src/db/schema/{tableName}.ts` — one file per table

#### Inngest Rules
- Client: `src/lib/inngest/client.ts`
- Function registry: `src/features/pipeline/inngest/index.ts`
- Every step MUST have deterministic ID: `step.run("segment-{id}-L{layer}", ...)`
- NO try-catch inside `step.run()` — let Inngest handle retries
- Concurrency: `concurrency: { key: "event.data.projectId", limit: 1 }` for score recalc
- Events: dot-notation `finding.changed`, `pipeline.started`
- Function IDs: kebab-case `recalculate-score`, `process-pipeline-batch`
- Testing: mock `step.run()` in unit tests, Inngest Dev Server for integration
- Co-locate tests: `orchestrator.test.ts` next to `orchestrator.ts`

### Testing Rules

#### Test Organization

| Test Type | Location | Naming | Environment |
|-----------|----------|--------|-------------|
| Unit tests | Co-located next to source | `{name}.test.ts` | jsdom |
| Component tests | Co-located next to component | `{Name}.test.tsx` | jsdom |
| RLS tests | `src/db/__tests__/rls/` | `{table}.rls.test.ts` | node |
| E2E tests | `e2e/` (project root) | `{feature}.spec.ts` | Playwright |
| Inngest tests | Co-located | `{function}.test.ts` | jsdom |

#### Vitest Workspace (CRITICAL)
- Two separate projects in `vitest.workspace.ts`:
  - **unit** — `src/**/*.test.{ts,tsx}` excluding `db/__tests__/` — uses `jsdom`
  - **rls** — `src/db/__tests__/rls/**/*.test.ts` — uses `node` (needs real DB)
- NEVER mix environments — RLS tests need Node.js for Supabase CLI connection

#### Testing Commands
```bash
# Unit tests
npm run test:unit

# RLS tests (requires supabase start)
npm run test:rls

# E2E (requires dev server running)
npx playwright test

# Single test file
npx vitest run src/features/scoring/mqmCalculator.test.ts

# Watch mode (dev)
npx vitest --project unit
```

#### Coverage Expectations
- Unit: **every utility function + every business logic module** must have tests
- Component: **interactive components only** (with state/logic) — skip pure display
- RLS: **every table with RLS policy** must have cross-tenant test
- E2E: **4 critical paths only** — do NOT create additional E2E tests (slow, flaky)
- Rule: every task/subtask must be test-covered before marking complete

#### Test Naming Convention
```typescript
describe('MQMCalculator', () => {
  it('should return 100 when no penalties exist', () => { ... })
  it('should deduct 25 points per critical finding', () => { ... })
  it('should never return below 0', () => { ... })
})
```
Pattern: `describe("{Unit}")` → `it("should {behavior} when {condition}")`

#### No Snapshot Tests
- NEVER use snapshot tests for components
- Snapshots are brittle, hard to review, don't test real behavior
- Use Testing Library queries + assertions: `getByRole`, `getByText`, `fireEvent`

#### Test Data — Factory Functions ONLY
- ALL test data via factories in `src/test/factories.ts`
- NEVER hardcode test data inline
- NEVER use `as any` to bypass types
```typescript
export function buildFinding(overrides?: Partial<Finding>): Finding {
  return {
    id: faker.string.uuid(),
    tenantId: 'test-tenant',
    projectId: 'test-project',
    severity: 'major',
    category: 'accuracy',
    status: 'pending',
    ...overrides,
  }
}
```

#### Test Setup Rules (`src/test/setup.ts`)
- `afterEach`: clear all Zustand stores (prevent state leak between tests)
- `afterEach`: `vi.restoreAllMocks()` (reset all mocks)
- Setup global environment: timezone, locale
- Every test MUST be **independent** — run in any order
- Every test MUST **clean up** — no leftover state
- RLS tests: `beforeEach` creates fresh test tenant + user

#### Test Isolation
- NEVER share mutable state between `it()` blocks
- Each test creates its own data via factories
- RLS tests use isolated tenant per test case

#### Mock Organization
- Standardized mocks in `src/test/mocks/`:
  - `supabase.ts` — Mock Auth, Realtime, DB
  - `inngest.ts` — Mock step.run, events
  - `ai-providers.ts` — Mock OpenAI/Anthropic responses
  - `fast-xml-parser.ts` — Mock parser
- Test fixtures in `src/test/fixtures/`:
  - `segments/` — JSON (simple, with-findings, cjk-thai)
  - `sdlxliff/` — Sample files (minimal, with-namespaces)
  - `glossary/` — Sample terms

#### CI Quality Gates

| Gate | Trigger | Steps |
|------|---------|-------|
| **quality-gate** | Every PR | lint → type-check → unit tests → RLS tests → build |
| **e2e-gate** | Merge to main | Playwright 4 critical paths |
| **chaos-test** | Weekly + manual | AI fallback mock → verify chain + audit |

#### Critical Path E2E Tests

| # | Test | Coverage |
|---|------|----------|
| E1 | Upload SDLXLIFF → see segments | File parsing pipeline |
| E2 | Run QA → see findings + score | Full 3-layer pipeline |
| E3 | Accept/reject finding → score recalculate | Review workflow + atomicity |
| E4 | Login → see only own tenant data | Auth + multi-tenancy |

#### RLS Test Requirements (CI Gate)
- Cross-tenant leak: Tenant A MUST NOT see Tenant B data
- Negative tests with different JWT claims (tenant_id)
- Test against Supabase local CLI — NEVER production
- Must pass before every merge

#### Security Test Scenarios (CI Gate)

| # | Attack Scenario | Expected Behavior |
|---|----------------|-------------------|
| S1 | Admin removes role → user has old JWT → write | BLOCKED by DB lookup (M3) |
| S2 | User tampers JWT claims | BLOCKED by Supabase signature |
| S3 | Tenant A admin assigns role in Tenant B | BLOCKED by RLS |
| S4 | Rate limit bypass via multiple tokens | BLOCKED by per-user rate limit |
| S5 | Stale JWT → admin page → admin action | BLOCKED by M3 DB lookup |

#### Pipeline Failure Scenarios

| # | Failure | Expected Behavior |
|---|--------|-------------------|
| F1 | AI provider timeout on L2 | Inngest retries → fallback provider |
| F2 | Partial batch failure | Completed segments preserved, failed retry |
| F3 | Score recalc during active review | Serial queue prevents race condition |
| F4 | File >15MB upload | Reject at upload endpoint, never reach parser |
| F5 | DB connection failure mid-pipeline | Inngest retries, idempotent IDs prevent duplicates |

### Code Quality & Style Rules

#### Naming Conventions

**Database:**

| Element | Convention | Example |
|---------|-----------|---------|
| Tables | snake_case, plural | `projects`, `findings`, `audit_logs` |
| Columns | snake_case | `tenant_id`, `created_at` |
| Foreign keys | `{table_singular}_id` | `project_id`, `user_id` |
| Indexes | `idx_{table}_{columns}` | `idx_findings_tenant_created` |
| Timestamps | Always `timestamptz` | `created_at`, `updated_at` |

**Code:**

| Element | Convention | Example |
|---------|-----------|---------|
| Components | PascalCase `.tsx` | `FindingCard.tsx`, `ReviewPanel.tsx` |
| Hooks | `use` + PascalCase `.ts` | `useReviewStore.ts` |
| Stores | `{domain}.store.ts` | `review.store.ts` |
| Utilities | camelCase `.ts` | `mqmCalculator.ts` |
| Server Actions | `{action}.action.ts` | `updateFinding.action.ts` |
| CSS files | kebab-case | `tokens.css`, `animations.css` |

**API/Events:**

| Element | Convention | Example |
|---------|-----------|---------|
| Route Handlers | `/api/{resource}` kebab-case | `/api/inngest`, `/api/health` |
| Server Action fns | camelCase verb-first | `updateFinding()`, `submitReview()` |
| Inngest events | `{domain}.{verb}` dot-notation | `finding.changed` |
| Inngest function IDs | kebab-case | `recalculate-score` |

#### File & Folder Structure
- Feature-based co-location: `src/features/{feature}/components|actions|hooks|stores|validation/`
- Shared UI: `src/components/ui/` (shadcn) + `src/components/layout/`
- Shared utilities: `src/lib/{name}.ts`
- DB schemas: `src/db/schema/{tableName}.ts` — one file per table
- Global stores: `src/stores/{name}.store.ts`
- Types: `src/types/{name}.ts`

#### No Barrel Exports
- ❌ NEVER create barrel `index.ts` in feature folders — breaks tree-shaking, causes circular deps
- ✅ Import directly: `import { FindingCard } from '@/features/review/components/FindingCard'`
- **Exceptions** (architecture-defined):
  - `src/db/schema/index.ts` — re-export all schemas
  - `src/features/pipeline/inngest/index.ts` — function registry

#### File Size Guidelines
- Component files: **~250 lines max** — extract sub-components if longer
- Utility/logic files: **~200 lines max** — split by concern if longer
- Not a hard rule but keeps code reviewable

#### Data Format Conventions

| Format | Convention |
|--------|-----------|
| Date/Time in DB | `timestamptz` (UTC) |
| Date/Time in JSON | ISO 8601 `"2026-02-14T10:30:00.000Z"` |
| Date/Time in UI | `Intl.DateTimeFormat` per user locale |
| JSON fields | camelCase |
| DB columns | snake_case |

Drizzle handles camelCase ↔ snake_case mapping automatically.

#### ESLint & Prettier (CI Enforced)
- Import order enforcement
- No default exports (except Next.js pages)
- No `console.log`
- RSC boundary props check
- Prettier for formatting consistency

#### Tailwind CSS Rules
- Use CSS custom properties from `src/styles/tokens.css` — NEVER inline Tailwind colors
- Use Tailwind default breakpoints ONLY — no arbitrary `min-[1100px]:` values
- Desktop-first responsive approach
- Design tokens via `@theme` directive in Tailwind v4

**Color Tokens (MUST use — never raw Tailwind colors):**
```css
/* src/styles/tokens.css */
@theme {
  --color-primary: #4F46E5;        /* Indigo */
  --color-primary-hover: #4338CA;
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-surface: #FFFFFF;
  --color-surface-secondary: #F9FAFB;
  --color-text-primary: #111827;
  --color-text-secondary: #6B7280;
}
```
Use `bg-primary` NOT `bg-indigo-600` — enables future dark mode + theming.

**Animation Rules:**
- All transitions via Tailwind `transition-*` classes or custom from `src/styles/animations.css`
- NEVER use inline `style={{ transition: '...' }}`

#### Icon Library
- **Lucide React** (ships with shadcn/ui) — SOLE icon library
- NEVER use heroicons, font-awesome, or inline SVG
- `import { Check, X, AlertTriangle } from 'lucide-react'`

#### Comment Policy
- ❌ No JSDoc on every function — ONLY on public API functions exported from `src/lib/`
- ✅ Comment **"why" not "what"** — if code is self-explanatory, no comment needed
- ✅ MUST comment: complex business rules, workarounds, magic numbers, non-obvious decisions
  - Example: `// 15MB limit: Vercel 1024MB - parser 6-10x overhead (Decision 1.6)`

#### TODO Convention
- Format: `// TODO(username): description — ticket/issue ref`
- NEVER leave orphan TODOs without owner or reference

### Development Workflow Rules

#### Story Implementation Discipline
- Agent MUST **read story details + acceptance criteria before coding**
- NEVER implement features NOT in the current story — no scope creep
- Every subtask must have tests before marking complete
- Story done = **100% AC covered + all tests pass + code matches project context**
- **AC was pre-validated** via Architecture Assumption Checklist before locking — if AC seems wrong for real architecture, flag to SM immediately: `_bmad-output/architecture-assumption-checklist.md`

#### Git Branch Strategy
- `main` — production, protected
- `feature/{epic}-{story}-{short-description}` — features
- `fix/{short-description}` — bug fixes
- `chore/{short-description}` — maintenance, config
- All branches merge via PR to `main` only

#### Commit Message Format
- Conventional Commits: `type(scope): description`
- Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `ci`
- Scope = feature module: `feat(review): add batch accept action`
- Subject ≤ 72 characters, body for "why" when needed

#### PR Checklist (ALL must pass)
- [ ] Every AC in story implemented
- [ ] Unit tests pass 100%
- [ ] RLS tests pass (if DB changes)
- [ ] No `as any`, `console.log`, orphan `TODO`
- [ ] Audit log written for every state change
- [ ] Naming conventions match project context
- [ ] `import 'server-only'` present where required
- [ ] CI quality-gate passes (lint → type-check → tests → build)

#### Standardized npm Scripts
```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --ext .ts,.tsx",
    "type-check": "tsc --noEmit",
    "test:unit": "vitest run --project unit",
    "test:rls": "vitest run --project rls",
    "test:e2e": "playwright test",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

#### Local Development Setup
```bash
# 1. Install dependencies
npm install

# 2. Start Supabase local (required for RLS tests + auth)
npx supabase start

# 3. Pull env vars (if using Vercel)
npx vercel env pull .env.local

# 4. Run DB migrations
npm run db:migrate

# 5. Seed data (optional)
npx supabase db reset

# 6. Start dev server
npm run dev
```

#### Hot Reload Caveats
- `.env.local` changes → MUST restart dev server (hot reload doesn't pick up env changes)
- Drizzle schema changes → MUST run `npm run db:generate` + `npm run db:migrate` (no auto-sync)

#### Environment Management
- Secrets ONLY in Vercel Dashboard — NEVER in repo
- `.env.local` for local dev (git-ignored)
- `.env.example` committed with all keys + descriptions (no values)
- `vercel env pull` to sync env vars locally

#### Deployment Flow
- Push to `main` → Vercel auto-deploys production
- Push to feature branch → Vercel preview deployment
- No manual deployment — everything via git

#### Vercel Deployment Limits
- Build output: ≤ 250MB compressed
- Serverless function: ≤ 50MB bundled — watch heavy deps in Server Actions
- Edge function: ≤ 4MB — `middleware.ts` must be lean
- Build timeout: 45 minutes — optimize if approaching

#### Database Migration Workflow
```bash
# 1. Edit schema in src/db/schema/
# 2. Generate migration
npm run db:generate

# 3. Review generated SQL in src/db/migrations/
# 4. For RLS/triggers: add custom SQL to supabase/migrations/
# 5. Apply locally
npm run db:migrate

# 6. Test RLS
npm run test:rls

# 7. Commit migration files with schema changes
```

#### Migration Safety Rules
- NEVER run destructive migrations (DROP TABLE/COLUMN) without backup plan
- Migrations MUST be backwards compatible — deploy code first, then migrate
- RLS policy changes: test locally + staging before production
- Always include rollback SQL for critical migrations

#### Audit Trail Discipline
- EVERY state-changing Server Action MUST write to audit log
- Audit write goes INSIDE try-catch, BEFORE the return
- If audit write fails → entire action MUST fail (throw)
  - **Exception (Story 2.4 CR R1 decision):** Score calculation audit is non-fatal — the pipeline
    must not block on audit failure. Pattern: `try { await writeAuditLog(...) } catch (e) { logger.error() }`.
    Only applies to `calculateScore.action.ts` and future pipeline step actions.
- NEVER skip audit for "minor" changes — every state change is logged

### Critical Don't-Miss Rules

#### Anti-Patterns (FORBIDDEN)

| # | Anti-Pattern | Correct Approach |
|---|-------------|-----------------|
| 1 | `export default` (except page/layout) | Named exports only |
| 2 | `any` type | Define proper types/interfaces |
| 3 | Raw SQL in app code | Drizzle ORM query builder (exception: migrations, RLS tests) |
| 4 | `service_role` key in client code | `anon` key for client; `service_role` server-only |
| 5 | Hardcode `tenant_id` | Read from JWT/session via `getCurrentUser()` |
| 6 | Mutate Zustand state directly | Always use `set()` function |
| 7 | `"use client"` on page component | Feature boundary pattern |
| 8 | Skip audit log for state change | Log EVERY state change |
| 9 | `console.log` in production | pino (Node.js) or edgeLogger (Edge) |
| 10 | Inline Tailwind colors | CSS custom properties from tokens.css |
| 11 | `process.env` direct access | `@/lib/env` validated config |
| 12 | Inline Supabase client | Factory from `@/lib/supabase/` |
| 13 | try-catch inside Inngest step.run() | Let Inngest handle retries |
| 14 | Arbitrary responsive breakpoints | Tailwind defaults only |
| 15 | Hardcoded test data | Factory functions from `src/test/factories.ts` |

#### Multi-Tenancy Rules (CRITICAL)
- `tenant_id` column on EVERY table (except `taxonomy_definitions`)
- EVERY query MUST use `withTenant(query, tenantId)` helper
- RLS enforced on critical tables from Day 1
- Cross-tenant data leak = highest severity security bug
- `service_role` key ONLY for: Inngest functions, seed scripts, admin operations

#### CJK/Thai Language Edge Cases
- **NFKC normalization required** before any text comparison — halfwidth ≠ fullwidth without normalization
- **Glossary matching:** substring search (indexOf) primary + Intl.Segmenter boundary validation secondary
- **Intl.Segmenter fallback:** if boundary validation fails, accept substring match with "Low confidence" flag
- **Word counting:** use `Intl.Segmenter` with `isWordLike` filter — NOT space-splitting
- **Text size guard:** chunk at 30,000 chars to prevent stack overflow in segmenter
- **Markup stripping:** remove inline tags/placeholders BEFORE segmentation, maintain offset map
- **Node.js requirement:** 18+ with full ICU — small-icu WILL SEGFAULT

#### SDLXLIFF Parser Rules
- **15MB hard limit** — reject at upload endpoint BEFORE reading into memory
- DOM parsing (full parse) — NOT streaming for MVP
- fast-xml-parser with `preserveOrder` + namespace handling
- Memory budget: ~300-450MB peak on 15MB file (leaves 574-724MB headroom on Vercel 1024MB)

#### Score Calculation Atomicity
- Score recalculation via Inngest serial queue: `concurrency: { key: projectId, limit: 1 }`
- Client-side debounce 500ms on finding changes
- Approve button DISABLED during recalculation ("Recalculating..." badge)
- Server-side check: `scores.status === 'calculated'` before allowing approval
- If status is `'calculating'` → return `{ success: false, code: 'SCORE_STALE' }`

#### Immutable Audit Log (Defense-in-Depth)
- Layer 1: Application code — only INSERT, never UPDATE/DELETE
- Layer 2: RLS policy — INSERT only (blocks app-level DELETE/UPDATE)
- Layer 3: DB trigger — RAISE EXCEPTION on DELETE/UPDATE (blocks admin-level)
- Audit entries are NEVER deleted — GDPR deletion anonymizes (`[REDACTED]`) instead

#### AI Pipeline Safety
- Version pinning: pinned model first → fallback with audit flag
- Every AI call MUST log: provider, model, tokens_in, tokens_out, estimated_cost_usd, duration_ms
- Fallback triggers audit entry — admin notified when pinned version unavailable
- Economy mode = L1+L2 only; Thorough mode = L1+L2+L3

---

## Usage Guidelines

**For AI Agents:**
- Read this file BEFORE implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Cross-reference with Architecture Document for detailed rationale

**For Humans:**
- Keep this file lean and focused on agent needs
- Update when technology stack or patterns change
- Review quarterly for outdated rules
- Remove rules that become obvious over time

**Source Documents:**
- Architecture Document: `_bmad-output/planning-artifacts/architecture/`
- PRD: `_bmad-output/planning-artifacts/prd.md`
- UX Spec: `_bmad-output/planning-artifacts/ux-design-specification/`

Last Updated: 2026-02-23
