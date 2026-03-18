---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04c-aggregate
lastStep: step-04c-aggregate
lastSaved: '2026-03-18'
inputDocuments:
  - _bmad-output/implementation-artifacts/4-7-add-to-glossary-from-review.md
  - src/features/glossary/actions/createTerm.action.ts
  - src/features/review/components/FindingDetailContent.tsx
  - src/features/review/types.ts
  - src/db/schema/glossaries.ts
  - src/db/schema/glossaryTerms.ts
  - e2e/helpers/review-page.ts
  - e2e/helpers/supabase-admin.ts
---

# ATDD Checklist: Story 4.7 — Add to Glossary from Review

## TDD Red Phase (Current)

All tests generated with `it.skip()` / `test.skip()` — will fail until feature implemented.

## Test Files Generated

| File | Level | Tests | Phase |
|------|-------|-------|-------|
| `src/features/review/actions/addToGlossary.action.test.ts` | Unit (Vitest) | 14 | RED |
| `src/features/review/actions/updateGlossaryTerm.action.test.ts` | Unit (Vitest) | 5 | RED |
| `e2e/review-add-to-glossary.spec.ts` | E2E (Playwright) | 3 | RED |
| **Total** | | **22** | |

## Priority Breakdown

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 4 | Core: create term, duplicate detection, button visibility, E2E happy path |
| P1 | 11 | Supporting: auto-create glossary, audit log, cache, validation, boundary (500/501), E2E duplicate, update term |
| P2 | 7 | Edge: NFKC, tenant isolation, auth, race condition, case-insensitive |

## Acceptance Criteria Coverage

| AC | P0 Tests | P1 Tests | P2 Tests | Total |
|----|----------|----------|----------|-------|
| AC1: Pre-filled dialog | 1 (unit) | 2 (unit: auto-create, validation) | — | 3 |
| AC2: Confirm & add | 1 (unit) + 1 (E2E) | 2 (unit: audit, cache) | — | 4 |
| AC3: Duplicate detection | 1 (unit) | 3 (unit: update, audit, cache) + 1 (E2E) | 1 (case-insensitive) | 6 |
| AC4: Button visibility | 1 (E2E) | — | — | 1 |
| AC5: No auto re-run | — | 1 (E2E: info note) | — | 1 |
| Cross-cutting | — | — | 5 (NFKC, tenant, auth, race, case) | 5 |

## DoD Gate (Story Completion)

- [ ] ALL P0 tests PASS (4 tests)
- [ ] ALL P1 tests PASS (9 tests)
- [ ] P2 tests: PASS or documented as accepted tech debt
- [ ] E2E tests run locally: `npx playwright test e2e/review-add-to-glossary.spec.ts`
- [ ] Unit tests run: `npx vitest run src/features/review/actions/addToGlossary.action.test.ts`

## Next Steps (TDD Green Phase)

After implementing the feature:

1. Remove `it.skip()` / `test.skip()` from test files
2. Wire up mocks in unit tests (drizzleMock, requireRole, writeAuditLog, revalidateTag)
3. Set up E2E seed data (project, file, segments, findings, glossary)
4. Run tests: `npm run test:unit` + `npx playwright test e2e/review-add-to-glossary.spec.ts`
5. Verify all P0+P1 tests PASS (green phase)
6. If any tests fail: fix implementation (feature bug) or fix test (test bug)

## Implementation Files to Create

### Server Actions
- `src/features/review/actions/addToGlossary.action.ts`
- `src/features/review/actions/updateGlossaryTerm.action.ts`
- `src/features/review/validation/addToGlossary.schema.ts`

### Components
- `src/features/review/components/AddToGlossaryDialog.tsx`

### Files to Modify
- `src/features/review/components/FindingDetailContent.tsx` (add button + dialog)
