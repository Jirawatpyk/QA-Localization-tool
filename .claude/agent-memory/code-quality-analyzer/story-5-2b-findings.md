# Story 5.2b: Schema + RLS Scoped Access — CR R1

**Date:** 2026-03-28
**Result:** 0C / 3H / 5M / 4L

## Files Reviewed

- `src/types/assignment.ts` — AssignmentStatus union type
- `src/db/schema/findingAssignments.ts` — Drizzle schema
- `src/db/schema/findingComments.ts` — Drizzle schema (immutable)
- `src/db/schema/index.ts` — barrel export
- `src/db/schema/relations.ts` — 2 new + 5 updated relations
- `src/db/migrations/0017_lying_saracen.sql` — Drizzle migration
- `supabase/migrations/00026_story_5_2b_rls_scoped_access.sql` — RLS policies
- `src/db/__tests__/rls/finding-assignments-rls.test.ts` — 10 tests
- `src/db/__tests__/rls/native-reviewer-scoped-access-rls.test.ts` — 12 tests

## HIGH Findings

- H1: `fileAssignments.status` bare string (no $type<>) — Guardrail #3 violation in existing file touched by this story
- H2: Drizzle migration 0017 missing `ENABLE ROW LEVEL SECURITY` — defense-in-depth gap (Supabase migration has it)
- H3: RLS test missing positive case for native_reviewer UPDATE own assignment status

## Key Observations

- AssignmentStatus SSOT pattern (const array -> type) well done
- findingComments immutability enforced at DB level (no updatedAt, no UPDATE policy)
- RLS migration uses atomic BEGIN/COMMIT, DROP IF EXISTS + CREATE pattern
- EXISTS subquery pattern correctly used in all native-scoped policies
- TD-DB-006 orphan constraint fixed idempotently
- updatedAt on findingAssignments needs trigger or app-level handling (M2)
