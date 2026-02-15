# Story 1.1: Project Initialization & Design System Setup

Status: ready-for-dev

<!-- Validated: 2026-02-16 | 4 critical fixes, 7 enhancements, 3 optimizations applied -->

## Story

As a Developer,
I want the application initialized with the correct tech stack, folder structure, design tokens, and app shell layout,
so that all subsequent development has a consistent, well-structured foundation to build upon.

## Acceptance Criteria

1. **AC1: Project Creation & Dependencies**
   - **Given** no project exists yet
   - **When** the initialization commands are executed (create-next-app, shadcn init, dependency install)
   - **Then** a Next.js 16 project is created with TypeScript, Tailwind CSS v4, ESLint, App Router, and src directory
   - **And** shadcn/ui is initialized with the project's design tokens (colors, typography, spacing from UX spec)
   - **And** all core dependencies are installed: @supabase/supabase-js, @supabase/ssr, drizzle-orm, inngest, ai, fast-xml-parser, zustand, pino, sonner, zod, @upstash/ratelimit, @upstash/redis
   - **And** all dev dependencies are installed: drizzle-kit, vitest, @vitejs/plugin-react, jsdom, @testing-library/react, playwright, drizzle-zod

2. **AC2: Folder Structure & App Shell**
   - **Given** the project is initialized
   - **When** I examine the folder structure
   - **Then** the feature-based structure matches Architecture spec: `src/features/`, `src/components/ui/`, `src/components/layout/`, `src/lib/`, `src/db/`, `src/app/`
   - **And** the app shell layout is implemented with collapsible sidebar (48px collapsed / 240px expanded) + main content area + detail panel (400px width placeholder)
   - **And** sidebar collapsed/expanded state persists per user preference (localStorage)

3. **AC3: Performance & Responsive Layout**
   - **Given** the app shell is loaded in Chrome
   - **When** I navigate to the root URL
   - **Then** TTI (Time to Interactive) <= 2 seconds measured on Chrome DevTools with 4G throttling (latency 150ms, download 1.6Mbps), averaged across 5 runs (NFR5)
   - **And** the layout is responsive using Tailwind default breakpoints: full layout at `2xl:` (>= 1536px), sidebar expanded at `xl:` (>= 1280px), sidebar collapsed at `lg:` (>= 1024px), single column at `md:` (>= 768px), dashboard-only at `< md:` (< 768px)
   - **And** sidebar toggle animates 240px width (expanded) <-> 48px width (collapsed) in 200ms ease-out, respects prefers-reduced-motion
   - **And** main content area: max-width 1400px at 2xl+, full-width below
   - **And** detail panel (400px): visible right-side at `2xl:`, overlay sheet at `xl:`/`lg:`, hidden drawer at `< lg:` (accessible via toggle button)
   - **And** WCAG 2.1 AA baseline is met: 4.5:1 contrast, focus indicators visible (2px indigo outline, 4px offset), semantic HTML structure

4. **AC4: Configuration & Tooling**
   - **Given** the project is set up
   - **When** I check configuration files
   - **Then** `.env.example` exists with all required environment variable keys (no secrets)
   - **And** `drizzle.config.ts` is configured for Supabase connection
   - **And** vitest workspace is configured (jsdom for components, node for server)
   - **And** `edgeLogger` utility exists at `src/lib/logger-edge.ts` for Edge Runtime logging
   - **And** pino logger exists at `src/lib/logger.ts` for Node.js runtime

5. **AC5: CI/CD Quality Gates**
   - **Given** a developer creates a pull request
   - **When** the PR is opened or updated
   - **Then** a Quality Gate runs: TypeScript type check (`tsc --noEmit`), ESLint, Prettier format check, Vitest unit tests, and build verification (`next build`)
   - **And** the PR cannot be merged if any quality gate check fails
   - **And** test coverage report is posted as PR comment

6. **AC6: E2E Gate & Chaos Testing**
   - **Given** a PR is merged to main branch
   - **When** the merge commit triggers CI
   - **Then** an E2E Gate runs: Playwright E2E tests against a preview deployment
   - **And** E2E tests cover critical paths: login, file upload, rule-based QA run, review workflow
   - **And** deployment to production proceeds only if E2E passes
   - **Given** the CI/CD pipeline is configured
   - **When** I inspect the workflow configuration
   - **Then** a weekly Chaos Test schedule exists: AI provider timeout simulation, Supabase connection failure, Inngest queue failure
   - **And** chaos test results are logged and alerted via Better Stack
   - **And** secrets are managed via Vercel environment variables (not committed to repo)
   - **And** preview deployments use separate Supabase project (not production)

