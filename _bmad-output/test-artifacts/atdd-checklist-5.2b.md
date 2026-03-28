---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-03-28'
workflowType: testarch-atdd
inputDocuments:
  - _bmad-output/implementation-artifacts/5-2b-schema-rls-scoped-access.md
  - _bmad-output/planning-artifacts/research/rls-scoped-access-design-2026-03-26.md
  - src/db/__tests__/rls/helpers.ts
  - src/db/__tests__/rls/back-translation-cache.rls.test.ts
  - src/db/__tests__/rls/findings.rls.test.ts
  - src/types/finding.ts
---

# ATDD Checklist - Epic 5, Story 5.2b: Schema + RLS Scoped Access

**Date:** 2026-03-28
**Author:** Mona (TEA: Murat)
**Primary Test Level:** RLS Integration (Vitest `test:rls` workspace, runs against Supabase)

---

## Story Summary

Infrastructure-only story creating database schema and RLS policies for finding-level assignment and native reviewer scoped access. No UI, no Server Actions — purely schema + RLS + type definitions.

**As a** PM
**I want** the database schema and RLS policies for finding-level assignment and native reviewer scoped access
**So that** Story 5.2c can build the native reviewer workflow on a secure, tenant-isolated, role-scoped foundation

---

## Acceptance Criteria

1. **AC1:** `finding_assignments` table schema with all columns, UNIQUE constraint, RLS enabled
2. **AC2:** `finding_comments` table schema (immutable — no updatedAt), RLS enabled
3. **AC3:** `AssignmentStatus` union type (`'pending' | 'in_review' | 'confirmed' | 'overridden'`) + CHECK constraint
4. **AC4:** Performance indexes (4 new + 1 verified existing)
5. **AC5:** Role-scoped RLS policies on existing tables (findings, segments, review_actions)
6. **AC6:** RLS policies on new tables (finding_assignments, finding_comments)
7. **AC7:** RLS integration tests — 14-case role × operation matrix
8. **AC8:** Drizzle relations & schema export

---

## Test Strategy

### Risk Assessment

| AC | Risk Level | Justification |
|----|-----------|---------------|
| AC5 | **HIGH** | Modifying existing RLS policies — regression risk on findings/segments/review_actions |
| AC6 | **HIGH** | Security-critical — new table access control |
| AC7 | **CRITICAL** | Verification gate — proves all policies work correctly |
| AC1-2 | MEDIUM | Schema DDL — migration verified |
| AC3 | LOW | Type definition — `type-check` catches |
| AC4 | MEDIUM | Index existence — verified in RLS test setup |
| AC8 | LOW | Schema wiring — `type-check` + `db:generate` catches |

### Test Levels

| Level | Files | Tests | Justification |
|-------|-------|-------|---------------|
| **RLS Integration** | 2 files | **22 tests** | P0: Security-critical role-scoped access |
| Unit (type-check) | 0 files | 0 tests | AC3/AC8 verified by `npm run type-check` |
| E2E | 0 files | 0 tests | No UI in this story |

### No Duplicate Coverage

- RLS tests cover AC5/AC6/AC7 (security + correctness)
- `npm run type-check` covers AC3/AC8 (type safety)
- `npm run db:migrate` covers AC1/AC2/AC4 (schema DDL)
- No overlap between levels

---

## Failing Tests Created (RED Phase)

### RLS Integration Tests — File 1: finding_assignments + finding_comments (12 tests)

**File:** `src/db/__tests__/rls/finding-assignments-rls.test.ts`

**describe: finding_assignments RLS**

- `it.skip` **admin SELECT all tenant assignments** — AC6 (P0)
  - Status: RED — table `finding_assignments` does not exist
  - Verifies: Admin can see all assignments within tenant

- `it.skip` **admin INSERT assignments** — AC6 (P0)
  - Status: RED — table does not exist
  - Verifies: Admin can create assignments

- `it.skip` **admin DELETE assignments** — AC6 (P1)
  - Status: RED — table does not exist
  - Verifies: Admin-only DELETE permission

- `it.skip` **qa_reviewer SELECT all tenant assignments** — AC6 (P0)
  - Status: RED — table does not exist
  - Verifies: QA reviewer has full tenant SELECT

- `it.skip` **native_reviewer SELECT only own assignments** — AC6 (P0)
  - Status: RED — table does not exist + no RLS policy
  - Verifies: `assigned_to = jwt.sub` scoping

