# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**qa-localization-tool** is an AI-powered localization QA web application that combines deterministic rule-based checks (Xbench parity) with AI semantic analysis. The core value is **Single-Pass Completion** — enabling QA reviewers to approve files without a proofreader loop.

**Status:** Epic 1–4 done. Epic 5 (Language Intelligence & Non-Native Support) in-progress. Planning artifacts in `_bmad-output/planning-artifacts/`.

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
npm run test:ai          # AI integration tests (requires API keys)
npm run test:parity      # Xbench parity golden corpus tests
npm run db:generate      # Drizzle Kit generate migration
npm run db:migrate       # Drizzle Kit apply migrations
npm run db:studio        # Drizzle Kit studio

# Single test file
npx vitest run src/features/scoring/mqmCalculator.test.ts

# Watch mode
npx vitest --project unit
```

**Local dev setup:**

```bash
npm install
npx supabase start                    # Start local Supabase (requires Docker)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx drizzle-kit migrate  # All migrations (tables + RLS + storage policies)
npm run dev
```

**All migrations via Drizzle:** Tables, RLS policies, storage policies, indexes — all in `src/db/migrations/`. Use `npm run db:migrate` (cloud) or `DATABASE_URL=... npx drizzle-kit migrate` (local). Do NOT use `npx supabase db push` — pooler user lacks owner permissions on system tables like `storage.objects`.

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
│   ├── admin/              # Tenant admin, user management
│   ├── batch/              # Batch processing operations
│   ├── parser/             # FR1-FR9: SDLXLIFF/XLIFF/Excel parsing
│   ├── pipeline/           # FR10-FR22: Inngest orchestration + 3 layers
│   │   ├── prompts/        # L2/L3 prompt builders + evaluation framework
│   │   └── helpers/        # runL2ForFile, runL3ForFile, chunkSegments
│   ├── project/            # Project CRUD, settings, file management
│   ├── scoring/            # FR23-FR30: MQM calculator, score lifecycle
│   ├── review/             # FR31-FR40: Review panel, finding actions, keyboard nav
│   ├── glossary/           # FR41-FR45: Multi-token matching, import/export
│   ├── taxonomy/           # Dual taxonomy config (MQM + Custom)
│   ├── upload/             # File upload UI + storage integration
│   ├── parity/             # Xbench parity verification tools
│   ├── onboarding/         # Project-level onboarding tour (driver.js)
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

Each feature module contains: `components/`, `actions/` (Server Actions), `hooks/`, `stores/`, `validation/`, and optionally `utils/`, `helpers/`, `types.ts`.

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
- `generateObject()`, `streamObject()` (deprecated in AI SDK 6.0 — use `generateText` + `Output.object()`)
- `.optional()` / `.nullish()` in AI output Zod schemas (OpenAI rejects — use `.nullable()` only)
- AI calls without cost logging, AI calls without budget check, inline `openai()`/`anthropic()` constructor
- Bare `result.output` access without try/catch — throwing getter, crashes on `finishReason !== "stop"` (proven bug: BT test failure 2026-03-30)
- `setState` inside `useEffect` (React Compiler error — use render-time adjustment pattern: `const [prev, setPrev] = useState(prop); if (prev !== prop) { setPrev(prop); setState(newVal) }`)

## Guardrails

### Data & Queries

1. **`withTenant()` on EVERY query** — SELECT/UPDATE/DELETE WHERE must include `withTenant(table.tenantId, tenantId)`. Exception: INSERT (set tenantId in values), `severity_configs` (nullable tenant_id uses `or(eq, isNull)`)
2. **Audit log non-fatal** — happy-path: let it throw (caller catches). Error/rollback path: wrap in `try { writeAuditLog(...) } catch { logger.error(...) }` — never let audit failure mask the real error
3. **Guard `rows[0]!`** — after `.returning()` or `SELECT`, always `if (rows.length === 0) throw` before accessing `rows[0]!`
4. **`inArray(col, [])` = invalid SQL** — always `if (ids.length === 0) return` before `inArray()`
5. **DELETE + INSERT = `db.transaction()`** — idempotent re-runs (re-parse, re-score) must be atomic
6. **Optional filter: use `null`, not `''`** — `optionalId ?? ''` silently matches nothing. Use ternary: `fileId ? eq(col, fileId) : undefined`
7. **Asymmetric query filters** — when one query gets `eq(projectId)`, audit ALL sibling queries in same function for consistency
8. **DB constraint added → audit all INSERT/UPDATE paths** — when adding UNIQUE/CHECK/FK, audit every `db.insert()` and `db.update()` that touches that table. Add conflict handling. Also verify idempotent re-run paths (DELETE + INSERT in transaction per #5)

### AI Pipeline

9. **Inngest function requirements** — config MUST have `retries` + `onFailure`. `Object.assign` MUST expose `handler` + `onFailure` for tests. Register in `route.ts` functions array
10. **AI structured output** — use `generateText({ output: Output.object({ schema }), ... })`. Access `result.output` via **try/catch only** — it is a throwing getter that raises `NoObjectGeneratedError` when `finishReason !== "stop"` (NOT return `undefined`). Use `maxOutputTokens` (not `maxTokens`). Zod schemas: `.nullable()` only (no `.optional()`, `.nullish()`). For streaming: `streamText` + `Output.object()`. Import `Output` from `'ai'`. **FORBIDDEN:** `if (!result.output)`, `result.output?.field`, `expect(result.output).toBeDefined()` — all throw before the guard/assertion evaluates
11. **AI error handling in Inngest** — `RateLimitError` (429) = retriable. `NoObjectGeneratedError` / auth 401 / content filter = `throw new NonRetriableError(...)`. Always log `{ finishReason, usage, model, cause }`
12. **AI cost + budget** — every `generateText`/`streamText` MUST log `result.usage` via `logAIUsage()` from `@/lib/ai/costs`. Check `checkTenantBudget(tenantId)` BEFORE making AI calls. Use shared `customProvider` from `@/lib/ai/client.ts` — never inline `openai()`/`anthropic()`
13. **AI chunks in Inngest** — chunk at 30K chars. One `step.run()` per chunk with deterministic ID: `l2-chunk-${fileId}-${i}`. Failed chunk logs + continues. Return `{ findingCount, chunksProcessed, partialFailure }`
14. **Pipeline fail loud** — if `findingCount === 0` from non-trivial input (segments > 10) → raise error, not silent log. Integration tests MUST assert `findingCount > 0`

### UI & Accessibility

15. **Severity display: icon shape + text + color** — Critical=XCircle, Major=AlertTriangle, Minor=Info, Enhancement=Lightbulb. Color never sole info carrier. Test: grayscale screenshot must be readable (SC 1.4.1)
16. **Contrast + focus indicators** — 4.5:1 normal text, 3:1 large text + non-text UI (SC 1.4.3, 1.4.11). Focus ring: `outline: 2px solid var(--color-primary)`, `outline-offset: 4px`. NEVER `outline: none` without alternative (SC 2.4.7)
17. **Keyboard shortcuts** — single-key hotkeys (A/R/F/N/S/+/-/J/K/C/O) active ONLY in review area. Suppress in `<input>`, `<textarea>`, `<select>`, `[contenteditable]`, modals (SC 2.1.4). No browser shortcut override (Ctrl+S/P/W/N/T/F5). Grid navigation: roving tabindex (`tabindex="0"` on focused row, `-1` on others)
18. **Modal + escape** — modal: trap focus + restore on close (`aria-modal="true"` + `inert`). Escape: innermost layer first, one layer per press, `event.stopPropagation()`. Auto-advance: `requestAnimationFrame` delay, never sync focus in handler
19. **ARIA + lang** — landmarks: `<nav>` file nav, `<main>` finding list, `role="complementary"` detail panel. `aria-live="polite"` default, `"assertive"` only errors. `lang="{languageCode}"` on every source/target text element. CJK containers: 1.1x font scale
20. **Motion + focus** — `prefers-reduced-motion: reduce` on ALL animations. No focus stealing on mount — auto-expand is visual only. `useEffect` + `.focus()` FORBIDDEN except modal open + auto-advance
21. **Dialog state reset** — custom dialogs must reset form state on re-open: `useEffect(() => { if (open) resetForm() }, [open])`. `useRef` not reset on prop change — reset ref in `useEffect` watching that prop

### React & TypeScript

22. **No bare `string` for status/severity** — always use union type or import from `@/types/`
23. **`void asyncFn()` swallows errors** — use `.catch(() => {})` for non-critical, or `await` with try-catch
24. **Zod array uniqueness** — `z.array(z.string().uuid())` does NOT deduplicate. Add `.refine(ids => new Set(ids).size === ids.length, 'Duplicate IDs')`
25. **Undo stack** — Zustand, per-tab, max 20, clear on file switch. Bulk = 1 entry. Server Action verifies `previous_state` match before revert — mismatch = conflict dialog
26. **ExcelJS type mismatch** — use `// @ts-expect-error ExcelJS Buffer type conflict`