7. **AC7: Monitoring Infrastructure**
   - **Given** the application is deployed
   - **When** I check monitoring infrastructure
   - **Then** Better Stack uptime monitoring is configured with 5 monitors: homepage, API health endpoint, Inngest dashboard, Supabase status, reserved slot (1-minute intervals)
   - **And** alert escalation: Warning at 3 minutes down -> Critical at 9 minutes down -> Recovery notification when restored
   - **And** `/api/health` endpoint checks: database (Supabase), auth (Supabase Auth), queue (Inngest) — returns `{ status, checks: { db, auth, queue }, timestamp }` with HTTP 200 or 503
   - **And** Vercel Analytics is enabled for Core Web Vitals (LCP, FID, CLS, TTFB)
   - **And** no raw `console.log` in production code (enforced by ESLint rule)

8. **AC8: Browser Compatibility**
   - **Given** the application loads in supported browsers
   - **When** I test the app shell in each browser
   - **Then** Chrome (latest) — fully tested, all features functional (NFR31)
   - **And** Firefox (latest) — best-effort tested, core workflows functional (NFR32)
   - **And** Edge (latest) — best-effort tested, core workflows functional (NFR33)
   - **And** Safari 17.4+ — best-effort tested, Intl.Segmenter support verified (NFR34)
   - **And** Mobile browsers (<768px) — dashboard summary only, banner: "For the best review experience, use a desktop browser" (NFR35)

9. **AC9: Load Testing Pre-Launch Gate**
   - **Given** the system is ready for pre-launch validation
   - **When** the load test suite runs
   - **Then** 50 concurrent dashboard page loads complete with TTI <= 2 seconds each (NFR5, NFR20)
   - **And** 10 concurrent QA pipeline executions (file upload -> L1 rule processing) complete without errors (NFR21)
   - **And** 50 concurrent Supabase Realtime subscriptions maintain stable connections for 5 minutes
   - **And** P95 response times within NFR targets: dashboard < 2s, file upload+parse < 3s, rule engine < 5s/5K segments
   - **And** error rate < 1% under load, no memory leaks (heap growth < 10% over test duration)
   - **And** if targets not met, performance upgrade triggers documented per service (Supabase pool size, Vercel concurrency, Inngest parallelism)

## Tasks / Subtasks

### Task 1: Next.js Project Initialization (AC: #1)

- [ ] 1.1 Run `npx create-next-app@latest qa-localization-tool --typescript --tailwind --eslint --app --src-dir`
  - Verify Next.js 16.x installed with Turbopack default and React Compiler
  - Verify TypeScript 5.9.x, Tailwind CSS v4 (zero-config, @theme directive)
  - Verify App Router with `src/` directory structure
  - **CRITICAL:** Run `npm info next version` first to confirm 16.x is still latest
