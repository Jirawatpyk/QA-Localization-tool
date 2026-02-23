# Anti-Pattern Detector — Persistent Memory

## Recurring Violations by Category

### withTenant() Missing (MEDIUM — Architectural Rule)

- **Pattern**: Developers use `eq(table.tenantId, tenantId)` directly instead of `withTenant()`.
- **Found in Stories 1.1–1.7 baseline scan**:
  - `updateUserRole.action.ts` lines 47, 60, 73: `eq(userRoles.tenantId, ...)` — 3 occurrences
  - `requireRole.ts` line 46: `eq(userRoles.tenantId, ...)` — infrastructure file
  - `projects/page.tsx` line 40: `eq(files.tenantId, ...)` inside leftJoin ON clause
  - `admin/page.tsx` line 34: `eq(userRoles.tenantId, ...)` inside leftJoin ON clause
- **Note**: `withTenant()` is a thin wrapper around `eq()`, so functionally identical. The JOIN ON clause usage is an edge case — it's not a WHERE clause but a JOIN condition. Debatable whether `withTenant()` is required in JOIN ON clauses.
- **Fix pattern**: Replace `eq(table.tenantId, tenantId)` with `withTenant(table.tenantId, tenantId)` and ensure import is present.

### Inline Tailwind Colors (MEDIUM)

- **Pattern**: Developers use Tailwind palette classes (amber-_, red-_, green-_, yellow-_) or hardcoded hex colors.
- **Found in baseline scan**:
  - `GlossaryImportDialog.tsx` lines 261, 263, 266: `text-green-600`, `text-yellow-600`, `text-red-600`
  - `OnboardingTour.tsx` line 65: `overlayColor: 'var(--color-overlay, #1e293b)'` — uses CSS variable WITH fallback hex; borderline case
- **Note**: `DashboardView.tsx` was CLEAN after Story 1.7 fixes (previously had amber colors). `OnboardingTour.tsx` now uses `var(--color-overlay, #1e293b)` which references the design token — the `#1e293b` is only a fallback, not primary usage.

### console.log in Application Code (HIGH)

- **Pattern**: Error boundaries use console.error directly (cannot easily use pino in client components).
- **Confirmed violations**:
  - `src/app/(app)/error.tsx` line 14: `console.error('App error boundary caught:', error)`
  - `src/app/error.tsx` line 14: `console.error('Root error boundary caught:', error)`
- **Note**: These are `'use client'` error boundary components — pino is server-only and cannot be imported here. This is a fundamental limitation. Developers should use `logger-edge.ts` or a client-safe logger if available.

### process.env Direct Access (HIGH)

- **Confirmed violations**:
  - `src/lib/logger.ts` line 6: `process.env.NODE_ENV` — used in logging configuration, not sensitive env var
  - `src/lib/supabase/client.ts` lines 9–10: `process.env.NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` — documented exception: `env.ts` is `server-only` so cannot be used in browser
  - `src/proxy.ts` lines 53, 64–65: `process.env.NODE_ENV` and `NEXT_PUBLIC_SUPABASE_*` — documented exception: proxy runs before app init
- **Note**: All three have explicit code comments explaining why `env.ts` cannot be used. These are DOCUMENTED EXCEPTIONS, not careless violations.

### Relative Imports Going Up One Level (LOW)

- **Pattern**: `from '../types'` in feature action files — going up one level from `actions/` to feature root
- **Found**:
  - `taxonomy/actions/createMapping.action.ts`: `from '../types'`
  - `taxonomy/actions/getTaxonomyMappings.action.ts`: `from '../types'`
  - `taxonomy/actions/updateMapping.action.ts`: `from '../types'`
- **Note**: Rule says "no paths going up more than one level". Going up exactly one level (`../`) within the same feature module is borderline — CLAUDE.md says "no paths going up more than one level". These go up only one level. Flagged as LOW.

## Clean Patterns Confirmed in Baseline Scan (Stories 1.1–1.7)

- All `page.tsx` files: NO `"use client"` — correct Server Component boundary
- No `export default` in feature modules (only in `page.tsx`, `layout.tsx`, `error.tsx` as permitted)
- No `any` types found
- No TypeScript `enum` — uses union types and `z.enum()` correctly
- No `service_role` key in client code (only in `admin.ts` server factory)
- No hardcoded `tenant_id` UUIDs
- No inline Supabase client creation outside the 3 factory files
- No `step.run()` Inngest code yet (not implemented)
- No snapshot tests
- No barrel exports in features EXCEPT `glossary/parsers/index.ts` (a dispatcher function, not a re-export barrel)
- Supabase client factories used correctly everywhere
- Zod schemas correctly named with `Schema` suffix
- All DB queries go through Drizzle ORM (sql`` template literals are Drizzle-native, not raw SQL)
- Constants follow UPPER_SNAKE_CASE (`BATCH_SIZE`, `PAGE_SIZE`, `NAV_ITEMS` etc.)
- `muted-foreground` is a valid shadcn/ui token (defined via `--color-muted-foreground` in globals.css)
- GoogleLogo.tsx hex colors in SVG `fill=` attrs are SVG attributes, not Tailwind classes — acceptable

## Story 2.1 Scan Summary (2026-02-23, re-verified 2026-02-23)

- Files scanned: 11 (upload feature core: route.ts, 3 actions, 1 hook, 5 components, page.tsx)
- **MEDIUM violations (2):**
  - `FileSizeWarning.tsx` line 13: `border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300` — inline Tailwind palette colors; should use design tokens
  - `UploadProgressList.tsx` line 59: `text-emerald-600` — inline Tailwind palette color; should use design token
- **LOW violations (2):**
  - `route.ts` line 99: `const results = []` — implicit `any[]`; should be typed as `UploadFileResult[]`
  - `useFileUpload.ts` line 314: `export { createBatch }` re-exports server action from hook file — architectural smell (not a barrel index.ts violation but unusual coupling pattern)
- **Relative imports (LOW-borderline):**
  - `checkDuplicate.action.ts` lines 14–15: `from '../types'`, `from '../validation/uploadSchemas'` — one level up within feature module
  - `createBatch.action.ts` lines 11–12: same pattern
- **All other checks CLEAN** — no `export default` in feature modules, no `any`, no raw SQL, no console.log, no enum, no service_role, no hardcoded tenantId, no inline Supabase client creation, no try-catch in step.run(), no snapshot tests, no process.env, no "use client" on page.tsx, withTenant() used correctly in WHERE + JOIN ON clauses, md: breakpoint is standard Tailwind

## Edge Cases Noted

- `logger-edge.ts` uses `console.log/warn/error` internally — this IS the logging solution for Edge runtime.
- `rls/*.test.ts` files use `console.warn` for skip messages — test files exempt from logging rule.
- `error.tsx` files use `console.error` — required by Next.js error boundary pattern; pino cannot be used in client components.
- `db/schema/index.ts` barrel export is architecture-approved (comment says so).
- `glossary/parsers/index.ts` is a dispatcher function (not a re-export barrel) — clean.
- `sql\`` template literals in Drizzle ORM (`count(\*)::int`, `lower()`) are NOT raw SQL violations — they are Drizzle's type-safe SQL helper.
- JOIN ON clause `eq(table.tenantId, tenantId)` vs WHERE clause — debatable whether withTenant() required in ON conditions.