### Workflow & Process

27. **Tech Debt: quick fix ห้าม DEFER** — TD < 2 ชม. แก้ทันที. ถ้าต้องรอ feature → DEFER ได้ แต่ต้องระบุ Story ID หรือ Epic+scope ชัดเจน. Log ใน `_bmad-output/implementation-artifacts/tech-debt-tracker.md` ทันที. TODO/FIXME format: `// TODO(TD-XXX): description`
28. **`--no-verify` FORBIDDEN** — ถ้า pre-commit hook fail → แก้ root cause ก่อน commit
29. **E2E must PASS before story done** — ถ้า story มี E2E spec ต้อง run จริง + GREEN. `test.skip()` unskipped ≠ tested. ห้าม bypass UI flow (PostgREST seed, skip dialog) โดยไม่มี TD entry
30. **Cross-file data flow review** — เมื่อไฟล์ A สร้าง state ที่ไฟล์ B ใช้ → verify: (a) contract match, (b) lifecycle completeness, (c) staleness, (d) timing/race. Run `feature-dev:code-reviewer` cross-file review ทุก epic
31. **Test fail + 2 fix attempts → call debug-explorer** — ห้ามเดา fix #3 โดยไม่มี agent analysis
32. **Re-read AC before implement** — agent/CR fix อาจ widen scope เกิน AC. ถ้า suggestion ขัด AC → ทำตาม AC
33. **Story complexity gate** — ถ้า AC coordinate กับ >3 ACs อื่น → split story ก่อน lock
34. **Verification story mandatory** — ทุก epic จบด้วย verification story (real AI, real DB, real E2E, no mock)
35. **Run tests ก่อน claim done** — `npm run test:unit` + `npm run lint` + `npm run type-check` ต้อง GREEN ด้วยตา. "น่าจะผ่าน" ≠ "ผ่านจริง"

