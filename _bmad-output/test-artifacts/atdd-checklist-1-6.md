---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-20'
story_id: '1-6'
story_name: 'Taxonomy Mapping Editor'
---

# ATDD Checklist: Story 1.6 — Taxonomy Mapping Editor

## Step 1: Preflight & Context Loading

### Story Context

**Story ID:** 1.6
**Story Title:** Taxonomy Mapping Editor
**Status:** ready-for-dev
**User:** Admin
**Goal:** Manage mapping between internal QA Cosmetic terminology and MQM standard categories

### Acceptance Criteria (6 ACs)

| # | AC | Testable Behavior |
|---|----|--------------------|
| AC1 | Taxonomy page loads with pre-populated mapping table | Page shows seeded mappings: internal_name ↔ MQM category ↔ severity |
| AC2 | Admin edits a mapping row | Can change internal_name, MQM category, severity; changes save with audit trail |
| AC3 | Admin adds a new mapping entry | New mapping created, available to QA engine |
| AC4 | Admin soft-deletes a mapping | Mapping soft-deleted (is_active=false) with audit trail |
| AC5 | Findings display: QA Cosmetic terms; Export: MQM terms | READ-TIME mapping — UI shows internal_name; reports use MQM category |
| AC6 | Cache invalidation on any mutation | revalidateTag('taxonomy') fires on create/update/delete |

### Framework Configuration

- **Test Framework:** Playwright
- **Test Directory:** `./e2e`
- **Base URL:** `http://localhost:3000`
- **Browser:** Chromium only
- **Web Server:** `npm run dev` (auto-start)
- **tea_use_playwright_utils:** true
- **tea_browser_automation:** auto

### Affected Components

- `src/app/(app)/admin/taxonomy/page.tsx` (new RSC page)
- `src/app/(app)/admin/layout.tsx` (new admin sub-navigation)
- `src/features/taxonomy/components/TaxonomyManager.tsx` (client entry)
- `src/features/taxonomy/components/TaxonomyMappingTable.tsx` (data table)
- `src/features/taxonomy/components/AddMappingDialog.tsx` (add dialog)
- `src/features/taxonomy/actions/*.action.ts` (CRUD server actions)
- `src/lib/cache/taxonomyCache.ts` (cache layer)
- `src/db/schema/taxonomyDefinitions.ts` (schema migration)

### Knowledge Fragments Loaded

- `data-factories.md` ✅
- `test-quality.md` ✅
- `auth-session.md` ✅
- `selector-resilience.md` ✅
- Playwright Utils: `network-recorder.md`, `intercept-network-call.md`, `fixtures-composition.md` ✅

---

## Step 2: Generation Mode

**Mode Selected:** AI Generation

**Rationale:** Story 1.6 is standard admin CRUD UI (table view, inline edit, add dialog, soft delete). All acceptance criteria describe well-defined user journeys without complex multi-step state, drag/drop, or wizard flows. AI generation from acceptance criteria is optimal.

**Browser automation:** `auto` — will use MCP tools for UI verification if needed. Since the UI doesn't exist yet (TDD red phase), no browser recording needed — generate selectors from best practices.

---

## Step 3: Test Strategy

### AC → Test Level Mapping

