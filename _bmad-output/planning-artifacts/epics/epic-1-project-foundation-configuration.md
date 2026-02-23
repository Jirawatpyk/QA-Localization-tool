# Epic 1: Project Foundation & Configuration

**Goal:** Users can create accounts, set up projects, import glossaries, configure taxonomy mappings, and get onboarded — establishing the complete workspace foundation for QA review operations, with CI/CD, monitoring, and load testing infrastructure.

**FRs covered:** FR40, FR41, FR43, FR44, FR45, FR51, FR52, FR53, FR54, FR55, FR59, FR62
**NFRs addressed:** NFR5 (TTI < 2s), NFR9 (encryption), NFR12 (session expiry), NFR13 (tenant-scoped paths), NFR14 (no passwords in DB), NFR20 (6-9 concurrent users), NFR22 (tenant_id Day 1), NFR25-30 (accessibility baseline), NFR31-35 (browser compatibility), NFR36-39 (observability)
**Architecture:** Starter template, DB schema, RLS policies, audit trigger, auth webhooks, Edge middleware, design system, CI/CD pipeline, Better Stack monitoring, load testing pre-launch gate

### Story 1.1: Project Initialization & Design System Setup

As a Developer,
I want the application initialized with the correct tech stack, folder structure, design tokens, and app shell layout,
So that all subsequent development has a consistent, well-structured foundation to build upon.

**Acceptance Criteria:**

**Given** no project exists yet
**When** the initialization commands are executed (create-next-app, shadcn init, dependency install)
**Then** a Next.js 16 project is created with TypeScript, Tailwind CSS v4, ESLint, App Router, and src directory
**And** shadcn/ui is initialized with the project's design tokens (colors, typography, spacing from UX spec)
**And** all core dependencies are installed: @supabase/supabase-js, @supabase/ssr, drizzle-orm, inngest, ai, fast-xml-parser, zustand, pino, sonner, zod, @upstash/ratelimit, @upstash/redis
**And** all dev dependencies are installed: drizzle-kit, vitest, @vitejs/plugin-react, jsdom, @testing-library/react, playwright, drizzle-zod

**Given** the project is initialized
**When** I examine the folder structure
**Then** the feature-based structure matches Architecture spec: src/features/, src/components/ui/, src/components/layout/, src/lib/, src/db/, src/app/
**And** the app shell layout is implemented with collapsible sidebar (48px collapsed / 240px expanded) + main content area + detail panel placeholder
**And** sidebar collapsed/expanded state persists per user preference (localStorage)

**Given** the app shell is loaded in Chrome
**When** I navigate to the root URL
**Then** TTI (Time to Interactive) ≤ 2 seconds measured on Chrome DevTools with 4G throttling (latency 150ms, download 1.6Mbps), averaged across 5 runs (NFR5)
**And** the layout is responsive: full layout at >= 1440px, collapsed sidebar at >= 1024px, single column at >= 768px, dashboard-only at < 768px
**And** sidebar toggle animates 240px width (expanded) ↔ 48px width (collapsed) in 200ms ease-out, respects prefers-reduced-motion
**And** main content area: max-width 1400px at 1440px+, full-width at <1440px
**And** detail panel: visible right-side at 1440px+, overlays at 1024-1439px, hidden drawer at <1024px (accessible via toggle button)
**And** WCAG 2.1 AA baseline is met: 4.5:1 contrast, focus indicators visible (2px indigo outline, 4px offset), semantic HTML structure

**Given** the project is set up
**When** I check configuration files
**Then** .env.example exists with all required environment variable keys (no secrets)
**And** drizzle.config.ts is configured for Supabase connection
**And** vitest workspace is configured (jsdom for components, node for server)
**And** edgeLogger utility exists at src/lib/logger-edge.ts for Edge Runtime logging
**And** pino logger exists at src/lib/logger.ts for Node.js runtime

