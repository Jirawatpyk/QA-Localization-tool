# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**qa-localization-tool** is an AI-powered localization QA web application that combines deterministic rule-based checks (Xbench parity) with AI semantic analysis. The core value is **Single-Pass Completion** — enabling QA reviewers to approve files without a proofreader loop.

**Status:** Epic 1–3 done. Epic 4 (Review & Decision Workflow) in-progress. Planning artifacts in `_bmad-output/planning-artifacts/`.

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
16. **AI structured output** — use `generateText({ output: Output.object({ schema }), ... })` from `ai` package. NEVER use deprecated `generateObject`/`streamObject`. Access parsed result via `result.output` (NOT `result.object`). Use `maxOutputTokens` (NOT `maxTokens` — renamed in v5+). For streaming: `streamText` + `Output.object()`. Import `Output` from `'ai'`
17. **AI Zod schemas: `.nullable()` only** — OpenAI rejects `.optional()` and `.nullish()` in structured output schemas (causes `NoObjectGeneratedError` with `finish_reason: 'content-filter'`). Use `.nullable()` for all optional fields. Required fields: no modifier
18. **AI error classification in Inngest** — `RateLimitError` (429) = retriable, let Inngest retry. `NoObjectGeneratedError` / auth 401 / content filter = `throw new NonRetriableError(...)`. Never retry schema or auth errors. Always log with context: `{ finishReason, usage, model, cause }`
19. **AI cost tracking mandatory** — every `generateText`/`streamText` call MUST log `result.usage` (`inputTokens`, `outputTokens`) + estimated cost via `logAIUsage()` from `@/lib/ai/costs`. Never ignore token usage. Aggregate across chunks for per-file total
20. **AI provider via `@/lib/ai`** — never inline `openai()` or `anthropic()` constructor in feature code. Use shared `customProvider` from `@/lib/ai/client.ts` with fallback chain. L2 = `gpt-4o-mini`, L3 = `claude-sonnet-4-5-20250929`. Provider-specific options go in `providerOptions: { openai: { ... } }`, not top-level
21. **AI chunks in Inngest: one `step.run()` per chunk** — chunk segments at 30K chars. Each chunk = separate deterministic step ID: `l2-chunk-${fileId}-${i}`. Failed chunk logs error + continues (don't fail entire layer). Collect partial results. Return `{ findingCount, chunksProcessed, partialFailure }`
22. **AI budget guard before layer** — check tenant AI quota BEFORE making any AI calls. If budget exhausted → `throw new NonRetriableError('AI quota exhausted')`. Log remaining quota after each call. Pattern: `checkTenantBudget(tenantId)` → `{ hasQuota, remainingTokens }`
23. **Tech Debt: quick fix ห้าม DEFER** — TD ที่เป็น quick fix (< 2 ชม.) → **แก้ทันที ห้าม DEFER** ถ้าเจอระหว่าง CR/impl ให้แก้ในรอบเดียวกัน. TD ที่ต้องรอ feature (code ที่จะใช้ยังไม่มี) → DEFER ได้ แต่ต้องระบุ **Story ID** (e.g., "Story 3.4") หรือ **Epic + scope** (e.g., "Epic 4 — review infrastructure") ชัดเจน. Vague references เช่น "Epic 3-4", "early Epic 3", "Epic 4+" = **FORBIDDEN** → CR High finding. (Epic 3 Party Mode Retro)
24. **CR fix → E2E mandatory** — CR fix ที่แก้ `"use client"` component, E2E helper (`e2e/helpers/*`), หรือ E2E spec → **ต้อง run E2E locally ก่อน push** (`npx playwright test <spec>`). Unit test จับ race condition ข้าม component+server action+RSC cache ไม่ได้ — เฉพาะ E2E ที่จะเจอ (Epic 3 CR Retro — prop sync + pollScoreLayer bugs)
25. **Color never sole information carrier** — severity/status/state MUST use icon (distinct shape per level) + text label + color. Never color alone (SC 1.4.1, NFR27). Test: grayscale screenshot must remain fully readable
26. **Contrast ratio verification** — 4.5:1 normal text, 3:1 large text (SC 1.4.3). 3:1 for non-text UI (icons, focus rings, borders) (SC 1.4.11). Use `tokens.css` colors — never hardcode hex in components. Verify tinted state backgrounds (green/red/yellow) against text color
27. **Focus indicator: 2px indigo, 4px offset** — every interactive element: `outline: 2px solid var(--color-primary)`, `outline-offset: 4px`. NEVER `outline: none` without visible alternative. Focus ring must have >= 3:1 contrast against adjacent background (SC 2.4.7, SC 1.4.11)
28. **Single-key hotkeys: scoped + suppressible** — A/R/F/N/S/+/-/J/K active ONLY when finding or review area focused. Suppress in `<input>`, `<textarea>`, `<select>`, `[contenteditable]`, modals. Must be disable/remap-able (SC 2.1.4). Check `event.target` tag before handling
29. **Grid navigation: roving tabindex** — finding list `role="grid"`: focused row `tabindex="0"`, others `tabindex="-1"`. Arrow/J/K moves tabindex. Do NOT use `aria-activedescendant` (no auto-scroll). Each row `role="row"` inside `role="rowgroup"` (APG Grid Pattern)
30. **Modal focus trap + restore** — on open: `useRef(document.activeElement)` then focus first focusable. Tab/Shift+Tab trapped. Esc closes. On close: `triggerRef.current?.focus()`. `aria-modal="true"` + background `inert` or `aria-hidden="true"` (APG Dialog Modal)
31. **Escape key hierarchy** — innermost layer closes first (dropdown > expanded card > detail panel > page). ONE layer per Esc press. `event.stopPropagation()` after handling. Never bubble through multiple layers
32. **Auto-advance to next Pending** — after action, focus next `status='Pending'` finding (skip reviewed). No Pending left → focus action bar. Use `requestAnimationFrame` delay — never sync focus in action handler (DOM may not be updated yet)
33. **aria-live: polite default, assertive only errors** — score changes, progress, filter counts = `aria-live="polite"`. Errors, conflicts, budget alerts = `aria-live="assertive"`. Live region container MUST exist in DOM before content changes (mount first, update text second)
34. **No browser shortcut override** — Ctrl+Z/Ctrl+A only when finding list focused. In text inputs → native browser behavior. Never `preventDefault()` on Ctrl+S/P/W/N/T/F5. Scope review shortcuts via `event.target` closest check
35. **Undo stack: Zustand, per-tab, max 20, clear on file switch** — bulk = 1 entry. Redo clears on new action. Server Action verifies `previous_state` match before revert — mismatch = conflict dialog. No localStorage, no server persistence
36. **Severity display: icon shape + text + color** — Critical=XCircle/octagon, Major=AlertTriangle, Minor=Info/circle, Enhancement=Lightbulb. Min 16px icon, `aria-hidden="true"` on icon (text label is accessible name). Text label always visible — never icon-only (NFR27)
37. **prefers-reduced-motion: ALL animations** — score morph, card expand, toast slide, auto-advance, new finding highlight — all must respect `prefers-reduced-motion: reduce`. Use existing `useReducedMotion()` hook for JS, `@media (prefers-reduced-motion: reduce)` for CSS. Reduced = instant, no transition
38. **ARIA landmarks on review layout** — `<nav>` for file nav, `<main>` for finding list (one per page), `role="complementary"` for detail panel. Finding list = `role="grid"` + `aria-label`. Expandable cards = `aria-expanded`. Filter bar = `role="toolbar"` + `aria-label`
39. **lang attribute on segment text** — every source/target text element MUST have `lang="{languageCode}"` from file metadata. CJK containers add 1.1x font scale. Without `lang`, Thai line-breaking and CJK font fallback break (SC 3.1.2)
40. **No focus stealing on mount** — auto-expand (Critical findings) is visual only, NOT auto-focus. Initial focus = first logical tab stop (filter bar or first finding row). `useEffect` + `.focus()` on mount FORBIDDEN except modal open (#30) and auto-advance (#32). (SC 2.4.3)
41. **DB constraint added → audit all INSERT/UPDATE paths** — when adding UNIQUE, CHECK, or FK constraint to a table, MUST audit every `db.insert()` and `db.update()` that touches that table. Add conflict handling (`onConflictDoUpdate`, try-catch for 23505, or pre-check SELECT). Also verify idempotent re-run paths (DELETE + INSERT in transaction per Guardrail #6). Constraint without code-path update = latent production bug. (Story 2.3 TA Retro — TD-DB-005 half-fix)

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
- **E2E strategy:** Full (ทุก scenario) สำหรับ critical flows + Smoke (1 happy path) สำหรับ UI page ที่เหลือ — runs on e2e-gate via GitHub Actions
  - **Full E2E (5 critical flows):** upload→parse→pipeline→findings→score, review→accept/reject→score recalculate, auth→login→tenant isolation, budget→threshold→cost control, taxonomy→mapping→reorder
  - **Smoke E2E:** ทุก UI page ที่ไม่ใช่ critical flow → 1 happy path (page โหลด → action หลัก → ผลลัพธ์ถูก)
- **E2E per story (MANDATORY):** ถ้า story สร้างหรือแก้ UI page → ต้องมี E2E test (full ถ้าอยู่ใน critical flow, smoke ถ้าไม่ใช่). ห้าม `test.skip()` หรือ bypass UI flow (seed ผ่าน PostgREST, เรียก Inngest API ตรง, skip dialog) ค้างโดยไม่มี TD entry — ถ้า defer/bypass ต้องลง `tech-debt-tracker.md` ทันทีพร้อม TD ID + story ที่จะแก้ + ใส่ `// TODO(TD-XXX): wire real UI flow` ในโค้ด. (Epic 3 Party Mode Retro)
- **Test data** via factory functions in `src/test/factories.ts` — never hardcode
- **Naming:** `describe("{Unit}")` → `it("should {behavior} when {condition}")`
- **CI gates:** quality-gate (every PR: lint→type-check→tests→build), e2e-gate (merge to main), chaos-test (weekly)
- **Boundary value tests (MANDATORY):** Every AC with numeric thresholds/limits MUST have explicit boundary tests (at, below, above, zero). ATDD step-03 enforces this. (Epic 2 Retro A2)
- **CR round target: ≤2 per story.** Epic 2 averaged 2.9. If R3+ needed → mini-retro on root cause. Pre-CR quality scan (3 agents) should prevent most findings from reaching CR. (Epic 2 Retro A3)
- **AC limit: ≤7 per story.** Story 3.4 (11 ACs, 3 CR rounds) proved large scope = more rounds. If >7 ACs → must split before locking AC. Exceeding requires explicit approval + split plan. (Epic 3 Retro A2)
- **Tech Debt tracking (MANDATORY):** ทุกครั้งที่ defer scope, ใช้ workaround, skip test, bypass flow, ทิ้ง TODO/FIXME, หรือตัดสินใจไม่ทำอะไรที่ควรทำ → ลง `_bmad-output/implementation-artifacts/tech-debt-tracker.md` **ทันที** พร้อม: TD ID, date, story ID, phase (CS/DS/CR/ATDD/impl), description, severity, status. **Quick fix (< 2 ชม.) → แก้ทันที ห้าม DEFER.** ถ้าต้องรอ feature → DEFER ได้ แต่ต้องระบุ Story ID หรือ Epic+scope ชัดเจน (Guardrail #23). ใช้ได้ทุก phase — Create Story, ATDD, implementation, Code Review, retro. **ห้ามรอ retrospective. ห้ามทิ้ง comment ลอยโดยไม่มี TD entry.** (Epic 3 Party Mode Retro)
- **TODO/FIXME format (MANDATORY):** ห้ามเขียน TODO/FIXME ลอยโดยไม่มี ref — ต้องเป็น `// TODO(TD-XXX): description` หรือ `// TODO(story-X.X): description` เสมอ. ถ้ายังไม่มี TD → สร้าง TD entry ก่อนแล้วใส่ ref. Comment ที่บอก "ยังไม่มี" / "จะทำทีหลัง" / "not yet" ก็ต้องมี ref เช่นกัน.
- **Orphan component scan (every 5 stories + epic sign-off):** Scan for components that are exported but never imported in any `src/app/` page. Orphan = integration gap. Run every 5 stories (not just epic boundary) to catch wiring gaps early and prevent sub-story proliferation. (Epic 3 Retro A3, updated from Party Mode Retro)

## Pre-Story Checklist (MANDATORY — SM + Dev Lead)

**Run BEFORE locking Acceptance Criteria on any story:**
→ `_bmad-output/architecture-assumption-checklist.md` (9 sections, 25 checkboxes)

This checklist was created from Epic 1 retrospective learnings. Top 5 red flags:

| Red Flag                                                         | Section       |
| ---------------------------------------------------------------- | ------------- |
| Story references a `/route` that doesn't exist in `src/app/`     | S1: Routes    |
| Story writes to DB but no migration task                         | S2: DB Schema |
| Story uses Radix Select in E2E test (not native `<select>`)      | S3 + S5       |
| Story assumes columns exist that haven't been added yet          | S2: DB Schema |
| Story scope bleeds into future stories without explicit deferral | S8: Scope     |
| Story creates component/dialog but no story mounts it in a page  | S9: Journey   |
| E2E test bypasses UI flow without tech debt tracker entry        | S9: Journey   |

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

Before writing code that uses **Inngest**, **Drizzle ORM**, **Supabase**, or **Vercel AI SDK** APIs — fetch latest docs via Context7 MCP first. Do NOT rely on training data for SDK method signatures, especially:

- Inngest: `step.sendEvent()`, `step.run()`, `onFailure` type, `concurrency` config
- Drizzle: `transaction()`, `returning()`, `inArray()`, JOIN syntax
- Supabase: Realtime channel filters, Storage API, Auth helpers
- Vercel AI SDK: `generateText()` + `Output.object()`, `streamText()`, `customProvider()`, error types (`RateLimitError`, `NoObjectGeneratedError`), `usage` property

## CJK/Thai Language Rules

- NFKC normalization before **text comparison** (glossary matching, finding deduplication) — NOT before `Intl.Segmenter` word counting (Thai sara am U+0E33 decomposes under NFKC, breaking ICU tokenization)
- Word counting via `Intl.Segmenter` with `isWordLike` — never space-split
- Text chunking at 30,000 chars to prevent stack overflow
- Strip inline markup before segmentation, maintain offset map
- Glossary: substring match primary + Intl.Segmenter boundary validation secondary
