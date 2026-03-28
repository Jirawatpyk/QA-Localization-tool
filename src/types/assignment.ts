// Assignment status types — canonical source of truth (DB-aligned)
// Const array for runtime validation (Guardrail #3, #72), type derived from it
// Pattern: same as FindingStatus in src/types/finding.ts
export const ASSIGNMENT_STATUSES = ['pending', 'in_review', 'confirmed', 'overridden'] as const
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number]