**Given** a developer creates a pull request
**When** the PR is opened or updated
**Then** a Quality Gate runs: TypeScript type check (`tsc --noEmit`), ESLint, Prettier format check, Vitest unit tests, and build verification (`next build`)
**And** the PR cannot be merged if any quality gate check fails
**And** test coverage report is posted as PR comment

**Given** a PR is merged to main branch
**When** the merge commit triggers CI
**Then** an E2E Gate runs: Playwright E2E tests against a preview deployment
**And** E2E tests cover critical paths: login, file upload, rule-based QA run, review workflow
**And** deployment to production proceeds only if E2E passes

**Given** the CI/CD pipeline is configured
**When** I inspect the workflow configuration
**Then** a weekly Chaos Test schedule exists: AI provider timeout simulation, Supabase connection failure, Inngest queue failure
**And** chaos test results are logged and alerted via Better Stack
**And** secrets are managed via Vercel environment variables (not committed to repo)
**And** preview deployments use separate Supabase project (not production)

**Given** the application is deployed
**When** I check monitoring infrastructure
**Then** Better Stack uptime monitoring is configured with 5 monitors: homepage, API health endpoint, Inngest dashboard, Supabase status, reserved slot (1-minute intervals)
**And** alert escalation: Warning at 3 minutes down → Critical at 9 minutes down → Recovery notification when restored
**And** `/api/health` endpoint checks: database (Supabase), auth (Supabase Auth), queue (Inngest) — returns `{ status, checks: { db, auth, queue }, timestamp }` with HTTP 200 or 503
**And** Vercel Analytics is enabled for Core Web Vitals (LCP, FID, CLS, TTFB)
**And** no raw `console.log` in production code (enforced by ESLint rule)

**Given** the application loads in supported browsers
**When** I test the app shell in each browser
**Then** Chrome (latest) — fully tested, all features functional (NFR31)
**And** Firefox (latest) — best-effort tested, core workflows functional (NFR32)
**And** Edge (latest) — best-effort tested, core workflows functional (NFR33)
**And** Safari 17.4+ — best-effort tested, Intl.Segmenter support verified (NFR34)
**And** Mobile browsers (<768px) — dashboard summary only, banner: "For the best review experience, use a desktop browser" (NFR35)

**Given** the system is ready for pre-launch validation
**When** the load test suite runs
**Then** 50 concurrent dashboard page loads complete with TTI ≤ 2 seconds each (NFR5, NFR20)
**And** 10 concurrent QA pipeline executions (file upload → L1 rule processing) complete without errors (NFR21)
**And** 50 concurrent Supabase Realtime subscriptions maintain stable connections for 5 minutes
**And** P95 response times within NFR targets: dashboard < 2s, file upload+parse < 3s, rule engine < 5s/5K segments
**And** error rate < 1% under load, no memory leaks (heap growth < 10% over test duration)
**And** if targets not met, performance upgrade triggers documented per service (Supabase pool size, Vercel concurrency, Inngest parallelism)

### Story 1.2: Database Schema & Authentication

As an Admin,
I want to register, log in, and manage user accounts with role-based access control,
So that the right people have the right permissions from Day 1.

**Acceptance Criteria:**

**Architecture Note:** All 27 tables are created in initial migration per Architecture Decision — tenant_id, RLS, and audit immutability require uniform schema from Day 1. Growth-phase tables (fix_suggestions, self_healing_config) are created with mode="disabled" at zero runtime cost. This is an intentional deviation from incremental table creation to ensure security infrastructure (tenant isolation, RLS policies, audit triggers) is consistent across the entire schema from the first migration.