- `it.skip` **native_reviewer INSERT denied** — AC6 (P0)
  - Status: RED — table does not exist
  - Verifies: Native reviewers cannot create assignments

- `it.skip` **native_reviewer UPDATE reassign denied (WITH CHECK)** — AC6/AC7 (P0)
  - Status: RED — table does not exist + no WITH CHECK
  - Verifies: `assigned_to = jwt.sub` WITH CHECK prevents self-reassignment

- `it.skip` **cross-tenant Tenant B → 0 rows** — AC7 (P0)
  - Status: RED — table does not exist
  - Verifies: Tenant isolation on finding_assignments

**describe: finding_comments RLS**

- `it.skip` **native_reviewer INSERT comment on own assignment** — AC6/AC7 (P0)
  - Status: RED — table does not exist + no policy
  - Verifies: Assignment ownership + author_id check

- `it.skip` **native_reviewer SELECT comments on own assignments** — AC6 (P0)
  - Status: RED — table does not exist
  - Verifies: EXISTS on finding_assignments scoping

- `it.skip` **native_reviewer DELETE denied (admin-only)** — AC7 (P0)
  - Status: RED — table does not exist + no DELETE policy for native
  - Verifies: Admin-only DELETE on comments

- `it.skip` **UPDATE denied on comments (immutable)** — AC2/AC6 (P1)
  - Status: RED — table does not exist + no UPDATE policy
  - Verifies: Comments are immutable — no UPDATE policy exists

---

### RLS Integration Tests — File 2: Native Reviewer Scoped Access (14 tests)

**File:** `src/db/__tests__/rls/native-reviewer-scoped-access-rls.test.ts`

**describe: findings — native reviewer scoped access**

- `it.skip` **0 findings when no assignments** — AC7 (P0)
  - Status: RED — old tenant-only policy returns all findings
  - Verifies: EXISTS subquery returns 0 rows when no assignments

- `it.skip` **only assigned findings returned** — AC7 (P0)
  - Status: RED — old policy returns all findings
  - Verifies: Native sees only finding linked via finding_assignments

- `it.skip` **UPDATE assigned finding → success** — AC5/AC7 (P0)
  - Status: RED — no `findings_update_native` policy
  - Verifies: Native can update findings they're assigned to

- `it.skip` **UPDATE non-assigned finding → 0 rows** — AC7 (P0)
  - Status: RED — old policy allows all tenant updates
  - Verifies: Non-assigned findings are invisible to UPDATE

**describe: segments — native reviewer scoped access**

- `it.skip` **only segments linked to assigned findings** — AC5/AC7 (P0)
  - Status: RED — old tenant-only policy returns all segments
  - Verifies: EXISTS via findings→finding_assignments JOIN

**describe: review_actions — native reviewer scoped access**

- `it.skip` **INSERT review_action on assigned finding → success** — AC5/AC7 G1 (P0)
  - Status: RED — no `review_actions_insert_native` policy (G1 gap)
  - Verifies: G1 fix — native reviewers can create review actions

- `it.skip` **INSERT review_action on non-assigned finding → denied** — AC7 (P0)
  - Status: RED — old INSERT policy allows any tenant user
  - Verifies: Assignment-scoped INSERT restriction

**describe: finding_comments — native reviewer scoped access**

- `it.skip` **INSERT comment on own assignment → success** — AC7 (P0)
  - Status: RED — table does not exist
  - Verifies: Native can comment on findings they're assigned to

- `it.skip` **INSERT comment on unassigned → denied** — AC7 (P0)
  - Status: RED — table does not exist
  - Verifies: Assignment ownership required for commenting

**describe: regression — admin + qa_reviewer full tenant access**

- `it.skip` **qa_reviewer SELECT all tenant findings (no regression)** — AC5/AC7 (P0)
  - Status: RED — policy being replaced, must verify no regression
  - Verifies: QA reviewer still sees all tenant findings after policy change

- `it.skip` **admin SELECT all tenant findings (no regression)** — AC5/AC7 (P0)
  - Status: RED — policy being replaced, must verify no regression
  - Verifies: Admin still sees all tenant findings after policy change

**describe: cross-tenant — native reviewer isolation**

- `it.skip` **cross-tenant native_reviewer → 0 rows** — AC7 (P0)
  - Status: RED — Tenant B native reviewer must see 0 Tenant A data
  - Verifies: Tenant isolation maintained with role-scoped policies

---

## Data Factories