### Epic 5 Guardrails (#51-78) — Sharded

**Full details in `CLAUDE-guardrails-epic5.md`** (28 guardrails). Summary by category:

- **#51-56** Back-Translation: distinct model alias, BT cost layer, 300ms debounce + AbortController, Zod `.nullable()` only, "translate what IS written" prompt, budget-gated fallback
- **#57-61** Per-Segment Caching: `targetTextHash` in cache key, `withTenant()`, `onConflictDoUpdate`, CASCADE invalidation (exception: glossary), dual TTL (query filter + cron)
- **#62-65** RLS Scoped Access: `EXISTS` subquery pattern, atomic DROP+CREATE migration, app-level + RLS double defense, composite index on `finding_assignments`
- **#66-67** Cross-Role: non-native tag write-once (never clear), flag-for-native atomic 3-table transaction
- **#68-70** Thai/CJK BT Quality: Thai tone/compound/particle handling, CJK `getBTLanguageInstructions()`, `lang` attribute on BT text
- **#71-78** General Epic 5: RLS from migration day 1, `AssignmentStatus` union type, comment ownership validation, non-blocking notifications, BT abort on segment change, RLS test mandatory, cached indicator, assignment audit log

### Epic 6 Guardrails (#79-94) — Sharded

**Full details in `CLAUDE-guardrails-epic6.md`** (16 guardrails). Summary by category:

- **#79-84** File Assignment: union type status/priority, soft lock via DB heartbeat (not Presence), optimistic locking on takeover, one active assignment per file, workload LEFT JOIN pattern, Inngest priority config
- **#85-90** Notifications: centralize INSERT helper, server-side grouping (not INSERT-time), schema add project_id+archived_at, Inngest cron archive, RLS policy required, toast coalescing for batch
- **#91-92** Responsive: use `useViewportTransition` hook, responsive E2E test-first
- **#93-94** General Epic 6: `result.output` try/catch only (throwing getter), metadata merge never replace

### UX/UI Compliance Guardrails (#95-97)

