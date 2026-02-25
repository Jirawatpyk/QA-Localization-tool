# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**qa-localization-tool** is an AI-powered localization QA web application that combines deterministic rule-based checks (Xbench parity) with AI semantic analysis. The core value is **Single-Pass Completion** — enabling QA reviewers to approve files without a proofreader loop.

**Status:** Epic 1 (Foundation) done, Epic 2 (File Processing & QA Engine) in-progress. Planning artifacts in `_bmad-output/planning-artifacts/`.

**Target Users:** QA Reviewers (native + non-native language support), Project Managers.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack, React Compiler) + React 19
- **UI:** shadcn/ui + Tailwind CSS v4 (design tokens via `@theme` in `src/styles/tokens.css`)
- **Backend:** Supabase (Auth + PostgreSQL + Storage + Realtime) + Drizzle ORM
- **Queue:** Inngest (durable functions for 3-layer pipeline)
- **AI:** Vercel AI SDK (multi-provider: OpenAI gpt-4o-mini for L2, Anthropic claude-sonnet-4-5-20250929 for L3)
- **State:** Zustand (domain-split stores, 1 per feature)
- **Testing:** Vitest (workspace: unit/jsdom + rls/node) + Playwright (E2E)
- **Package Manager:** npm (NOT pnpm, NOT bun)
- **Node.js:** 18+ with full ICU required (small-icu will SEGFAULT on Intl.Segmenter)

## Commands

```bash
npm run dev              # Start dev server (Turbopack)
npm run build            # Production build
npm run lint             # ESLint
npm run type-check       # tsc --noEmit
npm run test:unit        # Vitest unit tests (jsdom)
npm run test:rls         # Vitest RLS tests (requires `npx supabase start`)
npm run test:e2e         # Playwright E2E tests
npm run test             # All Vitest tests
npm run db:generate      # Drizzle Kit generate migration
npm run db:migrate       # Drizzle Kit apply migrations
npm run db:studio        # Drizzle Kit studio

# Single test file
npx vitest run src/features/scoring/mqmCalculator.test.ts

# Watch mode
npx vitest --project unit
```

**Local dev setup:** `npm install` → `npx supabase start` → `npm run db:migrate` → `npm run dev`

## Architecture

### 3-Layer QA Pipeline

```
Upload → Parser (SDLXLIFF/XLIFF/Excel) → Segments (DB)
  → Inngest Orchestrator (Economy: L1+L2 / Thorough: L1+L2+L3)
    → L1: Rule Engine (deterministic, 100% Xbench parity)
    → L2: AI Screening (gpt-4o-mini, fast triage)
    → L3: Deep AI Analysis (claude-sonnet, detailed review)
  → Findings (DB) → MQM Score Aggregation
  → Supabase Realtime → Zustand → UI
```

