// Assignment status types — canonical source of truth (DB-aligned)
// Const array for runtime validation (Guardrail #3, #72), type derived from it
// Pattern: same as FindingStatus in src/types/finding.ts
// NOTE: RLS policy finding_assignments_update_native (supabase/migrations/00026)
// restricts native reviewer to SUBSET: ('pending', 'in_review', 'confirmed').
// If adding a new status, review whether native reviewers should be blocked from it.
export const ASSIGNMENT_STATUSES = ['pending', 'in_review', 'confirmed', 'overridden'] as const
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number]