**Given** the database has no schema
**When** the initial migration runs
**Then** all 27 tables from Architecture ERD 1.9 are created in initial migration, including: tenants, users (Supabase Auth), user_roles, projects, files, segments, findings, scores, review_sessions, review_actions, glossaries, glossary_terms, language_pair_configs, severity_configs, taxonomy_definitions, audit_logs, ai_usage_logs, feedback_events, run_metadata, suppression_rules, file_assignments, notifications, exported_reports, audit_results, ai_metrics_timeseries, fix_suggestions (mode="disabled"), self_healing_config (mode="disabled")
**And** migration includes a rollback script (`drizzle-kit drop`) that drops all 27 tables atomically on failure — verified by: run migration on empty DB, confirm 27 tables exist, run rollback, confirm 0 tables remain
**And** all tables include tenant_id column (NFR22)
**And** audit_logs table is partitioned by month with 3-layer immutability protection: app-level INSERT only, RLS INSERT-only policy, DB trigger blocking UPDATE/DELETE
**And** RLS policies are enabled on all tables enforcing tenant isolation
**And** review_actions table contains: id (uuid PK), finding_id (uuid FK), file_id (uuid FK), project_id (uuid FK), tenant_id (uuid FK), action_type (varchar), previous_state (varchar), new_state (varchar), user_id (uuid FK), batch_id (uuid FK nullable), metadata (jsonb), created_at (timestamptz)
**And** ai_usage_logs table contains: id (uuid PK), file_id (uuid FK), project_id (uuid FK), tenant_id (uuid FK), layer (varchar: L1/L2/L3), model (varchar), provider (varchar), input_tokens (integer), output_tokens (integer), estimated_cost (float), latency_ms (integer), status (varchar), created_at (timestamptz)
**And** run_metadata table contains: id (uuid PK), file_id (uuid FK), project_id (uuid FK), tenant_id (uuid FK), model_versions (jsonb), glossary_version (varchar), rule_config_hash (varchar), processing_mode (varchar), total_cost (float), duration_ms (integer), layers_completed (varchar), created_at (timestamptz)

**Given** no user account exists
**When** a user navigates to the login page
**Then** they can sign in via Supabase Auth (email/password or Google OAuth)
**And** upon first login, a default tenant and Admin role are assigned
**And** JWT expiry is set to 15 minutes with automatic silent refresh

**Given** an Admin is logged in
**When** they navigate to user management
**Then** they can create new users and assign roles: Admin, QA Reviewer, or Native Reviewer (FR51)
**And** role changes trigger JWT refresh via Supabase Realtime subscription within 500ms
**And** if Realtime subscription is missed, a fallback poll checks for role changes every 5 minutes (max stale window: 15 minutes = 5min poll gap + 10min JWT expiry safety margin)

**Given** a user with QA Reviewer role
**When** they attempt to access admin-only features (user management, settings)
**Then** the request is blocked (FR52)
**And** read operations (GET) check JWT claims (fast path, ~1ms)
**And** write operations (POST/PATCH/DELETE) always verify role via M3 pattern: JWT read + DB lookup against user_roles table — e.g., `SELECT role FROM user_roles WHERE user_id=$1 AND project_id=$2 AND role IN ('QA_REVIEWER', 'ADMIN')`
**And** Server Actions return error `{ success: false, code: 'FORBIDDEN', message: 'Insufficient permissions' }` when role check fails

**Given** Edge middleware is processing a request
**When** authentication and tenant verification occur
**Then** structured JSON logs are written via edgeLogger (never raw console.log)
**And** rate limiting is enforced via Upstash Redis: API mutations 100/min, auth endpoints 10/15min, reads 300/min

**Given** a user session is inactive for 8 hours
**When** the session timeout check runs
**Then** the session expires and the user is redirected to login (NFR12)

### Story 1.3: Project Management & Configuration

As an Admin,
I want to create and manage QA projects with associated settings,
So that my team has organized workspaces for each localization project.

**Acceptance Criteria:**

**Given** an Admin is logged in
**When** they navigate to the Projects page
**Then** they see a list of all projects for their tenant with name, language pairs, creation date, and file count

**Given** an Admin is on the Projects page
**When** they click "Create Project"
**Then** a form appears to enter: project name, description, source language, target language(s), and processing mode default (Economy/Thorough)
**And** upon submission, a new project is created with tenant_id automatically set
**And** the project appears in the project list

**Given** a project exists
**When** an Admin opens project settings
**Then** they can edit: project name, description, default processing mode, auto-pass threshold (default 95), and language pair configurations (FR53)
**And** changes are saved with audit trail entry