### Project Structure (feature-based co-location)

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Public routes (login, signup)
│   ├── (app)/              # Protected routes (sidebar + header shell)
│   │   ├── projects/[projectId]/review/[sessionId]/
│   │   ├── dashboard/
│   │   └── admin/
│   └── api/                # Route Handlers (inngest, health, webhooks)
├── features/               # Feature modules (core of the app)
│   ├── parser/             # FR1-FR9: SDLXLIFF/XLIFF/Excel parsing
│   ├── pipeline/           # FR10-FR22: Inngest orchestration + 3 layers
│   ├── scoring/            # FR23-FR30: MQM calculator, score lifecycle
│   ├── review/             # FR31-FR40: Review panel, finding actions, keyboard nav
│   ├── glossary/           # FR41-FR45: Multi-token matching, import/export
│   ├── taxonomy/           # Dual taxonomy config (MQM + Custom)
│   ├── dashboard/          # Reporting, export, trend graphs
│   └── audit/              # Immutable audit trail (defense-in-depth)
├── components/ui/          # shadcn/ui base + shared custom components
├── lib/                    # Shared utilities
│   ├── supabase/           # 3 client factories: server.ts, client.ts, admin.ts
│   ├── ai/                 # Multi-provider config, fallback chain, cost tracker
│   ├── auth/               # requireRole (M3 pattern), getCurrentUser
│   ├── cache/              # "use cache" isolation (glossary, taxonomy)
│   ├── language/           # Intl.Segmenter + language-specific rules (Thai/CJK)
│   └── env.ts              # Zod-validated env (fail-fast at startup)
├── db/                     # Drizzle schema + migrations
│   ├── schema/             # One file per table (tenants, projects, findings, etc.)
│   └── helpers/withTenant.ts  # Tenant filter helper (EVERY query must use)
├── stores/                 # Global Zustand stores (ui, keyboard)
└── test/                   # Factories, drizzleMock, fixtures
```

Each feature module contains: `components/`, `actions/` (Server Actions), `hooks/`, `stores/`, `validation/`.

### Key Architectural Patterns

- **Server Actions** for UI mutations (return `ActionResult<T>`), **Route Handlers** for webhooks/inngest/uploads
- **RSC boundary:** NEVER put `"use client"` on page.tsx — use feature boundary (Server page → Client entry component)
- **Data access:** Drizzle ORM ONLY for DB queries; Supabase client for Auth, Storage, Realtime only
- **RBAC M3 pattern:** JWT claims for reads (fast), DB query for writes (secure)
- **Multi-tenancy:** `tenant_id` on every table, `withTenant()` helper on every query, RLS from Day 1
- **Audit:** Every state-changing action MUST write to immutable audit log (3-layer defense)
- **Score atomicity:** Inngest serial queue with `concurrency: { key: projectId, limit: 1 }`
- **Env access:** Always via `@/lib/env` — never `process.env` directly
- **Imports:** Named exports only (except Next.js pages), `@/` alias always, no barrel exports in features

### Anti-Patterns (Forbidden)

- `export default`, `any` type, raw SQL in app code, `console.log`, TypeScript `enum`
- `service_role` key in client code, hardcoded `tenant_id`, inline Supabase client creation
- try-catch inside Inngest `step.run()`, arbitrary Tailwind breakpoints, snapshot tests
- `process.env` direct access, inline Tailwind colors (use tokens.css), `"use client"` on pages

### Coding Guardrails (CR Lessons — check BEFORE writing every file)

1. **withTenant() on EVERY query** — SELECT/UPDATE/DELETE WHERE must include `withTenant(table.tenantId, tenantId)`. Exception: INSERT (set tenantId in values), `severity_configs` (nullable tenant_id uses `or(eq, isNull)`)
2. **Audit log non-fatal** — happy-path: let it throw (caller catches). Error/rollback path: wrap in `try { writeAuditLog(...) } catch { logger.error(...) }` — never let audit failure mask the real error
3. **No bare `string` for status/severity** — always use union type (`type FileStatus = 'pending' | 'parsing' | ...`) or import from `@/types/`
4. **Guard `rows[0]!`** — after `.returning()` or `SELECT`, always `if (rows.length === 0) throw` before accessing `rows[0]!`
5. **`inArray(col, [])` = invalid SQL** — always `if (ids.length === 0) return` before `inArray()`
6. **DELETE + INSERT = `db.transaction()`** — idempotent re-runs (re-parse, re-score) must be atomic
7. **Zod array uniqueness** — `z.array(z.string().uuid())` does NOT deduplicate. Add `.refine(ids => new Set(ids).size === ids.length, 'Duplicate IDs')`
8. **Optional filter: use `null`, not `''`** — `optionalId ?? ''` silently matches nothing. Use ternary: `fileId ? eq(col, fileId) : undefined`
9. **No `[...set].some()` in hot loops** — cache `const arr = [...set]` once outside the loop, or use `for...of` on Set directly
10. **Inngest function requirements** — config MUST have `retries` + `onFailure`. `Object.assign` MUST expose `handler` + `onFailure` for tests. Register in `route.ts` functions array
11. **Dialog state reset** — custom dialogs must reset form state on re-open: `useEffect(() => { if (open) resetForm() }, [open])`
12. **`useRef` not reset on prop change** — refs persist across re-renders. If behavior depends on props, reset ref in `useEffect` watching that prop
13. **`void asyncFn()` swallows errors** — use `.catch(() => { /* non-critical */ })` or `await` with try-catch
14. **Asymmetric query filters** — when one query gets `eq(projectId)`, audit ALL sibling queries in same function for consistency (defense-in-depth)
15. **ExcelJS type mismatch** — use `// @ts-expect-error ExcelJS Buffer type conflict` (not `as never`, `as any`, or `as Buffer`)

## Naming Conventions

