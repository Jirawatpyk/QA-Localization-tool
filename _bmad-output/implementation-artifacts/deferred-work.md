# Deferred Work — Auth & Multi-tenancy Adversarial Review

**Source:** Adversarial Review (2026-03-26)
**Deferred by:** Quick Dev New workflow — split decision

## Deferred Goals

### ~~Goal D — Inngest Event tenantId Validation (Finding #5)~~ ✅ DONE (2026-03-26)
- Added Zod `.uuid()` validation on tenantId in processBatch, processFile, batchComplete
- NonRetriableError thrown on invalid tenantId

### ~~Goal H — Rate Limiting & Compensation (Findings #11, #13)~~ ✅ DONE (2026-03-26)
- #11: Swapped IP priority: x-real-ip first (Vercel-set, not spoofable), x-forwarded-for fallback
- #13: Added retry (max 2) + error logging for orphaned auth user compensation

### Goal F — Tenant Resource Limits (Finding #9)
- Add per-tenant user quota (e.g., max users per plan tier)
- New feature, requires schema + enforcement logic

### ~~Goal A Full — Architectural Tenant Isolation (Findings #1, #6)~~ ✅ DONE (2026-03-26)
- #1: ✅ DONE — Branded `TenantId` type enforces compile-time safety on `withTenant()` (commit `473f50e`, 69 files)
- #6: ✅ DONE — Denormalized tenant_id into glossaryTerms table + RLS + withTenant on all 15 query sites

### Goal C Remaining — Account Lockout (Finding #12)
- Per-account lockout after N failed login attempts (distributed IP protection)
- Requires Supabase Auth hook or custom middleware

### Goal A#3 — setupNewUser Rate Limit (Finding #3)
- Add rate limiting specific to setupNewUser server action
- Prevent tenant spam from leaked session cookies

## Deferred from Code Review (Step 4)

### ~~Idle Timeout UX Improvements (Review F4+F5)~~ ✅ DONE (2026-03-26)
- Added `visibilitychange` listener to pause/resume timer when tab hidden/visible
- Added warning toast at T-5 minutes before session expiry
- 5 tests covering: no-timeout, warning-at-25min, timeout-at-30min, activity-reset, background-tab-pause