**Given** a QA Reviewer is logged in
**When** they access the project list
**Then** they can view projects assigned to their tenant but cannot create or delete projects

**Given** the projects table schema
**When** I inspect the database
**Then** the projects table includes: id, tenant_id, name, description, source_lang, target_langs (jsonb array of BCP-47 language codes per RFC 5646, e.g., `["th", "ja", "zh-Hans"]` — validated against ISO 639-1/639-3 standard), default_mode, auto_pass_threshold, created_at, updated_at
**And** language_pair_configs table exists with PROVISIONAL thresholds per language pair (EN→TH: 93, EN→JA: 93, EN→ZH: 94, default: 95) — these are provisional values requiring calibration during beta per Architecture Decision 3.6
**And** when a file is scored, system uses exact threshold from language_pair_configs for the file's language pair, or falls back to default 95 if config missing

### Story 1.4: Glossary Import & Management

As an Admin,
I want to import glossaries in CSV, TBX, and Excel formats and manage per-project overrides,
So that the QA engine can check terminology compliance against our approved terms.

**Acceptance Criteria:**

**Given** an Admin is on the project glossary page
**When** they click "Import Glossary" and select a CSV file with source/target term columns
**Then** terms are parsed and imported into the project's glossary
**And** a summary shows: `{ imported: N, duplicates: M, errors: [{ line, reason, code }] }` with specific error codes (e.g., EMPTY_SOURCE, INVALID_PAIR, MISSING_TARGET, DUPLICATE_ENTRY)

**Given** an Admin uploads a TBX (TermBase eXchange) file
**When** the import processes
**Then** TBX XML is parsed correctly preserving language-specific terms
**And** terms are mapped to the project's language pairs (FR40)

**Given** an Admin uploads an Excel glossary file
**When** the import processes
**Then** configurable column mapping allows selecting source/target columns
**And** terms are imported matching the configured mapping

**Given** a project has an imported glossary
**When** an Admin views the glossary management page
**Then** they see all terms with source, target, language pair, and status
**And** they can add, edit, or delete individual terms
**And** they can configure per-project overrides for approved terminology (FR41)

**Given** the glossary schema
**When** I inspect the database
**Then** glossaries table exists: id, project_id, tenant_id, name, format_source, created_at
**And** glossary_terms table exists: id, glossary_id, tenant_id, source_term, target_term, language_pair, notes, created_at
**And** glossary terms are cached using Next.js "use cache" + cacheTag per project, invalidated on mutation

**Given** a glossary with 500+ terms is imported
**When** I measure import performance
**Then** the import completes within 10 seconds
**And** the glossary index is precomputed on import (not on-the-fly matching)

### Story 1.5: Glossary Matching Engine for No-space Languages

As a QA Reviewer,
I want glossary terms to be accurately matched in Thai, Chinese, and Japanese text,
So that terminology compliance checks work correctly for languages without word boundaries.

**Acceptance Criteria:**

**Architecture Reference:** Decision 5.6 — Hybrid Glossary Matching Strategy (from Intl.Segmenter Research Spike 2026-02-15)

**Given** a project has a glossary with Thai terms
**When** the glossary matching engine processes a Thai target segment
**Then** terms are matched using the **Hybrid approach** per Architecture Decision 5.6: (1) Primary: substring search (`indexOf`) finds exact term occurrences, (2) Secondary: `Intl.Segmenter('th', { granularity: 'word' })` validates that match positions align to word boundaries
**And** Intl.Segmenter instances are cached per locale (singleton pattern) for performance (~2x improvement)
**And** text input is NFKC-normalized before matching (handles halfwidth/fullwidth variants)
**And** false negative rate is < 5% on reference test corpus at `docs/test-data/glossary-matching/th.json` containing 500+ annotated segments from production projects
**And** false positive rate is < 10% on reference test corpus (FR43)
**And** reference test corpus ownership: maintained by QA team, minimum 500 segments per language (Thai, Chinese, Japanese)