| AC | Scenario | Level | Priority | Reason |
|----|----------|-------|----------|--------|
| AC1 | Page loads with pre-seeded mapping table | **E2E** | P0 | Critical: data visible to user = end-to-end verification |
| AC1 | Navigation to /admin/taxonomy works | **E2E** | P0 | Admin can reach the page |
| AC2 | Edit inline: change internal_name | **E2E** | P0 | Core CRUD edit |
| AC2 | Edit inline: change severity level | **E2E** | P1 | Edit variant |
| AC2 | Edit inline: change MQM category | **E2E** | P1 | Edit variant |
| AC2 | Audit trail written on edit | **API (unit)** | P1 | Audit = server action test, not E2E |
| AC3 | Add new mapping via dialog | **E2E** | P0 | Core CRUD create |
| AC3 | Validation: missing required fields | **E2E** | P1 | Error handling |
| AC4 | Delete mapping (soft delete, with confirm dialog) | **E2E** | P0 | Core CRUD delete |
| AC4 | Deleted mapping no longer shown | **E2E** | P0 | Soft delete = hidden, not removed |
| AC5 | Findings UI shows internal_name (not MQM) | **E2E** | P1 | Read-time mapping (future Epic 2+ test) |
| AC6 | Cache invalidated after mutation | **Unit** | P1 | revalidateTag tested via unit test on action |
| Auth | Non-admin redirected away from /admin/taxonomy | **E2E** | P0 | RBAC critical path |
| Error | Add mapping with duplicate internal_name | **E2E** | P2 | Edge case |

**AC5 Note:** Full E2E test for AC5 (findings display) requires Epic 2 (file upload + QA pipeline). This story only covers the taxonomy admin UI. AC5 E2E is deferred; coverage via unit test on getCachedTaxonomyMappings return values.

**Primary test level:** E2E (admin UI flows)
**Supporting level:** Unit tests for server actions (CRUD + audit + cache) — these belong in Story 1.6 dev tasks (co-located), NOT in e2e/

### E2E Test Files to Create

| File | ACs | Tests |
|------|-----|-------|
| `e2e/taxonomy-admin.spec.ts` | AC1, AC2, AC3, AC4, Auth | 8 E2E tests |

### Unit Tests (in story, not ATDD scope)

Story 1.6 Dev Notes already specify ~25-35 unit tests co-located in feature module. Those are dev responsibility, not ATDD E2E scope.

### Red Phase Requirements

All E2E tests use `test.skip()` because:
- `/admin/taxonomy` page does not exist yet
- `admin/layout.tsx` with tab nav does not exist yet
- TaxonomyMappingTable, AddMappingDialog not yet implemented
- Tests assert EXPECTED UI behavior → will fail until implementation complete

### data-testid Requirements for Dev Team

| Element | data-testid | Page/Component |
|---------|-------------|----------------|
| Taxonomy mapping table | `taxonomy-mapping-table` | TaxonomyMappingTable.tsx |
| Table row (per mapping) | `taxonomy-row-{id}` | TaxonomyMappingTable.tsx |
| Edit button per row | `edit-mapping-{id}` | TaxonomyMappingTable.tsx |
| Save edit button per row | `save-mapping-{id}` | TaxonomyMappingTable.tsx |
| Cancel edit button per row | `cancel-mapping-{id}` | TaxonomyMappingTable.tsx |
| Delete button per row | `delete-mapping-{id}` | TaxonomyMappingTable.tsx |
| Confirm delete button | `confirm-delete-mapping` | AlertDialog |
| Add mapping button | `add-mapping-btn` | TaxonomyManager.tsx |
| Add mapping dialog | `add-mapping-dialog` | AddMappingDialog.tsx |
| Internal name input (add) | `internal-name-input` | AddMappingDialog.tsx |
| MQM category input (add) | `mqm-category-input` | AddMappingDialog.tsx |
| Severity select (add) | `severity-select` | AddMappingDialog.tsx |
| Description input (add) | `description-input` | AddMappingDialog.tsx |
| Submit add mapping | `submit-add-mapping` | AddMappingDialog.tsx |
| Admin tab: Taxonomy | `admin-tab-taxonomy` | admin/layout.tsx |
| Admin tab: User Management | `admin-tab-users` | admin/layout.tsx |
| Inline internal_name field | `inline-internal-name-{id}` | TaxonomyMappingTable.tsx |
| Inline severity select | `inline-severity-{id}` | TaxonomyMappingTable.tsx |
| Inline MQM category field | `inline-category-{id}` | TaxonomyMappingTable.tsx |

---

## Step 4: Generated Failing Tests

### Subprocess A: API Tests