**No new factories needed.** Test data is seeded directly via `admin` client (service_role) in `beforeAll`, following the established RLS test pattern in this project. All existing factories in `src/test/factories.ts` are for unit tests — RLS tests use Supabase PostgREST for data setup.

---

## Fixtures

**No Playwright fixtures needed.** RLS tests use Vitest `beforeAll`/`afterAll` with the existing `helpers.ts` pattern:
- `setupTestTenant(email)` → creates tenant + admin user + JWT
- `tenantClient(jwt)` → creates RLS-subject Supabase client
- `cleanupTestTenant(tenant)` → removes auth user + tenant data

### New Helper Pattern: Multi-Role User Setup

Tests create additional users (qa_reviewer, native_reviewer) within a tenant using:
```typescript
// 1. Create auth user
const { data: authUser } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
// 2. Insert users + user_roles rows
await admin.from('users').insert({ id: authUser.user.id, tenant_id, email, display_name })
await admin.from('user_roles').insert({ user_id: authUser.user.id, tenant_id, role: 'native_reviewer' })
// 3. Set JWT claims
await admin.auth.admin.updateUserById(authUser.user.id, { app_metadata: { tenant_id, user_role: 'native_reviewer' } })
// 4. Sign in via separate anonClient (NOT admin — avoid session pollution)
const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
const { data: session } = await anonClient.auth.signInWithPassword({ email, password })
```

**Cleanup order** (FK RESTRICT on tenants.id):
1. `finding_comments` → `finding_assignments` → `review_actions` (new table data)
2. Extra users: `user_roles` → `users` → `auth.admin.deleteUser()`
3. `cleanupTestTenant()` for primary tenant users

---

## Mock Requirements

**None.** RLS tests run against real Supabase (local via `npx supabase start`). No external service mocking needed.

---

## Required data-testid Attributes

**None.** This is an infrastructure-only story with no UI components.

---

## Implementation Checklist

### Phase 1: Types + Schema (AC3, AC1, AC2, AC8)

- [ ] Create `src/types/assignment.ts` — `ASSIGNMENT_STATUSES` const + `AssignmentStatus` type
- [ ] Create `src/db/schema/findingAssignments.ts` — follow `fileAssignments.ts` pattern
- [ ] Create `src/db/schema/findingComments.ts` — no `updatedAt` (immutable)
- [ ] Update `src/db/schema/relations.ts` — 2 new + 5 updated relation blocks
- [ ] Update `src/db/schema/index.ts` — export new schemas + relations
- [ ] Run: `npm run type-check` (verify types compile)

### Phase 2: Drizzle Migration (AC1, AC2, AC4)

- [ ] Run: `npm run db:generate` — auto-creates migration SQL
- [ ] Verify table creation order: `finding_assignments` BEFORE `finding_comments`
- [ ] Add CHECK constraint: `chk_finding_assignments_status`
- [ ] Do NOT add `ENABLE ROW LEVEL SECURITY` here (goes in Supabase migration)
- [ ] Run: `npm run db:migrate`

### Phase 3: Fix TD-DB-006 (Quick Fix)

- [ ] Delete orphan `src/db/migrations/0014_typical_gauntlet.sql`
- [ ] Add `uq_scores_file_tenant` UNIQUE constraint to Supabase migration (Section 8)

### Phase 4: Supabase RLS Migration (AC5, AC6)