**Given** a glossary entry spans multiple Intl.Segmenter tokens (e.g., compound word in Chinese: 人工智能 → 人工+智能, or Thai: โรงพยาบาล → โรง+พยาบาล)
**When** matching runs on a segment containing the compound term
**Then** substring search finds the term regardless of how Intl.Segmenter splits it (substring is the primary strategy — not dependent on segmentation consistency)
**And** Intl.Segmenter boundary validation confirms the match starts and ends at segment boundaries using the `index` property from segmenter output
**And** if boundary validation fails (match does not align to segment edges), the match is accepted with a "Low boundary confidence" flag
**And** boundary validation failures are logged in TWO places per Architecture Decision 5.5: (1) Audit log entry: `{ action: 'glossary_boundary_mismatch', entity_type: 'segment', segment_id, term, match_position }`, (2) Structured pino log: `{ level: 'warn', msg: 'glossary_boundary_mismatch', segment_id, project_id, term, match_position }` (FR44)
**And** boundary mismatch rate is tracked per language pair for monitoring

**Given** a segment in Japanese with mixed scripts (hiragana, katakana, kanji)
**When** glossary matching runs
**Then** substring search finds terms across all script types (hiragana, katakana, kanji)
**And** Intl.Segmenter('ja') validates word boundaries (katakana loan words are reliably preserved as single segments; kanji compounds may be split but substring search handles this)
**And** glossary terms are matched regardless of script type

**Given** a segment in Chinese (Simplified)
**When** glossary matching runs
**Then** substring search finds terms regardless of Intl.Segmenter splitting behavior (e.g., 图书馆 is found even though segmenter splits it to 图书+馆)
**And** Intl.Segmenter('zh') validates boundaries where possible
**And** fullwidth punctuation is handled properly (`isWordLike: false` — not matched as term boundaries)
**And** note: Simplified vs Traditional Chinese may produce different segmentation boundaries (per research spike finding) — substring search is unaffected

**Given** a European language segment (EN→FR, EN→DE)
**When** glossary matching runs
**Then** standard word-boundary matching is used (Intl.Segmenter not required)
**And** diacritics are handled correctly (á, ñ, ü are not errors)

### Story 1.6: Taxonomy Mapping Editor

As an Admin,
I want to manage the mapping between internal QA Cosmetic terminology and industry-standard MQM categories,
So that the team sees familiar terms in the UI while reports export in MQM standard format.

**Acceptance Criteria:**

**Given** an Admin navigates to the Taxonomy Mapping page
**When** the page loads
**Then** a pre-populated mapping table shows: QA Cosmetic term ↔ MQM category ↔ severity level
**And** initial mappings are seeded from docs/QA _ Quality Cosmetic.md

**Given** the mapping table is displayed
**When** an Admin edits a mapping row
**Then** they can change: QA Cosmetic term, MQM category, severity level (Critical/Major/Minor)
**And** changes save immediately with audit trail entry (FR54)

**Given** an Admin adds a new mapping entry
**When** they fill in QA Cosmetic term, MQM category, and severity
**Then** the new mapping is added and available for the QA engine to use

**Given** an Admin deletes a mapping entry
**When** they confirm deletion
**Then** the mapping is removed (soft delete with audit trail)

**Given** the taxonomy system is configured
**When** findings are displayed in the review UI
**Then** QA Cosmetic terminology is shown (familiar to team)
**And** when findings are exported to reports, MQM standard terminology is used (FR55)

**Given** the taxonomy schema
**When** I inspect the database
**Then** taxonomy_definitions table exists: id, tenant_id, internal_name, mqm_category, mqm_subcategory, severity, description, is_active, created_at

### Story 1.7: Dashboard, Notifications & Onboarding

As a QA Reviewer,
I want a dashboard showing my recent activity and pending work, receive notifications for relevant events, and get guided onboarding on first use,
So that I can quickly orient myself and stay informed.

**Acceptance Criteria:**