- [ ] 1.2 Initialize shadcn/ui: `npx shadcn@latest init`
  - Configure with Indigo primary (#4F46E5), Inter font, compact (0.75x) spacing
  - shadcn/ui uses unified Radix UI package, RTL support available
  - **Note:** shadcn init auto-creates `src/lib/utils.ts` with `cn()` helper — verify it exists after init
- [ ] 1.3 Install core dependencies
  ```bash
  npm i @supabase/supabase-js @supabase/ssr drizzle-orm inngest ai fast-xml-parser zustand pino sonner zod @upstash/ratelimit @upstash/redis server-only
  ```
- [ ] 1.4 Install dev dependencies
  ```bash
  npm i -D drizzle-kit @types/node vitest@^4.0 @vitest/coverage-v8@^4.0 @vitejs/plugin-react jsdom @testing-library/react @faker-js/faker playwright @playwright/test drizzle-zod
  ```
  **CRITICAL:** Install Vitest v4 (NOT v3). Architecture spec says v3 but v4.0 released Dec 2025. See "Vitest v4 Migration" section in Dev Notes.
- [ ] 1.5 **Version Lock:** Remove `^`/`~` from `package.json` for core dependencies to prevent drift. CI must use `npm ci`.
- [ ] 1.6 Verify all dependency versions match Architecture spec (or document deviations)
  - Run `npm info <package> version` for each core dependency before installing
  - If major version differs from Architecture (e.g., Next.js 17 released), STOP and flag to user

### Task 2: TypeScript & Tooling Configuration (AC: #4)

- [ ] 2.1 Configure `tsconfig.json` with strict settings:
  ```json
  {
    "compilerOptions": {
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "exactOptionalPropertyTypes": true
    }
  }
  ```
  [Source: architecture/implementation-patterns-consistency-rules.md#TypeScript Configuration]
- [ ] 2.2 Configure ESLint rules:
  - **Note:** Next.js 16 may generate `eslint.config.mjs` (flat config) instead of `.eslintrc.json`. Use whichever format `create-next-app` produces — do NOT force a different format.
  - Import order enforcement (external -> @/ aliases -> relative)
  - No default exports (except Next.js page/layout/error/loading/not-found)
  - No `console.log` (warn in dev, error in CI)
  - No `any` type
- [ ] 2.3 Configure Prettier (`.prettierrc`)
- [ ] 2.4 Create `src/lib/env.ts` — Zod-validated env access with `import 'server-only'`
  ```typescript
  import 'server-only'
  import { z } from 'zod'
  const envSchema = z.object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
    SUPABASE_SERVICE_ROLE_KEY: z.string(),
    INNGEST_EVENT_KEY: z.string(),
    INNGEST_SIGNING_KEY: z.string(),
    OPENAI_API_KEY: z.string(),
    ANTHROPIC_API_KEY: z.string(),
    UPSTASH_REDIS_REST_URL: z.string().url(),
    UPSTASH_REDIS_REST_TOKEN: z.string(),
    DATABASE_URL: z.string().url(),
  })
  export const env = envSchema.parse(process.env)
  ```
  **Note:** Only OpenAI + Anthropic are architecture-approved AI providers. `DATABASE_URL` is included for Drizzle connection (used by `src/db/connection.ts`, not `drizzle.config.ts` which runs outside Next.js).
  [Source: architecture/implementation-patterns-consistency-rules.md#Environment Variable Access]
- [ ] 2.5 Create `.env.example` with all env keys + descriptions (no secrets)
  [Source: architecture/core-architectural-decisions.md#5.3 Environment Configuration]
- [ ] 2.6 Configure `next.config.ts` (TypeScript config file, NOT .js/.mjs)

### Task 3: Design System & CSS Tokens (AC: #1, #2, #3)

- [ ] 3.1 Create `src/styles/tokens.css` with CSS custom properties via `@theme` directive:
  ```css
  @theme {
    /* Primary — Indigo */
    --color-primary: #4F46E5;
    --color-primary-hover: #4338CA;
    --color-primary-light: #EEF2FF;
    --color-primary-foreground: #FFFFFF;

    /* Neutral — Slate */
    --color-surface: #FFFFFF;
    --color-surface-secondary: #F9FAFB;
    --color-border: #E2E8F0;
    --color-border-strong: #CBD5E1;
    --color-muted: #F1F5F9;
    --color-text-primary: #111827;
    --color-text-secondary: #6B7280;
    --color-text-muted: #94A3B8;

    /* Semantic */
    --color-success: #10B981;
    --color-warning: #F59E0B;
    --color-error: #EF4444;
    --color-info: #3B82F6;

    /* Finding Severity */
    --color-severity-critical: #DC2626;
    --color-severity-major: #F59E0B;
    --color-severity-minor: #3B82F6;
    --color-severity-enhancement: #10B981;

    /* Score Status */
    --color-status-pass: #10B981;
    --color-status-pending: #F59E0B;
    --color-status-fail: #EF4444;
    --color-status-analyzing: #4F46E5;

    /* Layout */
    --sidebar-width: 240px;
    --sidebar-width-collapsed: 48px;
    --detail-panel-width: 400px;
    --content-max-width: 1400px;

    /* Spacing (4px base, compact 0.75x) */
    --spacing-unit: 4px;
    --density-factor: 0.75;
  }
  ```
  [Source: ux-design-specification/visual-design-foundation.md#Color System, project-context.md#Color Tokens]
- [ ] 3.2 Create `src/styles/animations.css` with shared transition/animation definitions
  - Sidebar toggle: 200ms ease-out
  - Respect `prefers-reduced-motion`
- [ ] 3.3 Configure fonts via `next/font`: Inter (UI) + JetBrains Mono (code)
  - Use `next/font/google` (NOT static files in `public/fonts/`) — automatic optimization, no FOUT
  - Font stack: `Inter, 'Noto Sans Thai', system-ui, sans-serif` — Thai fallback for localization content
  - Set `line-height: 1.8` for Thai/CJK content areas (default 1.5 causes clipping on Thai diacritics)
  - Load weights: Inter (400, 500, 600, 700), JetBrains Mono (400, 500)
  [Source: ux-design-specification/visual-design-foundation.md#Typography, project-context.md#UI & Styling]
- [ ] 3.4 Configure `src/app/globals.css` to import tokens and Tailwind v4 base
- [ ] 3.5 **CRITICAL:** Use `bg-primary` NOT `bg-indigo-600` — enables future dark mode + theming. Never use raw Tailwind colors.

### Task 4: Feature-Based Folder Structure (AC: #2)

- [ ] 4.1 Create complete directory structure matching Architecture spec:
  ```
  src/
    app/
      (auth)/login/  (auth)/signup/  (auth)/callback/
      (app)/layout.tsx  (app)/dashboard/  (app)/projects/  (app)/admin/
      api/inngest/  api/health/  api/webhooks/supabase/
    components/
      ui/          (shadcn base + custom shared: status-badge, progress-ring, empty-state)
      layout/      (app-sidebar, app-header, page-header, compact-layout)
    features/
      review/  pipeline/  parser/  scoring/  glossary/  taxonomy/  dashboard/  audit/  project/  admin/
    lib/
      env.ts  logger.ts  logger-edge.ts  utils.ts  constants.ts
      cache/  supabase/  inngest/  auth/  ai/  language/
    db/
      index.ts  connection.ts
      schema/  migrations/  helpers/  validation/  __tests__/rls/
    stores/      (ui.store.ts, keyboard.store.ts)
    styles/      (tokens.css, animations.css)
    test/        (factories.ts, setup.ts, helpers.ts, mocks/, fixtures/)
    types/       (index.ts, finding.ts, review.ts, pipeline.ts, actionResult.ts)
    middleware.ts
  ```
  [Source: architecture/project-structure-boundaries.md#Complete Project Directory Structure]
- [ ] 4.2 Create each feature folder with sub-structure: `components/`, `actions/`, `hooks/`, `stores/`, `validation/`
- [ ] 4.3 Create placeholder files for cross-cutting concerns:
  - `src/types/actionResult.ts` — ActionResult<T> type (see implementation-patterns for definition)
  - `src/types/index.ts` — Re-export all types
  - `src/types/finding.ts` — Finding type stub
  - `src/types/review.ts` — Review types stub
  - `src/types/pipeline.ts` — Pipeline types stub
  - `src/db/helpers/withTenant.ts` — Tenant filter helper (placeholder)
  - `src/lib/auth/requireRole.ts`, `getCurrentUser.ts` — Auth helpers (stubs)
  - `src/lib/constants.ts` — App-wide constants (e.g., `MAX_FILE_SIZE_BYTES = 15_728_640`)
  - `src/stores/ui.store.ts` — Global UI store (sidebarOpen, theme, activePanel)
  - `src/stores/keyboard.store.ts` — Cross-feature keyboard shortcuts store
  - **Note:** Supabase + Inngest client stubs are created in Task 12 (not here) to avoid duplication

### Task 5: App Shell Layout (AC: #2, #3)

- [ ] 5.1 Create `src/app/layout.tsx` (root layout):
  - Load fonts (Inter + JetBrains Mono via `next/font`)
  - Add metadata
  - Add `<Toaster />` from sonner (SOLE toast library)
  - **Named export exception:** Root layout uses default export per Next.js convention
- [ ] 5.2 Create `src/components/layout/app-sidebar.tsx`:
  - Collapsible: 240px expanded / 48px collapsed
  - Toggle animation: 200ms ease-out, respects `prefers-reduced-motion`
  - Persist collapsed/expanded state via localStorage
  - Use `"use client"` directive (interactive component)
  - Include nav items: Dashboard, Projects, Admin (placeholder links)
  - Keyboard accessible (tab order, focus management)
- [ ] 5.3 Create `src/components/layout/app-header.tsx`:
  - Page title, user menu placeholder, notification area placeholder
- [ ] 5.4 Create `src/components/layout/compact-layout.tsx`:
  - 0.75x density wrapper (professional review tool spacing)
  - Skeletons MUST match this density to prevent layout shift
- [ ] 5.5 Create `src/app/(app)/layout.tsx`:
  - App shell wrapper with sidebar + header + main content area + detail panel (400px width)
  - **Breakpoint mapping** (UX spec 1440px target → Tailwind `2xl:` 1536px):
    - `2xl:` (>= 1536px): full layout (sidebar expanded + content + detail panel visible side-by-side)
    - `xl:` (>= 1280px): sidebar expanded + content (detail panel overlays on trigger)
    - `lg:` (>= 1024px): sidebar collapsed (48px) + content
    - `md:` (>= 768px): single column (no sidebar)
    - `< md:` (< 768px): dashboard-only + mobile banner
  - **Rationale:** Architecture forbids arbitrary breakpoints (Anti-Pattern #14). UX spec targets 1440px but `2xl` (1536px) is the closest Tailwind default. At `xl` (1280px), sidebar is still visible but detail panel overlays to preserve space.
  - main content area: `max-w-[1400px]` at 2xl+, full-width below
  - detail panel: 400px width, visible right-side at `2xl:`, overlay sheet at `xl:`/`lg:`, hidden drawer at `< lg:` (accessible via toggle button)
- [ ] 5.6 Create `src/app/(auth)/` layout (public routes — no sidebar, no app shell)
- [ ] 5.7 Add WCAG 2.1 AA baseline:
  - 4.5:1 contrast ratios on all text
  - Focus indicators: 2px indigo outline, 4px offset
  - Semantic HTML (nav, main, aside, header)
  - All interactive elements keyboard accessible (no tabindex > 0)
- [ ] 5.8 Create `src/app/(app)/dashboard/page.tsx` — Placeholder dashboard page (Server Component)
- [ ] 5.9 Create `src/components/layout/page-header.tsx` — Reusable page header (title, breadcrumb area, actions slot)
  [Source: architecture/project-structure-boundaries.md]
- [ ] 5.10 **Mobile banner component**: "For the best review experience, use a desktop browser" (shown at < 768px)

### Task 6: Logging Infrastructure (AC: #4)

- [ ] 6.1 Create `src/lib/logger.ts` — pino structured JSON logger (Node.js runtime ONLY)
  - Configure for Vercel Logs format
  - NEVER use in Edge Runtime or Client Components
- [ ] 6.2 Create `src/lib/logger-edge.ts` — Edge-compatible structured logger
  ```typescript
  type LogLevel = 'info' | 'warn' | 'error'
  interface EdgeLogEntry { level: LogLevel; msg: string; timestamp: string; [key: string]: unknown }
  export const edgeLogger = { info, warn, error }
  ```
  [Source: architecture/core-architectural-decisions.md#5.4 Logging Strategy]
- [ ] 6.3 Test both loggers output valid JSON structure

### Task 7: Testing Infrastructure (AC: #4)

- [ ] 7.1 Create `vitest.workspace.ts` with two projects:
  - **unit**: `src/**/*.test.{ts,tsx}` excluding `db/__tests__/` — environment: `jsdom`
  - **rls**: `src/db/__tests__/rls/**/*.test.ts` — environment: `node`
  [Source: architecture/project-structure-boundaries.md#Vitest Workspace Configuration]
- [ ] 7.2 Create `src/test/setup.ts`:
  - `afterEach`: clear all Zustand stores (prevent state leak)
  - `afterEach`: `vi.restoreAllMocks()`
  - Setup global environment (timezone, locale)
- [ ] 7.3 Create `src/test/factories.ts` with base factory template
- [ ] 7.4 Create `src/test/mocks/` directory with stubs: `supabase.ts`, `inngest.ts`, `ai-providers.ts`, `fast-xml-parser.ts`
- [ ] 7.5 Create `src/test/fixtures/` directory structure: `segments/`, `sdlxliff/`, `glossary/`
- [ ] 7.6 Create `playwright.config.ts` for E2E tests
- [ ] 7.7 Create `e2e/` directory with placeholder spec files and `e2e/fixtures/` for test data (e.g., `sample.sdlxliff`)
- [ ] 7.8 Configure npm scripts in `package.json`:
  ```json
  {
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
  ```
- [ ] 7.9 Write a smoke test: `src/app/layout.test.tsx` or `src/lib/env.test.ts` to verify test infrastructure works

### Task 8: Drizzle ORM Configuration (AC: #4)

- [ ] 8.1 Create `drizzle.config.ts`:
  ```typescript
  import { defineConfig } from 'drizzle-kit'
  export default defineConfig({
    schema: './src/db/schema',
    out: './src/db/migrations',
    dialect: 'postgresql',
    dbCredentials: { url: process.env.DATABASE_URL! }
  })
  ```
  - Connect via pooler URL (port 6543), NOT direct (port 5432)
  - **Exception:** `process.env.DATABASE_URL!` is acceptable here because `drizzle.config.ts` runs via Drizzle Kit CLI (outside Next.js runtime) and cannot import `@/lib/env` which has `import 'server-only'`. This is NOT a violation of Anti-Pattern #11.
  [Source: project-context.md#Backend & Data]
- [ ] 8.2 Create `src/db/connection.ts` — DB connection config (separate from index)
- [ ] 8.3 Create `src/db/index.ts` — Drizzle client export (re-exports db instance)
- [ ] 8.4 Create `src/db/schema/index.ts` — barrel export for all schemas (architecture-approved exception to no-barrel rule)

### Task 9: CI/CD Pipeline (AC: #5, #6)

- [ ] 9.1 Create `.github/workflows/quality-gate.yml`:
  ```yaml
  # Trigger: every PR
  # Steps: lint -> type-check -> unit-test -> build
  # Note: RLS tests deferred to Story 1.2 (requires DB schema)
  ```
  [Source: architecture/core-architectural-decisions.md#5.1 CI/CD Pipeline]
- [ ] 9.2 Create `.github/workflows/e2e-gate.yml`:
  ```yaml
  # Trigger: merge to main
  # Steps: Playwright 4 critical path tests against preview deployment
  # Note: Actual E2E tests populated in later stories
  ```
- [ ] 9.3 Create `.github/workflows/chaos-test.yml`:
  ```yaml
  # Trigger: weekly schedule + manual dispatch
  # Steps: AI fallback chaos simulation
  # Note: Actual chaos scenarios populated in Epic 3
  ```
- [ ] 9.4 Verify quality-gate passes on initial codebase (clean lint, type-check, build)

### Task 10: Health Endpoint & Monitoring Setup (AC: #7)

- [ ] 10.1 Create `src/app/api/health/route.ts`:
  ```typescript
  // GET /api/health
  // Checks: database (Supabase), auth (Supabase Auth), queue (Inngest)
  // Returns: { status, checks: { db, auth, queue }, timestamp }
  // Headers: Cache-Control: no-store
  // Response: HTTP 200 (healthy) or 503 (degraded)
  ```
  [Source: architecture/core-architectural-decisions.md#5.2 Uptime Monitoring]
- [ ] 10.2 Document Better Stack monitoring configuration:
  - 5 monitors (homepage, /api/health, Inngest, Supabase, reserved)
  - Alert escalation: Warning 3min -> Critical 9min -> Recovery
  - **Note:** Better Stack is configured via their dashboard, not in code
- [ ] 10.3 Enable Vercel Analytics for Core Web Vitals (in `next.config.ts` or Vercel dashboard)

### Task 11: Error Boundaries & Loading States (AC: #2)

- [ ] 11.1 Create `src/app/error.tsx` — Root error boundary
- [ ] 11.2 Create `src/app/(app)/error.tsx` — App-level error boundary
- [ ] 11.3 Create `src/app/not-found.tsx` — Root not-found page
- [ ] 11.4 Create `src/app/loading.tsx` — Root loading state
- [ ] 11.5 Create `src/app/(app)/loading.tsx` — App loading state
- [ ] 11.6 Ensure all loading skeletons match compact density (0.75x)

### Task 12: Inngest & Supabase Client Stubs (AC: #4)

- [ ] 12.1 Create `src/lib/inngest/client.ts` — Inngest client instance stub
- [ ] 12.2 Create `src/app/api/inngest/route.ts` — Inngest serve endpoint (imports function registry)
- [ ] 12.3 Create `src/lib/supabase/server.ts` — Server Component/Action client (with `import 'server-only'`)
- [ ] 12.4 Create `src/lib/supabase/client.ts` — Browser client (Auth, Realtime)
- [ ] 12.5 Create `src/lib/supabase/admin.ts` — Admin client (with `import 'server-only'`)
- [ ] 12.6 Create `src/middleware.ts` — Edge middleware stub (auth + tenant + rate limit flow placeholder)
  ```
  Flow: 1. Rate limit (Upstash) -> 2. Read session -> 3. Verify JWT -> 4. Extract tenant_id -> 5. Pass through
  ```
  Matcher: exclude `_next/static`, `_next/image`, `favicon.ico`, `fonts/`

### Task 13: Load Testing Configuration (AC: #9)

- [ ] 13.1 Document load testing plan (k6 or Artillery):
  - 50 concurrent dashboard loads: P95 < 3s, 0 errors
  - 10 concurrent pipeline runs: all complete, no timeout
  - 50 concurrent Realtime subscriptions: all receive updates within 2s
  - Sustained 100 req/min for 10 min: P99 < 5s, <1% error rate
- [ ] 13.2 Create placeholder load test script at `e2e/load/` (actual execution deferred to pre-launch)
  - **Note:** Full load testing requires completed pipeline (Epic 2-3). This task creates the framework and documents targets.
- [ ] 13.3 Document performance upgrade triggers per service:
  - DB connections >80% pool utilization -> increase Supabase pool size
  - Vercel function timeouts >2% -> investigate + optimize
  - Inngest monthly runs >4K -> upgrade to Pro
  - Upstash daily commands >8K -> upgrade to Pay-as-you-go

## Dev Notes

### Architecture Patterns & Constraints

- **Starter Template:** `create-next-app` + manual setup (no community starter has all required tech). [Source: architecture/starter-template-evaluation.md]
- **Version Lock:** Pin exact versions with `npm ci` in CI. NO `^`/`~` for core deps.
- **TypeScript:** strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes — these 3 settings catch most type bugs at compile time. NEVER disable them.
- **Tailwind CSS v4:** Zero-config, `@theme` directive replaces `tailwind.config.js`. Design tokens in `src/styles/tokens.css`.
- **Named exports ONLY** — no `export default` except Next.js page/layout/error/loading/not-found files.
- **Import aliases:** Always use `@/` — never relative paths across features (`../../features/` is FORBIDDEN).
- **No barrel exports** in feature folders — import directly. Exceptions: `src/db/schema/index.ts`, `src/features/pipeline/inngest/index.ts`.
- **No enums** — use `as const` objects or union types.
- **UI density:** Default spacing is compact (0.75x). All skeletons must match.
- **sonner** is the SOLE toast/notification library. No `alert()`, no custom modals for action feedback.
- **Lucide React** (ships with shadcn/ui) — SOLE icon library. Never use heroicons, font-awesome, or inline SVG.

### Runtime Compatibility (CRITICAL)

| Runtime | Compatible Libraries | DO NOT Import Here |
|---------|---------------------|-------------------|
| **Edge Runtime** (middleware.ts) | `@upstash/ratelimit`, `@upstash/redis`, `@supabase/ssr` | `pino`, `drizzle-orm`, `fast-xml-parser`, `inngest` |
| **Node.js Runtime** (Server Components, Actions, Inngest) | `pino`, `drizzle-orm`, `fast-xml-parser`, `inngest`, `@supabase/ssr` | — |
| **Browser** (Client Components) | `zustand`, `sonner`, `@supabase/ssr` | `pino`, `drizzle-orm`, server-only modules |

### Route Group Conventions

- `(auth)/` — public routes: login, signup, callback (no app shell, no sidebar)
- `(app)/` — protected routes: everything after login (with sidebar + header)
- NEVER put `"use client"` on a `page.tsx` — use feature boundary pattern (Server wrapper -> Client entry)

### Next.js 16 Async APIs (CRITICAL for Dev)

Next.js 16 makes ALL dynamic request APIs async. Code from Next.js 14/15 tutorials will NOT work without `await`:

```typescript
// ❌ BROKEN in Next.js 16 (was sync in 14/15)
const cookieStore = cookies()
const headersList = headers()
const { slug } = params

// ✅ CORRECT in Next.js 16 (must await)
const cookieStore = await cookies()
const headersList = await headers()
const { slug } = await params
```

Affected APIs: `cookies()`, `headers()`, `params`, `searchParams`, `draftMode()`. The dev agent must use `await` for ALL of these. This applies to Server Components, Route Handlers, Middleware, and Server Actions.

### Service Tier Requirements (Context for Infrastructure Tasks)

| Service | Required Plan | Key Limits |
|---------|:------------:|------------|
| Supabase | Pro ($25/mo) | 200 concurrent DB connections, 8GB DB |
| Vercel | Pro ($20/mo) | 100 concurrent serverless, 1024MB memory |
| Inngest | Free (MVP) | 5K function runs/month |
| Upstash Redis | Free | 10K commands/day |
| Better Stack | Free | 5 monitors |

### Verified Technology Versions (Web Research, 2026-02-15)

| Technology | Version | Status vs Architecture | Verify Command |
|-----------|---------|----------------------|----------------|
| Next.js | 16.1.6 LTS | MATCH | `npm info next version` |
| shadcn/ui | CLI 3.8.4 | MATCH (CLI-based) | `npx shadcn@latest --version` |
| @supabase/supabase-js | 2.95.3 | MATCH | `npm info @supabase/supabase-js version` |
| @supabase/ssr | 0.8.0 | MATCH | `npm info @supabase/ssr version` |
| Drizzle ORM | 0.45.1 (stable) | MATCH (v1 still beta) | `npm info drizzle-orm version` |
| Inngest | 3.52.0 | MATCH | `npm info inngest version` |
| Vercel AI SDK | 6.0.86 | MATCH | `npm info ai version` |
| Tailwind CSS | 4.1.18 | MATCH | `npm info tailwindcss version` |
| TypeScript | 5.9.x | MATCH | `npm info typescript version` |
| fast-xml-parser | 5.3.5 | MATCH | `npm info fast-xml-parser version` |
| **Vitest** | **4.0.18** | **DEVIATION** | `npm info vitest version` |
| Playwright | 1.58.2 | OK (minor bump) | `npm info playwright version` |

**IMPORTANT:** Run verify commands BEFORE installing. If major version changed, STOP and flag.

### CRITICAL: Vitest v4 Migration Required

Architecture spec references `Vitest ^3.x` but **Vitest 4.0 was released Dec 2025**. The dev agent MUST install Vitest v4, not v3.

**Breaking changes from v3 -> v4 that affect this project:**
- Reporter APIs removed: `onCollected`, `onTaskUpdate`, `onFinished` (we don't use custom reporters — low impact)
- Automocked methods can no longer be restored with `.mockRestore()` (use `vi.restoreAllMocks()` in setup.ts — already planned)
- `poolMatchGlobs` config option removed (we don't use this — no impact)
- Browser Mode now stable (requires separate `@vitest/browser-playwright` — we use jsdom, low impact)
- Snapshot changes for custom elements (we don't use snapshot tests — no impact)

**Action:** Install `vitest@^4.0` and `@vitest/coverage-v8@^4.0` (NOT v3). The `vitest.workspace.ts` configuration format remains compatible. No migration needed for our workspace setup.

**Source:** [Vitest 4.0 Blog](https://vitest.dev/blog/vitest-4), [Migration Guide](https://vitest.dev/guide/migration.html)

### Additional Web Research Notes

- **Tailwind CSS v4:** Confirmed zero-config approach. Use `@import "tailwindcss"` + `@theme` directive. Auto content detection — no `content` paths needed.
- **shadcn/ui CLI 3.8.4:** New features include RTL support (`--rtl` flag) and Base UI option. Init command unchanged: `npx shadcn@latest init`.
- **Drizzle ORM:** v1.0 still in beta (`npm i drizzle-orm@beta`). Stable is 0.45.1. Use stable for production per Architecture migration plan.
- **Playwright 1.58.2:** Now uses Chrome for Testing builds (since 1.57). New APIs: `page.consoleMessages()`, `page.pageErrors()`.
- **Vercel AI SDK 6.0.86:** Uses v3 Language Model Spec. New: `ToolLoopAgent`, human-in-the-loop, stable MCP support. Package name still `ai`.

### Project Structure Notes

- Complete directory structure defined in Architecture doc with 15+ feature modules
- Feature-based co-location: `src/features/{feature}/components|actions|hooks|stores|validation/`
- All shared UI in `src/components/ui/` (shadcn) + `src/components/layout/`
- DB layer: `src/db/schema/{tableName}.ts` — one file per table (created in Story 1.2)
- Global stores: `src/stores/{name}.store.ts`
- This story creates the structure; Story 1.2 populates DB schemas + auth
- [Source: architecture/project-structure-boundaries.md]

### Git Intelligence

Recent commits are all planning artifacts (architecture sharding, epic structure). No implementation code exists yet — this is the first implementation story. Clean slate.

### References

- [Source: architecture/starter-template-evaluation.md] — Initialization commands, version verification
- [Source: architecture/core-architectural-decisions.md#Category 5] — CI/CD, monitoring, logging, environment
- [Source: architecture/project-structure-boundaries.md] — Complete directory structure, feature mapping
- [Source: architecture/implementation-patterns-consistency-rules.md] — Naming, imports, anti-patterns
- [Source: project-context.md] — 120 rules for AI agents, all technology stack details
- [Source: epics/epic-1-project-foundation-configuration.md#Story 1.1] — Full acceptance criteria

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