**Result:** N/A — Story 1.6 uses Next.js **Server Actions**, not REST HTTP endpoints.
Server action behavior is covered by:
1. **Unit tests** (dev responsibility) — co-located in `src/features/taxonomy/actions/*.action.test.ts`
2. **E2E tests** (via UI interaction, tested below)

### Subprocess B: E2E Tests ✅

**File created:** `e2e/taxonomy-admin.spec.ts`
**TDD Phase:** RED (all tests use `test.skip()`)

| # | Test Name | AC | Priority | Status |
|---|-----------|-----|----------|--------|
| 1 | [setup] signup and navigate to /admin/taxonomy via tab nav | AC1, Nav | P0 | 🔴 RED |
| 2 | [P0] AC1 — pre-populated taxonomy mapping table on page load | AC1 | P0 | 🔴 RED |
| 3 | [P0] AC1 — admin sub-navigation with Taxonomy Mapping tab | AC1 | P0 | 🔴 RED |
| 4 | [P0] AC2 — edit internal_name inline and save | AC2 | P0 | 🔴 RED |
| 5 | [P1] AC2 — edit severity level inline and save | AC2 | P1 | 🔴 RED |
| 6 | [P1] AC2 — cancel inline edit without saving | AC2 | P1 | 🔴 RED |
| 7 | [P0] AC3 — add new mapping via dialog | AC3 | P0 | 🔴 RED |
| 8 | [P1] AC3 — validation error when required fields missing | AC3 | P1 | 🔴 RED |
| 9 | [P0] AC4 — soft-delete mapping with confirmation | AC4 | P0 | 🔴 RED |
| 10 | [P1] AC4 — cancel deletion in confirmation dialog | AC4 | P1 | 🔴 RED |
| 11 | [P0] Auth gate — unauthenticated user redirected | Auth | P0 | 🔴 RED |

**Total: 11 tests (all RED — test.skip)**
**P0 tests: 6 | P1 tests: 5**

### AC Coverage Summary

| AC | Covered By | Test Count |
|----|-----------|-----------|
| AC1 | Tests #1, #2, #3 | 3 |
| AC2 | Tests #4, #5, #6 | 3 |
| AC3 | Tests #7, #8 | 2 |
| AC4 | Tests #9, #10 | 2 |
| AC5 | Deferred (requires Epic 2 pipeline) | 0 |
| AC6 | Unit test (dev responsibility, revalidateTag) | 0 (E2E) |
| Auth | Test #11 | 1 |

**AC5 Deferral Note:** Full E2E for AC5 (findings display using internal_name, exports using MQM category) requires Epic 2 file processing pipeline. This is documented as a deferred test. Story 1.6 only implements the taxonomy editor admin UI.

**AC6 Note:** `revalidateTag('taxonomy')` is server-side cache invalidation — verified via unit test on each action (dev responsibility). E2E indirectly covers this when data is refreshed after mutations.

### Supporting Infrastructure

#### Fixture Needs

No new test fixtures required for this story. Tests use:
- `TEST_EMAIL` + `TEST_PASSWORD` env vars (established pattern from existing E2E tests)
- Serial test flow with one user account created in `[setup]` test
- Pre-seeded taxonomy data from `src/db/seeds/taxonomySeed.ts`

#### Mock Requirements

No external API mocking needed — Supabase local + Drizzle (same as other E2E tests).

---

## Step 5: Implementation Checklist

### RED Phase Complete ✅

TEA has generated failing E2E tests. All tests use `test.skip()` and will fail until implementation.

### GREEN Phase — Tasks for Dev Agent

#### Phase 1: Make auth test pass
- [ ] Ensure `/admin/taxonomy` redirects non-admin users
- Remove `test.skip()` from auth test and verify pass

