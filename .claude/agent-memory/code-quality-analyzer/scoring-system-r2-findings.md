# Scoring System CR R2 Findings (2026-03-26)

## Files Reviewed

- src/db/schema/scores.ts
- src/features/scoring/helpers/scoreFile.ts
- src/features/scoring/autoPassChecker.ts
- src/features/scoring/constants.ts
- src/features/review/hooks/use-score-subscription.ts
- src/features/review/utils/state-transitions.ts

## Result: 1C / 4H / 4S

## R1 Fix Verification (PASS — no regressions)

- H1 (layerFilterAsCompleted mapping): CORRECT — L1→L1, L2→L1L2, L3→L1L2L3
- H2 (skip checkAutoPass for na): CORRECT — early return before checkAutoPass call
- H3 (graduation >= not ===): CORRECT — `autoPassResult.fileCount >= NEW_PAIR_FILE_THRESHOLD`
- H4 (onConflictDoUpdate omit id): CORRECT — scoreValues has no id field (spread is redundant but safe)
- M1 (audit log non-fatal): CORRECT — try-catch + logger.error
- M2 (manual in CONTRIBUTING_STATUSES): CORRECT — 'manual' added to Set
- M3 (inArray status filter): CORRECT — ['calculated', 'auto_passed', 'overridden']

## Critical (C1)

**UNIQUE constraint in schema but no migration generated**

- uq_scores_file_tenant added to scores.ts schema definition
- Checked migrations 0000-0013: NO SQL for this constraint
- onConflictDoUpdate is dead code — PG has no constraint to ON CONFLICT against
- Fix: `npm run db:generate` then `npm run db:migrate`
- Root cause pattern: Drizzle schema ≠ DB until migration runs

## High (H1-H4)

- H1: Comment bรรทัด 28-29, 88 in autoPassChecker wrong: `> 50` / `<= 50` should be `>= 50` / `< 50`
- H2: LAYER_COMPLETED_VALUES hardcoded in use-score-subscription — same Anti-Pattern #23 as SCORE_STATUS_VALUES was before R1 fix
- H3: prev?.layerCompleted used raw from DB without runtime validation in layerCompleted priority chain
- H4: Double try-catch in createGraduationNotification — inner catch swallows all errors → outer catch is dead code

## Suggestions (S1-S4)

- S1: `const { ...updateSet } = scoreValues` is identity spread — just use scoreValues directly
- S2: body/metadata hardcodes `51` — should be `NEW_PAIR_FILE_THRESHOLD + 1`
- S3: unsafe `as` cast on newScore.status at return — use runtime guard before return
- S4: SEVERITY_PRIORITY typed as `Record<string, number>` — should be `Record<FindingSeverity, number>`

## New Anti-Pattern Observed

**#45: Schema UNIQUE ≠ DB UNIQUE until migration runs**

- Drizzle schema `unique()` only affects type-gen and `db:generate`
- `onConflictDoUpdate` target must match REAL DB constraint, not just schema definition
- Always verify: after adding constraint to schema, check if migration SQL file was generated AND applied
- Fix flow: add to schema → `npm run db:generate` → review generated SQL → `npm run db:migrate`