| Element              | Convention                      | Example                          |
| -------------------- | ------------------------------- | -------------------------------- |
| DB tables/columns    | snake_case                      | `audit_logs`, `tenant_id`        |
| Components           | PascalCase                      | `FindingCard.tsx`                |
| Server Actions       | `{verb}.action.ts`              | `updateFinding.action.ts`        |
| Stores               | `{domain}.store.ts`             | `review.store.ts`                |
| Inngest events       | dot-notation                    | `finding.changed`                |
| Inngest function IDs | kebab-case                      | `recalculate-score`              |
| Types                | PascalCase, no `I` prefix       | `Finding`, `ReviewSession`       |
| Constants            | UPPER_SNAKE_CASE                | `MAX_FILE_SIZE_BYTES`            |
| Zod schemas          | camelCase + Schema              | `findingSchema`                  |
| Git branches         | `feature/{epic}-{story}-{desc}` | `feature/E2-S1-parser`           |
| Commits              | Conventional Commits            | `feat(review): add batch accept` |

## Testing

- **Unit tests** co-located next to source: `mqmCalculator.test.ts`
- **RLS tests** in `src/db/__tests__/rls/`: cross-tenant isolation tests (require Supabase CLI)
- **E2E** in `e2e/`: 4 critical paths only (upload→segments, pipeline→findings, review→score, auth→tenant)
- **Test data** via factory functions in `src/test/factories.ts` — never hardcode
- **Naming:** `describe("{Unit}")` → `it("should {behavior} when {condition}")`
- **CI gates:** quality-gate (every PR: lint→type-check→tests→build), e2e-gate (merge to main), chaos-test (weekly)

## Pre-Story Checklist (MANDATORY — SM + Dev Lead)

**Run BEFORE locking Acceptance Criteria on any story:**
→ `_bmad-output/architecture-assumption-checklist.md` (8 sections, 22 checkboxes)

This checklist was created from Epic 1 retrospective learnings. Top 5 red flags:

| Red Flag                                                         | Section       |
| ---------------------------------------------------------------- | ------------- |
| Story references a `/route` that doesn't exist in `src/app/`     | S1: Routes    |
| Story writes to DB but no migration task                         | S2: DB Schema |
| Story uses Radix Select in E2E test (not native `<select>`)      | S3 + S5       |
| Story assumes columns exist that haven't been added yet          | S2: DB Schema |
| Story scope bleeds into future stories without explicit deferral | S8: Scope     |

## Key Planning Documents

| Document                      | Path                                                               |
| ----------------------------- | ------------------------------------------------------------------ |
| PRD (80 FRs + 42 NFRs)        | `_bmad-output/planning-artifacts/prd.md`                           |
| Architecture                  | `_bmad-output/planning-artifacts/architecture/index.md`            |
| UX Specification              | `_bmad-output/planning-artifacts/ux-design-specification/index.md` |
| Epics (11 epics, 99 FRs)      | `_bmad-output/planning-artifacts/epics/index.md`                   |
| Project Context (agent rules) | `_bmad-output/project-context.md`                                  |
| Original Product Plan         | `docs/qa-localization-tool-plan.md`                                |

## Runtime Compatibility

| Runtime                                       | OK to import                          | DO NOT import                                       |
| --------------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Edge (middleware.ts)                          | `@upstash/ratelimit`, `@supabase/ssr` | `pino`, `drizzle-orm`, `fast-xml-parser`, `inngest` |
| Node.js (Server Components, Actions, Inngest) | Everything server-side                | —                                                   |
| Browser (Client Components)                   | `zustand`, `sonner`, `@supabase/ssr`  | `pino`, `drizzle-orm`, server-only modules          |

## Framework Docs Rule

Before writing code that uses **Inngest**, **Drizzle ORM**, or **Supabase** APIs — fetch latest docs via Context7 MCP first. Do NOT rely on training data for SDK method signatures, especially:

- Inngest: `step.sendEvent()`, `step.run()`, `onFailure` type, `concurrency` config
- Drizzle: `transaction()`, `returning()`, `inArray()`, JOIN syntax
- Supabase: Realtime channel filters, Storage API, Auth helpers

## CJK/Thai Language Rules

- NFKC normalization before **text comparison** (glossary matching, finding deduplication) — NOT before `Intl.Segmenter` word counting (Thai sara am U+0E33 decomposes under NFKC, breaking ICU tokenization)
- Word counting via `Intl.Segmenter` with `isWordLike` — never space-split
- Text chunking at 30,000 chars to prevent stack overflow
- Strip inline markup before segmentation, maintain offset map
- Glossary: substring match primary + Intl.Segmenter boundary validation secondary
