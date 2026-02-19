---
stepsCompleted:
  - step-01-preflight
  - step-02-generate-pipeline
  - step-03-configure-quality-gates
  - step-04-validate-and-summary
lastStep: step-04-validate-and-summary
lastSaved: '2026-02-19'
---

# CI/CD Pipeline Setup — QA Localization Tool

## Platform

- **CI Provider:** GitHub Actions
- **Repository:** `Jirawatpyk/QA-Localization-tool`
- **Node.js:** 20 LTS
- **Package Manager:** npm

## Preflight Results

| Check | Status | Detail |
|-------|--------|--------|
| Git repository | PASS | Remote configured (github.com) |
| Playwright | PASS | v1.58.2, config at `playwright.config.ts` |
| Vitest | PASS | v4.0.18, config at `vitest.config.ts` |
| Existing CI | FOUND | 3 stub workflows upgraded in-place |

## Workflows

### 1. Quality Gate (`quality-gate.yml`)

**Trigger:** PR to main, push to main, manual dispatch

**Pipeline:** Lint → Type Check → Unit Tests (with coverage) → Build

**Env vars needed:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Artifacts:** Coverage report (7 days retention)

**Notes:**
- Unit tests run in jsdom environment (no external services needed)
- Build uses Proxy-based lazy init (env.ts) — succeeds without server-side env vars
- NEXT_PUBLIC_* vars embedded in client bundle at build time

### 2. E2E Gate (`e2e-gate.yml`)

**Trigger:** Push to main, manual dispatch

**Pipeline:** Install → Playwright Browsers → E2E Tests

**Env vars needed (real secrets):**
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase Cloud project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Cloud anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Cloud service role key
- `DATABASE_URL` — Supabase Cloud PostgreSQL connection string
- `E2E_TEST_PASSWORD` — Password for E2E test user creation

**Env vars (CI placeholders, not real):**
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — `ci-placeholder`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` — `ci-placeholder`
- `UPSTASH_REDIS_REST_URL` — `http://localhost:6379`
- `UPSTASH_REDIS_REST_TOKEN` — `ci-placeholder`

**Artifacts:** Playwright HTML report (always), traces on failure (7 days)

**Notes:**
- Playwright starts dev server via `webServer` config (`npm run dev`)
- Rate limiter fails-open in dev mode (no real Upstash needed)
- E2E auth tests create unique users per run (`e2e-{timestamp}@test.local`)

### 3. Chaos Test (`chaos-test.yml`)

**Trigger:** Weekly (Sunday 03:00 UTC), manual dispatch

**Status:** Placeholder — scenarios to be added in Epic 3

## Quality Gates

| Gate | Threshold | Enforcement |
|------|-----------|-------------|
| Lint | Zero errors | quality-gate (blocks merge) |
| Type check | Zero errors | quality-gate (blocks merge) |
| Unit tests | 100% pass | quality-gate (blocks merge) |
| Build | Success | quality-gate (blocks merge) |
| E2E tests | 100% pass | e2e-gate (push to main) |

## GitHub Secrets Setup Guide

Go to **Repository Settings → Secrets and variables → Actions → New repository secret**

### Required Secrets (5)

| Secret Name | Source | Description |
|-------------|--------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API | Project URL (e.g., `https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API | Service role key (server-only) |
| `DATABASE_URL` | Supabase Dashboard → Settings → Database | PostgreSQL connection string (Session mode, port 5432) |
| `E2E_TEST_PASSWORD` | Your choice | Password for E2E test users (e.g., `TestPassword123!`) |

### Steps

1. Open https://github.com/Jirawatpyk/QA-Localization-tool/settings/secrets/actions
2. Click "New repository secret" for each secret above
3. Copy values from your Supabase Cloud dashboard and `.env.local`
4. Push to main to trigger both workflows

## Concurrency

Both workflows use concurrency groups with `cancel-in-progress: true`:
- Only one run per branch at a time
- New pushes cancel in-progress runs (saves CI minutes)

## Estimated CI Times

| Workflow | Estimated Duration |
|----------|-------------------|
| Quality Gate | ~3-5 min |
| E2E Gate | ~5-8 min |
| Chaos Test | < 1 min (placeholder) |
