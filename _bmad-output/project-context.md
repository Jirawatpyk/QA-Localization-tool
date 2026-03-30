---
project_name: 'qa-localization-tool'
user_name: 'Mona'
date: '2026-03-29'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality_style', 'dev_workflow', 'critical_rules']
status: 'complete'
rule_count: 174
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

> Epic 1–4 complete. Epic 5 (Language Intelligence & Non-Native Support) in-progress.
> Story 5.1–5.2c done. Story 5.3 in review.

### Core Framework
- **Next.js 16.1.6** — App Router, Turbopack dev, React Compiler, `next.config.ts` (TypeScript config)
- **React 19.2.3** — RSC + Client Components
- **TypeScript 5.9.3** — strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- **Node.js 18+ LTS** — MUST have full ICU (`small-icu` will SEGFAULT on Intl.Segmenter)
- **npm** — Package manager (NOT pnpm, NOT bun)

### UI & Styling
- **Tailwind CSS 4.1.18** — `@theme` directive for design tokens, CSS custom properties in `src/styles/tokens.css`
- **shadcn/ui** via **radix-ui 1.4.3** — unified package (base + custom shared: StatusBadge, ProgressRing, EmptyState)
- **Inter** (UI) + **JetBrains Mono** (code) — loaded via `next/font`
- **Indigo primary** (#4F46E5)

### Backend & Data
- **Supabase** (Pro plan) — Auth + PostgreSQL + Storage + Realtime
  - Connection pooling: Supavisor, Transaction mode, Pool Size 15
  - Connect via pooler URL (port 6543), NOT direct (port 5432)
- **Drizzle ORM 0.45.1** — Schema-first + `drizzle-zod 0.8.3` for validation
  - Flow: `drizzle schema → drizzle-zod → extend with Zod` (unidirectional, no circular deps)
  - `drizzle-zod` 0.8+ API: `createInsertSchema()` / `createSelectSchema()` signatures differ from 0.5.x — do NOT copy from old tutorials
- **postgres (postgres.js) 3.4.8** — DB driver for Drizzle. NEVER import `pg` — this project uses `postgres` (different library)
- **Inngest 3.52.0** — Durable functions, 3-tier pipeline orchestration
- **Supabase CLI** — Required for local dev (`supabase start`) and RLS tests in CI

### AI & Processing
- **Vercel AI SDK 6.0.86** — Multi-provider abstraction
- **fast-xml-parser 5.3.6** — SDLXLIFF/XLIFF parsing with namespace support

#### AI SDK 6.0 Breaking Changes (CRITICAL — agents MUST read)

AI SDK 6.0 removed `generateObject()` and `streamObject()` entirely. This is NOT a deprecation — calling them will throw.

| Before (AI SDK 4.x/5.x) | After (AI SDK 6.0) |
|---|---|
| `generateObject({ schema })` | `generateText({ output: Output.object({ schema }), ... })` → access via `result.output` |
| `streamObject({ schema })` | `streamText({ output: Output.object({ schema }), ... })` |
| `maxTokens` | `maxOutputTokens` |
| Zod `.optional()` / `.nullish()` | `.nullable()` ONLY (OpenAI rejects `.optional()`) |

- Import `Output` from `'ai'`
- Use shared `customProvider` from `@/lib/ai/client.ts` — NEVER inline `openai()` / `anthropic()` constructors

#### AI Model Configuration

| Layer | Primary | Fallback |
|---|---|---|
| **L2** (AI Screening) | OpenAI `gpt-4o-mini` via `@ai-sdk/openai 3.0.34` | Google `gemini-2.0-flash` via `@ai-sdk/google 3.0.33` |
| **L3** (Deep Analysis) | Anthropic `claude-sonnet-4-5-20250929` via `@ai-sdk/anthropic 3.0.47` | OpenAI `gpt-4o` |
| **BT** (Back-Translation) | Separate model alias `'BT'` — distinct from L2 (Guardrail #51) | Budget-gated fallback to claude-sonnet (Guardrail #56) |

### Validation
- **Zod 4.3.6** — MAJOR version bump from 3.x. Key differences agents must know:
  - `z.input()` / `z.output()` behavior differs from Zod 3
  - `.transform()` chaining rules changed
  - Training data likely references Zod 3 API — verify against Zod 4 docs before using
- **React Hook Form 7.71.1** + `@hookform/resolvers 5.2.2` — Complex forms

### State & Realtime
- **Zustand 5.0.11** — Domain-split stores (1 store per feature, no God Store)
- **Supabase Realtime** — postgres_changes subscriptions per project

### Testing
- **Vitest 4.0.18** + `@vitest/coverage-v8 4.0.18` — 4 test projects (NOT 2)
  - Workspace config lives in `vitest.config.ts` → `test.projects[]` — do NOT create separate `vitest.workspace.ts`
  - Coverage thresholds are **enforced** — Vitest CLI **fails** if below threshold (CI gate)

| Project | Include | Environment | Timeout |
|---|---|---|---|
| `unit` | `src/**/*.test.{ts,tsx}` (excl. db/__tests__, integration, ai-integration) | jsdom | 15s |
| `rls` | `src/db/__tests__/rls/**/*.test.ts` | node | 30s |
| `integration` | `src/__tests__/integration/**/*.test.ts` | node | 60s |
| `ai-integration` | `src/__tests__/ai-integration/**/*.test.ts` | node | 60s |

  - Coverage thresholds: lines 88%, statements 87%, branches 78%, functions 78%

- **Playwright 1.58.2** — E2E tests
- **@testing-library/react 16.3.2** — Must match React 19
- **@faker-js/faker 10.3.0** — Test data factories (dev dependency)
- **@inngest/test 0.1.9** — Pre-release; project uses `Object.assign` pattern to expose `handler` + `onFailure` for testing (Guardrail #9), not `@inngest/test` API directly

### Code Quality Tooling
- **ESLint 9.29.0** + **eslint-config-next 16.1.6** — Flat config (`eslint.config.mjs`)
- **Prettier 3.8.1** — Formatting
- **Husky 9.1.7** + **lint-staged 16.2.7** — Pre-commit hooks enforced. `--no-verify` is FORBIDDEN (Guardrail #28)

### Infrastructure
- **Vercel** (Pro plan) — Hosting, deploy, analytics
- **GitHub Actions** — CI: quality-gate (every PR) + e2e-gate (main) + chaos-test (weekly)
- **Upstash Redis** — Edge-compatible rate limiting (sliding window)

### Key Libraries
- **pino 10.3.1** — Structured JSON logging (Node.js runtime ONLY)
- **sonner 2.0.7** — Sole toast/notification library
- **ExcelJS 4.4.0** — Excel file parsing (use `// @ts-expect-error ExcelJS Buffer type conflict`)
- **driver.js 1.4.0** — Onboarding tour
- **@react-pdf/renderer 4.3.2** — PDF export
- **recharts 3.7.0** — Dashboard charts
- **@dnd-kit** — Drag and drop (core 6.3.1, sortable 10.0.0)
- **cmdk 1.1.1** — Command palette

### Runtime Compatibility (CRITICAL)

| Runtime | Compatible Libraries | DO NOT Import Here |
|---------|---------------------|-------------------|
| **Edge Runtime** (middleware.ts) | `@upstash/ratelimit`, `@upstash/redis`, `@supabase/ssr` | `pino`, `drizzle-orm`, `fast-xml-parser`, `inngest` |
| **Node.js Runtime** (Server Components, Actions, Inngest) | Everything server-side | — |
| **Browser** (Client Components) | `zustand`, `sonner`, `react-hook-form`, `@supabase/ssr` | `pino`, `drizzle-orm`, server-only modules |

### Version Constraints
- Node.js MUST be 18+ with full ICU data (Intl.Segmenter CJK/Thai)
- Drizzle ORM 0.x → monitor for 1.0 breaking changes
- Next.js 16 `"use cache"` is stable — do NOT use legacy `unstable_cache`
- `@testing-library/react` version MUST match React major version
- AI SDK 6.0: `generateObject()` / `streamObject()` are REMOVED — use `generateText` + `Output.object()`
- Zod 4.x: verify API compatibility before using Zod 3 patterns from training data

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
  - `src/db/index.ts`, `src/db/connection.ts`, `src/db/client.ts`
  - All `features/*/actions/*.action.ts`

#### Type Definitions
- PascalCase for types/interfaces: `Finding`, `ReviewSession`, `PipelineConfig`
- No `I` prefix: `Finding` not `IFinding`
- No `Type` suffix: `Finding` not `FindingType`
- Zod schemas: camelCase + `Schema` suffix: `findingSchema`, `projectConfigSchema`
- Constants: UPPER_SNAKE_CASE: `MAX_FILE_SIZE_BYTES`, `DEFAULT_BATCH_SIZE`
- **No bare `string` for status/severity** — always use union type or import from `@/types/` (Guardrail #22)

#### Branded Types (CRITICAL — read before writing any query or action)
- **`TenantId`** — branded type enforced by `withTenant()` helper
  - Production: `requireRole()` → `validateTenantId()` returns `TenantId`
  - Tests: `asTenantId(faker.string.uuid())` to create branded value
  - Passing raw `string` to `withTenant()` is a compile error
- **`AssignmentStatus`** — `'pending' | 'in_review' | 'confirmed' | 'overridden'` (Guardrail #72)
- Every DB query MUST use `withTenant(table.tenantId, tenantId)` — see Critical Rules section for full pattern

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
| Inngest onFailure | Log + mark pipeline failed + audit entry |
| Audit-critical | MUST throw + `pino.error()` — never silently fail |
| Audit in pipeline | Non-fatal: `try { writeAuditLog() } catch { logger.error() }` (Guardrail #2) |
| Edge Middleware | Use `edgeLogger` (structured JSON) — never `console.log` |

#### Async Patterns
- Prefer `async/await` over raw Promises
- Server Components can be `async` directly (React 19 RSC)
- Client Components CANNOT be `async` — use `useEffect` or data fetching hooks
- Inngest steps: `await step.run("deterministic-id", async () => { ... })`
- **`void asyncFn()` swallows errors** — use `.catch(() => {})` for non-critical, or `await` with try-catch (Guardrail #23)

#### Null Handling
- `null` for intentional absence (DB columns, API responses)
- `undefined` for optional parameters and missing object properties
- With `exactOptionalPropertyTypes`, these are NOT interchangeable
- **Optional filter: use `null`, not `''`** — `optionalId ?? ''` silently matches nothing. Use ternary: `fileId ? eq(col, fileId) : undefined` (Guardrail #6)

#### DB Query Safety Rules
- See CLAUDE.md Guardrails #3-5 (`rows[0]!` guard, `inArray([])` guard, DELETE+INSERT transaction)

#### React 19 State Sync (CRITICAL)
- `setState` inside `useEffect` is FORBIDDEN (React Compiler error)
- Use **render-time adjustment pattern** (store-prev-compare):
```typescript
const [prev, setPrev] = useState(prop)
if (prev !== prop) {
  setPrev(prop)
  setState(newVal)
}
```
- Test this pattern by verifying state updates synchronously during render, NOT in useEffect callbacks

#### Type Safety in Tests
- NEVER use `as any` to bypass strict mode in tests
- Use factory functions from `src/test/factories.ts`
- Use `createDrizzleMock()` + `createActionTestMocks()` — shared, never inline
- **Drizzle mock call order matters** — mock MUST setup return values matching actual production code execution sequence (SELECT → UPDATE → INSERT). Wrong order = false-passing tests
- `test.skip()` policy + ExcelJS type exception: see CLAUDE.md Guardrails #29, #26

#### `satisfies` Operator
- Use `satisfies` for config objects needing both type validation AND literal type inference

#### Zod Array Uniqueness
- `z.array(z.string().uuid())` does NOT deduplicate
- Add `.refine(ids => new Set(ids).size === ids.length, 'Duplicate IDs')` (Guardrail #24)

### Framework-Specific Rules

#### Next.js 16 App Router

**Route Group Conventions:**
- `(auth)/` — public routes: login, signup, callback (no app shell, no sidebar)
- `(app)/` — protected routes: everything after login (with sidebar + header)

**RSC/Client Component Boundaries:**

| Feature | Default | Rationale |
|---------|---------|-----------|
| Review panel | 🔴 Client | Keyboard shortcuts, inline editing, real-time |
| LanguageBridge (BT) | 🔴 Client | Per-segment AI calls, AbortController, debounce |
| Dashboard | 🟢 Server + 🔴 Client charts | Data-heavy layout server, charts client |
| Project list/detail | 🟢 Server | Data display, minimal interactivity |
| Settings/Config | 🟢 Server + 🔴 Client forms | Layout server, forms client |
| Glossary editor | 🔴 Client | Dynamic fields, real-time validation |
| Finding assignments | 🔴 Client | Real-time status, cross-role interactions |

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
- **Invalidation chain example:** glossary update → invalidate glossary cache → ALSO invalidate BT cache for affected project+language pair (CASCADE does NOT apply here — glossary change doesn't delete segments, but context changed). Always trace downstream caches when invalidating upstream data.

**API Patterns:**

| Use Server Actions | Use Route Handlers |
|---|---|
| UI forms, review actions, glossary CRUD, score override, settings, BT requests | Inngest serve (`/api/inngest`), webhooks, file upload w/ progress, health check |

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

**Viewport & Hydration (E2E + Production):**
- `useIsDesktop` hook reads `window.innerWidth` at hydration time
- **Set viewport BEFORE navigate** — not after. If viewport changes post-navigate, component hydrates with wrong layout mode and React does NOT re-render
- After navigation, wait for `[data-layout-mode="desktop"]` attribute before interacting
- This applies to both E2E tests AND SSR edge cases with responsive layouts

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

**Undo Stack Pattern (Zustand):** See CLAUDE.md Guardrail #25 (per-tab, max 20, server verifies `previous_state`)

**Forms:**

| Complexity | Approach |
|-----------|----------|
| Simple (login, project create) | Native `<form>` + `useActionState` + Zod at Server Action |
| Complex (glossary, taxonomy) | React Hook Form + Zod + field arrays |
| Keyboard actions (accept/reject) | Direct Server Action call via Zustand (NOT a form) |

**UI Density & Notifications:**
- Default spacing: **compact (0.75x)** — professional review tool, not consumer app
- Skeleton fallbacks MUST match compact density to prevent layout shift
- **sonner is the SOLE toast/notification library** — NEVER create custom toast/notification components
- Use `toast.promise()` for async actions with loading → success → error states

**Accessibility (WCAG 2.2 AA — CRITICAL):**

| Rule | Requirement | Guardrail |
|------|-------------|-----------|
| Severity display | Icon shape + text + color — color never sole info carrier. Grayscale must be readable | #15 |
| Contrast | 4.5:1 normal text, 3:1 large text + non-text UI | #16 |
| Focus ring | `outline: 2px solid var(--color-primary)`, `outline-offset: 4px`. NEVER `outline: none` | #16 |
| Keyboard shortcuts | Single-key hotkeys active ONLY in review area. Suppress in inputs/modals | #17 |
| Modal + escape | Trap focus + restore on close. Escape: innermost layer first, `stopPropagation()` | #18 |
| ARIA landmarks | `<nav>` file nav, `<main>` finding list, `role="complementary"` detail panel | #19 |
| Live regions | `aria-live="polite"` default, `"assertive"` only errors | #19 |
| `lang` attribute | `lang="{languageCode}"` on every source/target/BT text element | #19, #70 |
| CJK containers | 1.1x font scale | #19 |
| Motion | `prefers-reduced-motion: reduce` on ALL animations | #20 |
| Focus stealing | No focus on mount. Auto-expand visual only. `useEffect` + `.focus()` FORBIDDEN except modal open + auto-advance | #20 |
| Dialog state reset | `useEffect(() => { if (open) resetForm() }, [open])` | #21 |
| Roving tabindex | Grid navigation: `tabindex="0"` on focused row, `-1` on others | #17 |

**Keyboard Navigation:**
- Single-key hotkeys: A/R/F/N/S/+/-/J/K/C/O — review area ONLY
- No browser shortcut override (Ctrl+S/P/W/N/T/F5)
- Auto-advance after action: `requestAnimationFrame` delay, never sync focus in handler

**Back-Translation (LanguageBridge) Panel UI:** See CLAUDE.md Guardrails #53 (debounce), #70 (lang attr), #75 (abort), #77 (cache badge + refresh)

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
- Every query MUST include tenant filter via `withTenant(table.tenantId, tenantId)` helper
- Schema files: `src/db/schema/{tableName}.ts` — one file per table
- **DB constraint added → audit all INSERT/UPDATE paths** — when adding UNIQUE/CHECK/FK, audit every `db.insert()` and `db.update()` that touches that table. Add conflict handling (Guardrail #8)
- **Asymmetric query filters** — when one query gets `eq(projectId)`, audit ALL sibling queries in same function for consistency (Guardrail #7)

**RLS Double Defense:** Drizzle client bypasses RLS; `createServerClient()` goes through RLS. Both layers required — see CLAUDE.md Guardrails #63 (atomic migration), #64 (double defense), #71 (enable RLS in same migration)

#### Back-Translation Caching Rules
- See CLAUDE.md Guardrails #57-61 for full caching rules (cache key with targetTextHash, onConflictDoUpdate, CASCADE, TTL, withTenant)
- **NOT in CLAUDE.md:** Cache invalidation chain — glossary update → must explicitly `DELETE FROM back_translation_cache` for affected project+language pair (CASCADE does NOT apply because glossary change doesn't delete segments)

#### Inngest Rules
- Client: `src/lib/inngest/client.ts`
- Function registry: `src/features/pipeline/inngest/index.ts`
- Every step MUST have deterministic ID: `step.run("segment-{id}-L{layer}", ...)`
- NO try-catch inside `step.run()` — let Inngest handle retries
- Config MUST have `retries` + `onFailure`. `Object.assign` MUST expose `handler` + `onFailure` for tests (Guardrail #9)
- Concurrency: `concurrency: { key: "event.data.projectId", limit: 1 }` for score recalc
- Events: dot-notation `finding.changed`, `pipeline.started`
- Function IDs: kebab-case `recalculate-score`, `process-pipeline-batch`
- Register every function in `route.ts` functions array

**AI Cost + Budget Guard:** See CLAUDE.md Guardrail #12. BT calls use layer `'BT'` distinct from L2/L3 (Guardrail #52)

**AI Error Handling:**
- `RateLimitError` (429) = retriable — let Inngest retry
- `NoObjectGeneratedError` / auth 401 / content filter = `throw new NonRetriableError(...)`
- Always log `{ finishReason, usage, model, cause }` (Guardrail #11)

**AI Chunks:**
- Chunk at 30K chars. One `step.run()` per chunk with deterministic ID: `l2-chunk-${fileId}-${i}`
- Failed chunk logs + continues. Return `{ findingCount, chunksProcessed, partialFailure }` (Guardrail #13)

**Pipeline Fail Loud:**
- If `findingCount === 0` from non-trivial input (segments > 10) → raise error, not silent log (Guardrail #14)

### Testing Rules

#### Test Organization

| Test Type | Location | Naming | Environment |
|-----------|----------|--------|-------------|
| Unit tests | Co-located next to source | `{name}.test.ts` | jsdom |
| Component tests | Co-located next to component | `{Name}.test.tsx` | jsdom |
| RLS tests | `src/db/__tests__/rls/` | `{table}.rls.test.ts` | node |
| Integration | `src/__tests__/integration/` | `{feature}.test.ts` | node |
| AI Integration | `src/__tests__/ai-integration/` | `{feature}.test.ts` | node |
| E2E tests | `e2e/` (project root) | `{feature}.spec.ts` | Playwright |
| Inngest tests | Co-located | `{function}.test.ts` | jsdom |

#### Testing Commands
```bash
npm run test:unit           # Unit tests (jsdom)
npm run test:rls            # RLS tests (requires supabase start)
npm run test:e2e            # Playwright E2E
npm run test                # All Vitest tests
npm run test:ai             # AI integration tests (requires API keys)
npm run test:parity         # Xbench parity golden corpus tests

# Single test file
npx vitest run src/features/scoring/mqmCalculator.test.ts

# Watch mode (dev)
npx vitest --project unit

# E2E with Inngest (MUST use dotenv-cli)
INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test
```

#### Coverage Expectations
- Unit: **every utility function + every business logic module** must have tests
- Component: **interactive components only** (with state/logic) — skip pure display
- RLS: **every table with RLS policy** must have cross-tenant test (Guardrail #76)
- E2E: Full (every scenario) for critical flows + Smoke (1 happy path) for other UI pages
- AI Integration: call real AI API + verify findings inserted. Mock-only tests don't catch format mismatch (Guardrail #14)
- Rule: every task/subtask must be test-covered before marking complete
- **Boundary value tests:** Every AC with numeric thresholds MUST have explicit boundary tests (at, below, above, zero)

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
- NEVER use snapshot tests — ESLint enforced (`toMatchSnapshot` / `toMatchInlineSnapshot` banned)
- Use Testing Library queries + assertions: `getByRole`, `getByText`, `fireEvent`

#### Test Data — Factory Functions ONLY
- ALL test data via factories in `src/test/factories.ts`
- NEVER hardcode test data inline
- NEVER use `as any` to bypass types
- Use `createDrizzleMock()` + `createActionTestMocks()` for Server Action tests

#### Test Setup Rules (`src/test/setup.ts`)
- `afterEach`: clear all Zustand stores (prevent state leak between tests)
- `afterEach`: `vi.restoreAllMocks()` (reset all mocks)
- Every test MUST be **independent** — run in any order
- Every test MUST **clean up** — no leftover state
- RLS tests: `beforeEach` creates fresh test tenant + user

#### RLS Test Requirements
- Cross-tenant leak: Tenant A MUST NOT see Tenant B data
- Negative tests with different JWT claims (tenant_id)
- Every role-scoped policy MUST test all role x operation combinations (Guardrail #76):
  - admin (full access), qa_reviewer (scoped to project), native_reviewer (scoped to assignments), unauthenticated (denied)
  - Each test verifies both positive (allowed) AND negative (denied)
- Test against Supabase local CLI — NEVER production

#### E2E Testing Patterns (Learned from Epic 4-5)
- **Set viewport BEFORE navigate** — `useIsDesktop` reads at hydration, not after
- **Wait `[data-layout-mode="desktop"]`** after navigation before interacting
- **`click()` not `focus()`** for activeFindingId sync in review panel
- **Force accordion expand** via `data-state` attribute check, not just click toggle
- **Multi-user E2E:** `signupOrLogin` creates NEW tenant per user — use `moveUserToTenant()` + `setUserRole()` + `setUserNativeLanguages()` for multi-user tests in same tenant
- **Inngest required:** `INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test`

#### CI Quality Gates

| Gate | Trigger | Steps |
|------|---------|-------|
| **quality-gate** | Every PR | lint → type-check → unit tests → RLS tests → build |
| **e2e-gate** | Merge to main | Playwright critical paths |
| **chaos-test** | Weekly + manual | AI fallback mock → verify chain + audit |

#### AI Pipeline Testing
- **Real integration test MANDATORY** — call real AI API + verify findings inserted (Guardrail #14)
- Mock-only tests don't catch format mismatch between AI response and Zod schema
- `findingCount > 0` not just "pipeline completed"
- Test both Economy (L1+L2) and Thorough (L1+L2+L3) modes

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
- NEVER create barrel `index.ts` in feature folders — breaks tree-shaking, causes circular deps
- Import directly: `import { FindingCard } from '@/features/review/components/FindingCard'`
- **Exceptions** (architecture-defined):
  - `src/db/schema/index.ts` — re-export all schemas
  - `src/features/pipeline/inngest/index.ts` — function registry

#### File Size Guidelines
- Component files: **~250 lines max** — extract sub-components if longer
- Utility/logic files: **~200 lines max** — split by concern if longer

#### Data Format Conventions

| Format | Convention |
|--------|-----------|
| Date/Time in DB | `timestamptz` (UTC) |
| Date/Time in JSON | ISO 8601 `"2026-02-14T10:30:00.000Z"` |
| Date/Time in UI | `Intl.DateTimeFormat` per user locale |
| JSON fields | camelCase |
| DB columns | snake_case |

Drizzle handles camelCase ↔ snake_case mapping automatically.

#### ESLint Configuration
- **Flat config** (`eslint.config.mjs`) — ESLint 9 syntax. Do NOT create `.eslintrc.json` or `.eslintrc.js` — they will be ignored
- Key enforced rules: no default exports, no `console.log`, no `any`, no `process.env`, no `enum`, no snapshot tests, no inline `createClient()`
- Prettier for formatting consistency

#### Tailwind CSS Rules
- Use CSS custom properties from `src/styles/tokens.css` — NEVER inline Tailwind colors
- Use Tailwind default breakpoints ONLY — no arbitrary `min-[1100px]:` values
- Desktop-first responsive approach
- Use `bg-primary` NOT `bg-indigo-600` — enables future dark mode + theming

#### Icon Library
- **Lucide React** (ships with shadcn/ui) — SOLE icon library
- NEVER use heroicons, font-awesome, or inline SVG

#### Comment Policy
- No JSDoc on every function — ONLY on public API functions exported from `src/lib/`
- Comment **"why" not "what"** — if code is self-explanatory, no comment needed
- MUST comment: complex business rules, workarounds, magic numbers, non-obvious decisions

#### TODO Convention
- Format: `// TODO(TD-XXX): description`
- NEVER leave orphan TODOs without TD tracker entry
- Quick fix < 2 hours → fix immediately, don't defer
- Deferred → must specify Story ID or Epic+scope. Log in `_bmad-output/implementation-artifacts/tech-debt-tracker.md` (Guardrail #27)

### Development Workflow Rules

#### Story Implementation Discipline
- Agent MUST **read story details + acceptance criteria before coding**
- NEVER implement features NOT in the current story — no scope creep
- Every subtask must have tests before marking complete
- Story done = **100% AC covered + all tests pass + code matches project context**
- Run `npm run test:unit` + `npm run lint` + `npm run type-check` and verify GREEN before claiming done (Guardrail #35)

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

#### Local Development Setup
```bash
npm install
npx supabase start                    # Start local Supabase (requires Docker)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx drizzle-kit migrate
npx supabase db push --local           # Supabase migrations (RLS, indexes)
npm run dev
```
**Order matters:** Drizzle creates tables → Supabase migrations add RLS policies. Reversing causes `relation does not exist` errors.

#### Hot Reload Caveats
- `.env.local` changes → MUST restart dev server
- Drizzle schema changes → MUST run `npm run db:generate` + `npm run db:migrate`

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
- RLS policy changes: atomic DROP + CREATE in same transaction (Guardrail #63)

#### Audit Trail Discipline
- EVERY state-changing Server Action MUST write to audit log
- If audit write fails → entire action MUST fail (throw)
  - **Exception:** Pipeline step audit is non-fatal: `try { writeAuditLog() } catch { logger.error() }` (Guardrail #2)
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
| 16 | `generateObject()` / `streamObject()` | `generateText` + `Output.object()` (AI SDK 6.0) |
| 17 | `.optional()` / `.nullish()` in AI Zod schemas | `.nullable()` only (OpenAI rejects) |
| 18 | AI calls without cost logging | `logAIUsage()` after every AI call |
| 19 | AI calls without budget check | `checkTenantBudget()` before every AI call |
| 20 | `setState` inside `useEffect` | Render-time adjustment pattern |

#### Multi-Tenancy Rules (CRITICAL)
- `tenant_id` column on EVERY table (except `taxonomy_definitions`, `severity_configs` uses nullable)
- EVERY query MUST use `withTenant(table.tenantId, tenantId)` helper — branded `TenantId` type enforced
- RLS enforced on critical tables from Day 1
- Cross-tenant data leak = highest severity security bug
- `service_role` key ONLY for: Inngest functions, seed scripts, admin operations

#### CJK/Thai Language Edge Cases
- **NFKC normalization** before text comparison (glossary matching, dedup) — NOT before `Intl.Segmenter` word counting (Thai sara am U+0E33 decomposes under NFKC, breaking ICU tokenization)
- **Glossary matching:** substring search (indexOf) primary + Intl.Segmenter boundary validation secondary
- **Word counting:** use `Intl.Segmenter` with `isWordLike` filter — NOT space-splitting
- **Text size guard:** chunk at 30,000 chars to prevent stack overflow
- **Markup stripping:** remove inline tags BEFORE segmentation, maintain offset map
- **Node.js requirement:** 18+ with full ICU — small-icu WILL SEGFAULT

#### Thai Back-Translation Rules (Epic 5)
- Thai tone markers change word meaning (`ใกล้` near vs `ไกล` far) — require `noteType: 'tone_marker'` annotation (Guardrail #68)
- Thai compound words (`โรงพยาบาล` = hospital) MUST be translated as single concepts, not morphemes
- Thai politeness particles (`ครับ`/`ค่ะ`) indicate register — annotate as `noteType: 'politeness_particle'`, NOT translation errors
- CJK: use `getBTLanguageInstructions(targetLang)` — augments `getLanguageInstructions()` (Guardrail #69)

#### Cross-Role Access (Epic 5)
- Non-native auto-tag: write-once (`non_native: true`) — NEVER clear, add `native_verified: true` alongside (Guardrail #66)
- Flag-for-native: atomic 3-table write — `db.transaction()` for finding status + assignment + review action + notification (Guardrail #67)
- Comment ownership: validate `finding_assignment_id` belongs to current user or original flagger or admin (Guardrail #73)

#### Score Calculation Atomicity
- Score recalculation via Inngest serial queue: `concurrency: { key: projectId, limit: 1 }`
- Client-side debounce 500ms on finding changes
- Approve button DISABLED during recalculation ("Recalculating..." badge)
- Server-side check: `scores.status === 'calculated'` before allowing approval

#### Immutable Audit Log (Defense-in-Depth)
- Layer 1: Application code — only INSERT, never UPDATE/DELETE
- Layer 2: RLS policy — INSERT only (blocks app-level DELETE/UPDATE)
- Layer 3: DB trigger — RAISE EXCEPTION on DELETE/UPDATE (blocks admin-level)
- Audit entries are NEVER deleted — GDPR deletion anonymizes (`[REDACTED]`) instead
- `finding_assignments` state changes MUST write to audit log (Guardrail #78)

#### AI Pipeline Safety
- Version pinning: pinned model first → fallback with audit flag
- Every AI call MUST log: provider, model, tokens_in, tokens_out, estimated_cost_usd, duration_ms
- Fallback triggers audit entry — admin notified when pinned version unavailable
- Economy mode = L1+L2 only; Thorough mode = L1+L2+L3
- BT prompt: "translate what IS written, not what SHOULD be" — preserve errors in back-translation (Guardrail #55)

---

## Usage Guidelines

**For AI Agents:**
- Read this file BEFORE implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Cross-reference with `CLAUDE.md` for full guardrails (#1-35 + Epic 5 #51-78)

**Source Documents:**
- Architecture: `_bmad-output/planning-artifacts/architecture/index.md`
- PRD: `_bmad-output/planning-artifacts/prd.md`
- UX Spec: `_bmad-output/planning-artifacts/ux-design-specification/index.md`
- Epics: `_bmad-output/planning-artifacts/epics/index.md`

Last Updated: 2026-03-30