**Given** a QA Reviewer logs in
**When** they land on the dashboard
**Then** they see: recent files (last 10), pending reviews count, auto-pass summary placeholder (populated after Story 7.1 ships — shows "Auto-pass setup pending" until then), and team activity feed (FR59)
**And** the dashboard TTI ≤ 2 seconds measured on Chrome DevTools with 4G throttling (NFR5)
**And** dashboard data is server-rendered (RSC) with client-side chart components

**Given** an Admin updates glossary terms for a project
**When** the change is saved
**Then** all QA Reviewers assigned to that project receive a notification: "Glossary updated: X terms added/modified" (FR45)
**And** notifications appear as toast (sonner) and persist in a notification dropdown

**Given** a first-time user logs in
**When** they reach the dashboard for the first time
**Then** an interactive onboarding tour activates via OnboardingTour component: 5-step walkthrough displayed as overlay step-by-step modals (not full-page): (1) Severity Levels — icon shapes + colors per level, explains Critical/Major/Minor, (2) Review Actions — demonstrates 7 actions with keyboard hotkeys, (3) Auto-pass — explains how files auto-pass and criteria, (4) Report Generation — PDF/Excel export + QA Certificate, (5) Keyboard Shortcuts — Ctrl+? toggles cheat sheet (FR62)
**And** each step highlights the relevant UI area with a spotlight overlay
**And** progress indicator shows current step: "Step N of 5"
**And** users can navigate: Next, Previous, Skip, or Dismiss at any step
**And** onboarding completion state is saved per user in user_preferences (does not re-appear)
**And** the tour is accessible via Help menu: "Restart Tour" option

> **UX Spec Refinement (2026-02-16):** UX spec (`component-strategy.md`) expands onboarding into a 2-phase tour system using `driver.js` (v1.3+): (1) **Setup Tour** — 2 steps on first login (Welcome, Create Project) triggered on dashboard, (2) **Review Tour** — the 5 steps defined above, triggered on first ReviewView entry. This separation was necessary because the 5 feature-focused steps require ReviewView UI elements to highlight, which don't exist at first login. Both tours track completion independently via server-side persistence (`users.metadata` jsonb). PM role gets a PM-Lite 3-step variant. Auto-pass threshold step was removed from Setup Tour — default 95 is sufficient for first-time users. Glossary/Upload tour steps moved to a Project-level tour (Epic 2) since those are nested routes inside projects. See `component-strategy.md#OnboardingTour` for full wireframes and interaction spec.

**Given** a first-time user reaches the dashboard after login
**When** `user.metadata.setup_tour_completed` is null
**Then** a 2-step Setup Tour activates via `driver.js` overlay: (1) Welcome — tool positioning vs Xbench, (2) Create Project — name + language pair (mentions glossary/upload are inside each project)
**And** each step highlights the relevant UI area with a spotlight overlay
**And** users can navigate: Next, Previous, Dismiss (pauses at current step), or Skip All (permanently completes)
**And** on completion, `user.metadata.setup_tour_completed` is set to current timestamp
**And** on mobile (<768px), Setup Tour is suppressed — banner shown instead: "Switch to desktop for the best onboarding experience"
> **Architecture Revision (2026-02-21):** Original spec had 4 steps — steps 3 (Import Glossary) and 4 (Upload First File) assumed top-level `/glossary` and `/upload` sidebar routes. Actual implementation: glossary/upload are nested routes inside `/projects/[projectId]/...` (per-project resources with `project_id` FK). No global glossary/upload page exists. Reduced Setup Tour to 2 steps to match real UI. Steps 3-4 deferred to Epic 2 as a Project-level tour when user enters a project for the first time.

**Given** the notification system
**When** events fire (glossary updated, analysis complete, file assigned, auto-pass triggered)
**Then** relevant users receive notifications via Supabase Realtime push (FR60 foundation — full implementation in Epic 6)

**Given** the dashboard on a mobile device (< 768px)
**When** the page loads
**Then** only dashboard summary cards and batch status list are shown
**And** a banner displays: "For the best review experience, use a desktop browser"

---