35. **#95: ทุก UI component ต้องเช็คกับ UX spec ก่อน mark story done** — ไม่ใช่แค่ functional pass แต่ต้อง visual + state ตรง UX design spec ด้วย ถ้า UX spec กำหนด state (loading, error, empty, success, partial) ต้อง implement ครบ ไม่ข้าม UX spec อยู่ที่ `_bmad-output/planning-artifacts/ux-design-specification/`
36. **#96: UX States Checklist mandatory ใน story** — ทุก story ที่สร้าง/แก้ UI ต้องมี section "UX States" ใน AC ระบุ: loading state, error state, empty state, success state, partial state — ต้อง address ทุก state ที่ relevant ก่อน done
37. **#97: UX audit per epic** — จบทุก epic ต้องทำ Playwright browser audit ทุกหน้า ทุก role เทียบ UX spec ก่อน sign-off ห้ามข้ามไม่งั้นจะสะสม gap เหมือน 71 gaps ที่พบใน session 2026-04-03

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
- **E2E strategy:** Full (ทุก scenario) for critical flows + Smoke (1 happy path) for other UI pages
- **Test data** via factory functions in `src/test/factories.ts` — never hardcode
- **Naming:** `describe("{Unit}")` → `it("should {behavior} when {condition}")`
- **CI gates:** quality-gate (every PR), e2e-gate (merge to main), chaos-test (weekly)
- **Boundary value tests:** Every AC with numeric thresholds MUST have explicit boundary tests (at, below, above, zero)
- **CR round target: ≤2 per story.** If R3+ needed → review root cause
- **E2E per story:** ถ้า story สร้างหรือแก้ UI page → ต้องมี E2E test. ห้าม `test.skip()` หรือ bypass UI flow ค้างโดยไม่มี TD entry
- **AI pipeline: real integration test MANDATORY** — call real AI API + verify findings inserted. Mock-only tests don't catch format mismatch. `findingCount > 0` not just "pipeline completed"
- **Orphan component scan** every 5 stories + epic sign-off

## Pre-Story Checklist

**Run BEFORE locking Acceptance Criteria on any story:**
→ `_bmad-output/architecture-assumption-checklist.md` (9 sections, 25 checkboxes)

## Key Planning Documents

| Document                      | Path                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| PRD (80 FRs + 42 NFRs)        | `_bmad-output/planning-artifacts/prd.md`                                              |
| Architecture                  | `_bmad-output/planning-artifacts/architecture/index.md`                               |
| UX Specification              | `_bmad-output/planning-artifacts/ux-design-specification/index.md`                    |
| Epics (11 epics, 99 FRs)      | `_bmad-output/planning-artifacts/epics/index.md`                                      |
| Project Context (agent rules) | `_bmad-output/project-context.md`                                                     |
| Original Product Plan         | `docs/qa-localization-tool-plan.md`                                                   |
| AI SDK Spike Guide            | `_bmad-output/planning-artifacts/research/ai-sdk-spike-guide-2026-02-26.md`           |
| Inngest L2/L3 Template Guide  | `_bmad-output/planning-artifacts/research/inngest-l2-l3-template-guide-2026-02-26.md` |
| Keyboard/Focus Spike          | `_bmad-output/planning-artifacts/research/keyboard-focus-spike-2026-03-08.md`         |
| WCAG Guardrails Research      | `_bmad-output/planning-artifacts/research/epic-4-proactive-guardrails-2026-03-08.md`  |
| Realtime Subscription Guide   | `_bmad-output/realtime-subscription-gotchas.md`                                       |
| Accessibility Baseline Audit  | `_bmad-output/accessibility-baseline-2026-03-08.md`                                   |

## Runtime Compatibility

| Runtime                                       | OK to import                          | DO NOT import                                       |
| --------------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Edge (middleware.ts)                          | `@upstash/ratelimit`, `@supabase/ssr` | `pino`, `drizzle-orm`, `fast-xml-parser`, `inngest` |
| Node.js (Server Components, Actions, Inngest) | Everything server-side                | —                                                   |
| Browser (Client Components)                   | `zustand`, `sonner`, `@supabase/ssr`  | `pino`, `drizzle-orm`, server-only modules          |

## Framework Docs Rule

Before writing code that uses **Inngest**, **Drizzle ORM**, **Supabase**, or **Vercel AI SDK** APIs — fetch latest docs via Context7 MCP first. Do NOT rely on training data for SDK method signatures.

## CJK/Thai Language Rules

- NFKC normalization before **text comparison** (glossary matching, finding deduplication) — NOT before `Intl.Segmenter` word counting (Thai sara am U+0E33 decomposes under NFKC, breaking ICU tokenization)
- Word counting via `Intl.Segmenter` with `isWordLike` — never space-split
- Text chunking at 30,000 chars to prevent stack overflow
- Strip inline markup before segmentation, maintain offset map
- Glossary: substring match primary + Intl.Segmenter boundary validation secondary