#### Phase 2: Make page load test pass
- [ ] Create `src/app/(app)/admin/layout.tsx` with tab navigation
- [ ] Create `src/app/(app)/admin/taxonomy/page.tsx` (RSC)
- [ ] Create `src/lib/cache/taxonomyCache.ts`
- [ ] Add all `data-testid` attributes listed above
- Run seed migration so pre-populated data appears
- Remove `test.skip()` from AC1 tests and verify pass

#### Phase 3: Make CRUD tests pass
- [ ] Implement TaxonomyMappingTable with inline editing
- [ ] Implement AddMappingDialog
- [ ] Implement all server actions (create, update, delete, reorder)
- Remove `test.skip()` from AC2/AC3/AC4 tests and verify pass

### Execution Commands

```bash
# Run all taxonomy E2E tests (headed for debugging)
npx playwright test e2e/taxonomy-admin.spec.ts --headed

# Run single test (by name)
npx playwright test e2e/taxonomy-admin.spec.ts -g "page loads"

# Run all E2E
npm run test:e2e

# Debug mode
npx playwright test e2e/taxonomy-admin.spec.ts --debug

# Run only P0 tests
npx playwright test e2e/taxonomy-admin.spec.ts -g "\[P0\]"
```

---

## Step 5: TDD Red Phase Validation

### Validation Against Checklist

| Check | Status |
|-------|--------|
| Story ACs identified and extracted (all 6) | ✅ |
| Framework config loaded (playwright.config.ts) | ✅ |
| Test directory identified (`./e2e`) | ✅ |
| All tests use `test.skip()` (RED phase) | ✅ |
| All tests assert EXPECTED behavior (not placeholders) | ✅ |
| Resilient selectors used (getByRole, getByLabel, getByText, getByTestId) | ✅ |
| One logical assertion per test | ✅ |
| No hard waits/sleeps | ✅ |
| No test interdependencies (except serial setup test) | ✅ |
| Fixture needs documented | ✅ |
| data-testid requirements listed for Dev team | ✅ |
| No CLI sessions to clean up (AI generation mode, no browser recording) | ✅ |

### Key Risks & Assumptions

| Risk | Mitigation |
|------|-----------|
| Serial test order dependency | `[setup]` test creates user; later tests do fresh `login()` per test. Only AC3→AC4 dependency (AC4 deletes row created in AC3). |
| Seed data not yet applied | Migration + seed must run before removing `test.skip()` from AC1 tests |
| `TEST_EMAIL` uniqueness | Uses `Date.now()` suffix — safe for parallel runs if isolated |
| AC5 test deferred | Documented — will be added when Epic 2 pipeline is implemented |

### Completion Summary

- **Story ID:** 1.6
- **Primary test level:** E2E (Playwright)
- **E2E test count:** 11 (all RED — test.skip)
- **API test count:** 0 (Server Actions — no REST endpoints)
- **E2E test file:** `e2e/taxonomy-admin.spec.ts`
- **ATDD checklist:** `_bmad-output/test-artifacts/atdd-checklist-1-6.md`
- **data-testid requirements:** 18 attributes (see Step 3 table above)
- **Implementation task count:** See Story 1.6 Tasks (6 tasks, 22 subtasks)
- **Estimated E2E effort to pass GREEN:** 0.5 day after UI implementation complete

### Next Recommended Workflow

After Dev Agent implements Story 1.6:
1. Remove `test.skip()` from all tests in `e2e/taxonomy-admin.spec.ts`
2. Run `npx supabase start` + `npm run db:migrate` (applies seed)
3. Run `npx playwright test e2e/taxonomy-admin.spec.ts --headed`
4. Fix any failures (test gaps or implementation gaps)
5. Run full E2E suite: `npm run test:e2e`
6. If all pass → move story to **done**

Optional: Run `/bmad-tea-automate` workflow to generate additional automation coverage after GREEN phase.

---

*Generated by TEA Agent (Murat) — 2026-02-20*
*Workflow: ATDD for Story 1.6 Taxonomy Mapping Editor*
*TDD Phase: RED — All 11 tests use test.skip()*