- [ ] Create `supabase/migrations/00026_story_5_2b_rls_scoped_access.sql`
- [ ] Wrap in `BEGIN; ... COMMIT;` (Guardrail #63)
- [ ] Section 0: `ENABLE ROW LEVEL SECURITY` on new tables
- [ ] Section 1: findings — DROP old SELECT/UPDATE → CREATE role-scoped (4 policies)
- [ ] Section 2: segments — DROP old SELECT → CREATE role-scoped (2 policies)
- [ ] Section 3: review_actions — DROP old SELECT → CREATE role-scoped + ADD `review_actions_insert_native` (G1 fix)
- [ ] Section 4: finding_assignments — 6 policies (SELECT×2, INSERT, UPDATE×2, DELETE)
- [ ] Section 5: finding_comments — 5 policies (SELECT×2, INSERT×2, DELETE — NO UPDATE)
- [ ] Section 6: 4 performance indexes (CREATE INDEX IF NOT EXISTS)
- [ ] Section 7: Realtime publication for finding_assignments
- [ ] Section 8: TD-DB-006 scores unique constraint
- [ ] Verify: existing INSERT/DELETE policies on findings/segments/review_actions NOT dropped
- [ ] Run: apply migration to local Supabase

### Phase 5: Unskip Tests + GREEN Phase (AC7)

- [ ] Remove `it.skip` → `it` on all 22 tests
- [ ] Run: `npm run test:rls`
- [ ] All 22 tests GREEN
- [ ] Run: `npm run test:unit` (no regression)
- [ ] Run: `npm run type-check` (no errors)
- [ ] Run: `npm run lint` (no errors)

---

## Running Tests

```bash
# Run all RLS tests (requires `npx supabase start`)
npm run test:rls

# Run only finding-assignments RLS tests
npx vitest run src/db/__tests__/rls/finding-assignments-rls.test.ts --project rls

# Run only native-reviewer scoped access RLS tests
npx vitest run src/db/__tests__/rls/native-reviewer-scoped-access-rls.test.ts --project rls

# Run all unit tests (regression check)
npm run test:unit

# Type check (AC3/AC8 verification)
npm run type-check

# Lint check
npm run lint
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- All 22 tests written as `it.skip()` stubs (failing)
- Test setup includes multi-role user creation (admin, qa_reviewer, native_reviewer)
- Both positive (allowed) and negative (denied) cases covered
- Cross-tenant isolation verified
- Cleanup order handles FK RESTRICT constraints

**Verification:**

- All tests use `it.skip()` — will fail when unskipped because:
  - `finding_assignments` table does not exist yet
  - `finding_comments` table does not exist yet
  - RLS policies not yet replaced with role-scoped versions
  - `review_actions_insert_native` policy does not exist (G1 gap)

---

### GREEN Phase (DEV Team - Next Steps)

1. Complete Phase 1-4 (types, schema, migrations)
2. Unskip tests one section at a time
3. Run `npm run test:rls` after each migration step
4. Fix any failing tests by adjusting migration SQL

### REFACTOR Phase

1. Verify all 22 tests pass
2. Run full suite: `npm run test:unit && npm run type-check && npm run lint`
3. Verify migration idempotency: running `db:migrate` again has no effect
4. Verify TD-DB-006 orphan file deleted + constraint applied

---

## Boundary Value Tests (Guardrail: MANDATORY)

| AC | Boundary | Test |
|----|----------|------|
| AC5 | Native with 0 assignments | `0 findings when no assignments` |
| AC5 | Native with 1 assignment (edge) | `only assigned findings returned` |
| AC6 | INSERT with wrong tenant_id | `cross-tenant → 0 rows` |
| AC6 | UPDATE with reassignment attempt | `reassign denied by WITH CHECK` |
| AC7 | Cross-tenant native reviewer | `cross-tenant native_reviewer → 0 rows` |

---

## Next Steps

1. **Share this checklist** with dev agent (`bmad-dev-story`)
2. **Run failing tests** to confirm RED phase: `npm run test:rls` (all skip)
3. **Begin implementation** Phase 1 → Phase 4 in order
4. **Unskip + GREEN** after all migrations applied
5. **Pre-CR quality scan**: 4 agents (anti-pattern, tenant-isolation, code-quality, code-reviewer)

---

## Knowledge Base References Applied

- **data-factories.md** — Factory patterns (project uses direct admin seeding for RLS tests)
- **test-levels-framework.md** — Test level selection (RLS Integration = primary for this story)
- **test-priorities-matrix.md** — P0-P3 priority assignment (security = P0)
- **risk-governance.md** — Risk scoring for RLS policy changes (HIGH)
- **test-quality.md** — Isolation, determinism, cleanup discipline

---

## Notes

- **This story has NO E2E tests** — infrastructure only (schema + RLS + types)
- **22 RLS tests** cover the full AC7 matrix (14 cases) + additional AC6 table-specific tests
- **Multi-role setup** is more complex than existing RLS tests — creates 3 roles per tenant (admin, qa_reviewer, native_reviewer)
- **Cleanup order is critical** — FK RESTRICT on `tenants.id` means all child rows must be deleted before tenant cleanup
- **G1 fix (review_actions INSERT)** is the most critical policy addition — without it, Story 5.2c's native reviewer confirm/override will be blocked at DB level
- **`findings_update_native` policy** is equally critical — must be included in migration or native reviewers cannot change finding status

---

**Generated by BMad TEA Agent (Murat)** — 2026-03-28
