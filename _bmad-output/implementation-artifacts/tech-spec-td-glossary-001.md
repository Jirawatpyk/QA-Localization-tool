---
title: 'TD-GLOSSARY-001: Add notes column to glossary_terms'
type: 'bugfix'
created: '2026-03-26'
status: 'in-progress'
baseline_commit: 'f8017fa'
context: ['CLAUDE.md']
---

# TD-GLOSSARY-001: Add notes column to glossary_terms

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** Reviewer notes entered during "Add to Glossary" are accepted by the UI but silently dropped — DB has no `notes` column. Data only in audit log.

**Approach:** Add nullable `text` column to `glossary_terms`, wire through addToGlossary + importGlossary actions, generate migration.

## Boundaries & Constraints

**Always:** Nullable column (no migration backfill needed). withTenant on every query.

**Never:** Change glossary matching logic. Modify UI components (column exists, UI already sends notes).

</frozen-after-approval>

## Tasks & Acceptance

- [ ] `src/db/schema/glossaryTerms.ts` -- Add `notes: text('notes')` column (nullable)
- [ ] `src/features/review/actions/addToGlossary.action.ts` -- Pass `notes` to `db.insert(glossaryTerms)` values
- [ ] `src/features/glossary/actions/importGlossary.action.ts` -- Pass notes if present in import data
- [ ] Generate migration via `npm run db:generate`
- [ ] Mark TD-GLOSSARY-001 RESOLVED in tech-debt-tracker.md
- [ ] Remove TODO comment from addToGlossary.action.ts

## Verification

- `npm run type-check` -- 0 errors
- `npm run db:generate` -- migration created
