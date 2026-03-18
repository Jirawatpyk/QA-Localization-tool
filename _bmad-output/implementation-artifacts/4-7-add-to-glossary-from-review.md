# Story 4.7: Add to Glossary from Review

Status: done

## Story

As a QA Reviewer,
I want to add terms to the project glossary directly from the review interface with one click,
So that I can build the glossary organically as I discover terminology issues during review.

## Acceptance Criteria

1. **AC1: Pre-filled Glossary Dialog** — Given a finding is focused that involves a terminology issue (category = `'Terminology'`), When the reviewer clicks "Add to Glossary" button in the finding detail panel, Then a pre-filled glossary entry dialog appears with: source term extracted from `finding.sourceTextExcerpt`, target term from `finding.suggestedFix` (or reviewer can type), language pair auto-populated from the file's language pair (`sourceLang`/`targetLang` from `initialData`), and optional notes field. Dialog pre-filled to minimize typing (1-click goal) (FR42). **Note:** Epic AC says "Terminology or Glossary" but `'Glossary'` is not a valid MQM category in the taxonomy seed — only `'Terminology'` exists. The L1 glossary matcher produces findings with `category='Terminology'`. Use `'Terminology'` only.

2. **AC2: Confirm & Add** — Given the glossary entry dialog is filled, When the reviewer confirms the addition, Then: the term is added to the project's glossary immediately, a toast confirms "Added to glossary: '{source}' → '{target}'", the glossary cache is invalidated (`revalidateTag`), and the action is logged in the audit trail.

3. **AC3: Duplicate Detection** — Given the term already exists in the project glossary, When the reviewer attempts to add a duplicate, Then the dialog shows a warning: "Term '{source}' already exists with target '{existing_target}'" — duplicate check is CASE_INSENSITIVE and exact phrase match (not substring). Reviewer can choose: "Update existing" (replace target) or "Cancel".

4. **AC4: Button Visibility** — Given a non-terminology finding is focused (e.g., tag error, number mismatch), When the finding detail panel renders, Then the "Add to Glossary" button is not shown (only relevant for `category === 'Terminology'` findings).

5. **AC5: No Auto Re-run** — Given the reviewer adds a glossary term, When other findings in the same file are re-evaluated, Then the system does NOT automatically re-run QA. A subtle note appears: "New glossary term will apply to future QA runs".

## Scope Table

| Feature | In Scope | Out of Scope |
|---------|----------|--------------|
| "Add to Glossary" button on detail panel | Yes (AC1, AC4) | Bulk "add to glossary" for multiple findings |
| Pre-filled dialog with source/target/lang/notes | Yes (AC1) | Glossary management/CRUD from review page |
| Duplicate detection + update existing | Yes (AC3) | Auto-re-run QA after adding term |
| Cache invalidation | Yes (AC2) | Glossary import from review |
| Audit trail logging | Yes (AC2) | Notification to other reviewers (FR45 — Epic 5+) |
| "Future QA runs" info note | Yes (AC5) | Re-run pipeline button |

## Tasks / Subtasks

- [x] **Task 1: Validation Schema** (AC: #1, #3)
  - [x] 1.1 Create `addToGlossarySchema` in `src/features/review/validation/addToGlossary.schema.ts`
  - [x] 1.2 Fields: `findingId` (uuid), `projectId` (uuid), `sourceLang` (string, min 1), `targetLang` (string, min 1), `sourceTerm` (string 1-500), `targetTerm` (string 1-500), `notes` (string optional, max 1000), `caseSensitive` (boolean, default false)

- [x] **Task 2: Server Action — `addToGlossary.action.ts`** (AC: #1, #2, #3)
  - [x] 2.1 Create `src/features/review/actions/addToGlossary.action.ts`
  - [x] 2.2 Auth: `requireRole('qa_reviewer')` (NOT admin — QA reviewers need this)
  - [x] 2.3 Validate input with `addToGlossarySchema`
  - [x] 2.4 Find project's glossary for the file's language pair: query `glossaries` WHERE `projectId` AND `sourceLang` AND `targetLang` with `withTenant()`. If no glossary exists → auto-create one named `"{projectName} — {sourceLang}→{targetLang}"`. Use try-catch around INSERT for race condition (two reviewers simultaneously creating glossary for same lang pair) — on 23505 unique violation, re-query to get the one the other reviewer created
  - [x] 2.5 NFKC normalize `sourceTerm` before dedup check (follow `createTerm.action.ts` pattern at line 54)
  - [x] 2.6 Duplicate detection: case-insensitive exact match via `sql\`lower(...) = lower(...)\`` on `glossaryTerms` WHERE `glossaryId`
  - [x] 2.7 If duplicate found: return `{ success: true, data: { created: false, duplicate: true, existingTermId, existingTarget } }` — use SUCCESS branch with discriminated union (ActionResult error branch has no `data` field)
  - [x] 2.8 If no duplicate: insert term via `db.insert(glossaryTerms).values({...}).returning()` + guard `rows[0]!` (Guardrail #4)
  - [x] 2.9 Write audit log: `entityType: 'glossary_term'`, `action: 'glossary_term.created_from_review'`, `newValue: { sourceTerm, targetTerm, findingId }`
  - [x] 2.10 Cache invalidation: `revalidateTag(\`glossary-${projectId}\`)`
  - [x] 2.11 Return `ActionResult<AddToGlossaryResult>` — discriminated union: `{ created: true, termId, glossaryId, sourceTerm, targetTerm }` (new term) or `{ created: false, duplicate: true, existingTermId, existingTarget }` (dup found)

- [x] **Task 3: Server Action — `updateGlossaryTerm.action.ts`** (AC: #3)
  - [x] 3.1 Create `src/features/review/actions/updateGlossaryTerm.action.ts` — thin wrapper
  - [x] 3.2 Auth: `requireRole('qa_reviewer')`
  - [x] 3.3 Input: `termId` (uuid), `targetTerm` (string 1-500), `projectId` (uuid)
  - [x] 3.4 Verify term's glossary belongs to tenant via `withTenant()` (JOIN glossaries)
  - [x] 3.5 Update `glossaryTerms.targetTerm` WHERE `id = termId`
  - [x] 3.6 Audit log: `action: 'glossary_term.updated_from_review'`, `oldValue`/`newValue`
  - [x] 3.7 Cache invalidation: `revalidateTag(\`glossary-${projectId}\`)`

- [x] **Task 4: `AddToGlossaryDialog` Component** (AC: #1, #2, #3, #5)
  - [x] 4.1 Create `src/features/review/components/AddToGlossaryDialog.tsx`
  - [x] 4.2 Props: `open`, `onOpenChange`, `finding: FindingForDisplay`, `sourceLang`, `targetLang`, `projectId`
  - [x] 4.3 Pre-fill: Source term = `finding.sourceTextExcerpt ?? ''`, Target term = `finding.suggestedFix ?? ''`
  - [x] 4.4 Form fields: Source Term (required, editable), Target Term (required, editable), Language Pair (read-only display), Notes (optional textarea), Case Sensitive checkbox (default false)
  - [x] 4.5 State reset on open: `useEffect(() => { if (open) resetForm() }, [open])` (Guardrail #11)
  - [x] 4.6 Submit handler: call `addToGlossary({ findingId, projectId, sourceLang, targetLang, sourceTerm, targetTerm, notes, caseSensitive })` server action
  - [x] 4.7 Duplicate handling: if `result.success && !result.data.created` (discriminated union) → show inline warning with existing target, render "Update existing" and "Cancel" buttons
  - [x] 4.8 Success: toast "Added to glossary: '{source}' → '{target}'" + show info note "New glossary term will apply to future QA runs" (AC5)
  - [x] 4.9 Accessibility: `aria-modal="true"`, focus trap (Tab/Shift+Tab), Esc closes, focus restore to trigger button (Guardrail #30)
  - [x] 4.10 Use `useTransition()` for pending state (follow `TermEditDialog.tsx` pattern)

- [x] **Task 5: Wire "Add to Glossary" Button in `FindingDetailContent`** (AC: #1, #4)
  - [x] 5.1 Edit `src/features/review/components/FindingDetailContent.tsx`
  - [x] 5.2 Add conditional "Add to Glossary" button: visible ONLY when `finding.category === 'Terminology' && finding.sourceTextExcerpt != null && targetLang !== ''` (AC4 — `'Glossary'` is not a valid MQM category; hide when no source text or unknown target language)
  - [x] 5.3 Button placement: OUTSIDE the `role="toolbar" aria-label="Review actions"` div (line 203-249). Place in a separate section below, e.g. `<div className="pt-2">` — this is a glossary action, NOT a review state-change action, so it does not belong in the review actions toolbar
  - [x] 5.4 Button: `<Button variant="outline" size="sm">` with `BookMarked` icon (Lucide) + text "Add to Glossary". No keyboard shortcut — intentional (rare, context-dependent action unlike A/R/F/N/S/+/-)
  - [x] 5.5 Button has its OWN pending state via `AddToGlossaryDialog`'s `useTransition()`. Do NOT use `isActionInFlight` to disable — that tracks review actions (accept/reject/flag) and should not block glossary operations
  - [x] 5.6 On click: open `AddToGlossaryDialog` with pre-filled data
  - [x] 5.7 Props needed: `sourceLang`, `targetLang`, `projectId` — already available as props on `FindingDetailContent`
  - [x] 5.8 Import and render `AddToGlossaryDialog` with state management (`useState` for open/close)

- [x] **Task 6: Unit Tests** (all ACs)
  - [x] 6.1 `addToGlossary.action.test.ts` — 14 tests: validation error (missing sourceLang/targetLang), auth error, glossary auto-create (new lang pair), glossary auto-create race condition (catch + re-query), duplicate detection return with existingTarget, successful insert + audit + cache invalidation, tenant isolation (withTenant), NFKC normalization, boundary (500/501)
  - [x] 6.2 `updateGlossaryTerm.action.test.ts` — 5 tests: validation, auth, successful update + audit, tenant isolation
  - [x] 6.3 `AddToGlossaryDialog.test.tsx` — deferred to component-level coverage via FindingDetailContent tests (server action mocking covers dialog behavior)
  - [x] 6.4 `FindingDetailContent` integration — 4 tests: button visible for category='Terminology' + non-null sourceTextExcerpt + non-empty targetLang, button hidden for category='Accuracy', button hidden when sourceTextExcerpt=null, button hidden when targetLang=''

- [x] **Task 7: E2E Test** (smoke)
  - [x] 7.1 Create `e2e/review-add-to-glossary.spec.ts`
  - [x] 7.2 Seed: project + file + terminology finding (category='Terminology') + glossary
  - [x] 7.3 Test: navigate to review → click finding → verify "Add to Glossary" button visible → click → verify dialog pre-filled → submit → verify toast → verify term in glossary
  - [x] 7.4 Test: verify button NOT shown for non-terminology finding (e.g., category='Tag')
  - [x] 7.5 Test: duplicate detection (seed existing term, attempt to add same source)

## Dev Notes

### Architecture & Patterns

**Server Action pattern** — follow `createTerm.action.ts` (line 25-112) as golden example:
- `'use server'` + `import 'server-only'`
- Zod validation → auth → tenant verification → business logic → audit → cache invalidation
- Return `ActionResult<T>` from `@/types/actionResult`
- Guard `rows[0]!` after `.returning()` (Guardrail #4)
- NFKC normalize before text comparison (CJK/Thai rule)

**Auth decision: `qa_reviewer` NOT `admin`** — the existing `createTerm.action.ts` requires `admin` role, but Story 4.7 is explicitly for QA Reviewers adding terms during review. Create a NEW server action `addToGlossary.action.ts` in the review feature with `requireRole('qa_reviewer')`. Do NOT modify the existing admin-only `createTerm.action.ts`.

**Glossary resolution** — a project may have multiple glossaries (one per language pair). The action must:
1. Query `glossaries` WHERE `projectId` AND `sourceLang` AND `targetLang` AND `withTenant()`
2. If found → use it
3. If not found → auto-create glossary with name `"{projectName} — {sourceLang}→{targetLang}"`
4. This ensures 1-click experience even if no glossary was manually created

**Race condition on glossary auto-create** — two reviewers could simultaneously trigger auto-create for the same language pair. The `glossaries` table has no unique constraint on `(project_id, source_lang, target_lang)`. Defense: wrap INSERT in try-catch — on PostgreSQL error code 23505 (unique violation) or any insert failure, re-query to find the glossary the other reviewer just created. Alternatively, use `db.insert(...).onConflictDoNothing()` but this requires a unique index. Simplest approach: catch any error on INSERT, then SELECT again.

**Duplicate response shape** — `ActionResult<T>` error branch has no `data` field (verified: `src/types/actionResult.ts`). Use discriminated union in the success data instead:
```typescript
type AddToGlossaryResult =
  | { created: true; termId: string; glossaryId: string; sourceTerm: string; targetTerm: string }
  | { created: false; duplicate: true; existingTermId: string; existingTarget: string }
```
Client checks `result.success && result.data.created` for new term, `result.success && !result.data.created` for duplicate.

**Dialog component** — create NEW `AddToGlossaryDialog.tsx` in review feature (NOT reuse `TermEditDialog.tsx` from glossary feature). Reasons:
1. Different auth context (qa_reviewer vs admin)
2. Different fields (adds notes, language pair display, info note about future QA runs)
3. Different duplicate handling (show existing target + "Update existing" button)
4. Keep feature boundaries clean (review feature owns the dialog)

### Existing Code to Extend

| File | What to Change |
|------|---------------|
| `src/features/review/components/FindingDetailContent.tsx` | Add "Add to Glossary" button in a NEW section BELOW the `role="toolbar"` div (line 249). NOT inside the toolbar — glossary action ≠ review action |
| `src/features/review/components/FindingDetailContent.tsx` | Import `BookMarked` from lucide-react, `AddToGlossaryDialog`, manage open state via `useState` |

### New Files to Create

| File | Purpose |
|------|---------|
| `src/features/review/actions/addToGlossary.action.ts` | Server Action: add term to glossary from review context |
| `src/features/review/actions/updateGlossaryTerm.action.ts` | Server Action: update existing term's target (duplicate case) |
| `src/features/review/validation/addToGlossary.schema.ts` | Zod validation schema |
| `src/features/review/components/AddToGlossaryDialog.tsx` | Pre-filled dialog component |
| `src/features/review/actions/addToGlossary.action.test.ts` | Unit tests for server action |
| `src/features/review/actions/updateGlossaryTerm.action.test.ts` | Unit tests for update action |
| `src/features/review/components/AddToGlossaryDialog.test.tsx` | Component tests |
| `e2e/review-add-to-glossary.spec.ts` | E2E smoke test |

### Database — No Migration Required

All needed tables already exist:
- `glossaries` (id, tenant_id, project_id, name, source_lang, target_lang) — verified `src/db/schema/glossaries.ts`
- `glossary_terms` (id, glossary_id, source_term, target_term, case_sensitive) — verified `src/db/schema/glossaryTerms.ts`
- `audit_logs` (id, tenant_id, user_id, entity_type, entity_id, action, old_value, new_value) — verified `src/db/schema/auditLogs.ts`

No new columns or tables needed. The `glossary_terms` table has no `notes` column — the notes field from AC1 is informational context for the reviewer during entry but is NOT persisted to the glossary_terms table (no schema change). Notes are stored in the audit log `newValue.notes` for traceability. **Tech debt: TD-GLOSSARY-001** — add `notes` column to `glossary_terms` table (deferred to Epic 5+ glossary enhancements). Must be logged in `tech-debt-tracker.md` during implementation.

**Known gap: no unique constraint on `glossary_terms(glossary_id, source_term)`** — the SQL-level duplicate check could theoretically race (two concurrent inserts pass the SELECT check but both INSERT). The existing `createTerm.action.ts` has the same limitation. Acceptable for MVP — extremely low collision probability with single-user-per-file review pattern. If hit, the second insert simply creates a near-duplicate that can be cleaned up via glossary management.

### Key Column/Type Mapping (Verified Against Schema)

| Story Reference | Actual DB Column | Table | Type |
|----------------|-----------------|-------|------|
| Source term | `source_term` | `glossary_terms` | varchar(500) |
| Target term | `target_term` | `glossary_terms` | varchar(500) |
| Case sensitive | `case_sensitive` | `glossary_terms` | boolean (default false) |
| Finding category | `category` | `findings` | varchar(100) |
| Source text excerpt | `source_text_excerpt` | `findings` | text (nullable) |
| Suggested fix | `suggested_fix` | `findings` | text (nullable) |
| Source language | `source_lang` | `segments` | varchar(35) |
| Target language | `target_lang` | `segments` | varchar(35) |
| Glossary source lang | `source_lang` | `glossaries` | varchar(35) |
| Glossary target lang | `target_lang` | `glossaries` | varchar(35) |

### Data Flow: Finding → Glossary Term

```
FindingDetailContent (has finding + sourceLang + targetLang + projectId)
  → Visibility: category='Terminology' && sourceTextExcerpt!=null && targetLang!=''
  → "Add to Glossary" button click (OUTSIDE role="toolbar")
  → AddToGlossaryDialog opens (props: finding, sourceLang, targetLang, projectId)
    → Pre-filled: sourceTerm=finding.sourceTextExcerpt, targetTerm=finding.suggestedFix
    → User confirms
  → addToGlossary({ findingId, projectId, sourceLang, targetLang, sourceTerm, targetTerm, notes })
    → Find/create glossary for (projectId, sourceLang, targetLang) — race-safe
    → NFKC normalize sourceTerm
    → Check duplicate (case-insensitive lower() match)
    → If dup → return success with { created: false, duplicate: true, existingTarget }
    → If new → INSERT glossaryTerms + audit log + revalidateTag
  → Dialog shows success toast / duplicate warning
```

### `sourceLang`/`targetLang` Availability

Already available in `FindingDetailContent` props (passed from `ReviewPageClient` which gets them from `getFileReviewData.action.ts` → `languagePairConfigs` table JOIN). No new data fetching needed.

`projectId` is also already a prop on `FindingDetailContent`.

### Category Matching for Button Visibility (AC4)

Finding `category` value that should show the button:
- `'Terminology'` — terminology inconsistency (from taxonomy seed + L1 glossary matcher)

**Verified**: `'Glossary'` is NOT a valid MQM category in `src/db/seeds/taxonomySeed.ts`. Only `'Terminology'` exists. L1 glossary findings use `category='Terminology'`.

Check (full visibility condition):
```typescript
const showAddToGlossary =
  finding.category === 'Terminology' &&
  finding.sourceTextExcerpt != null &&
  targetLang !== ''
```

- `category === 'Terminology'` — AC4: only terminology findings
- `sourceTextExcerpt != null` — can't pre-fill source term without excerpt
- `targetLang !== ''` — `ReviewPageClient` converts null → `''`; can't create glossary entry without target language

This is a client-side check — no server round-trip for button visibility.

### Testing Standards

- **Unit tests**: co-located next to source files
- **Naming**: `describe("addToGlossary")` → `it("should create term when glossary exists")`
- **Mocks**: use `createDrizzleMock()` from `src/test/drizzleMock.ts`
- **Factories**: use `src/test/factories.ts` for test data
- **E2E**: Playwright, seed via PostgREST, verify via UI assertions

### Previous Story (4.6) Learnings

- **CR R1 had 2C+8H** — most from missing runtime validation and test gaps. Pre-write tests for all error paths.
- **6 production bugs found in E2E** — auto-reject scope leak, client store sync, fileId null crashes. Defense: always null-check `finding.sourceTextExcerpt` and `finding.suggestedFix` before pre-filling.
- **SuppressPatternDialog** (`src/features/review/components/SuppressPatternDialog.tsx`) is a good reference for dialog pattern in review context — state reset, useTransition, toast, accessibility.
- **Guardrail #46 was born from Story 4.6** — agent suggested removing a file filter that contradicted AC. Always re-read AC before implementing any fix.

### Guardrails Checklist (Verify Before Every File)

- [ ] Guardrail #1: `withTenant()` on every SELECT/UPDATE/DELETE
- [ ] Guardrail #3: No bare `string` for category comparison — use string literal union
- [ ] Guardrail #4: Guard `rows[0]!` after `.returning()`
- [ ] Guardrail #8: Optional filter uses `null` not `''`
- [ ] Guardrail #11: Dialog state reset on re-open
- [ ] Guardrail #25: Color never sole info carrier (icon + text on button)
- [ ] Guardrail #27: Focus indicator 2px indigo, 4px offset
- [ ] Guardrail #30: Modal focus trap + restore
- [ ] Guardrail #33: `aria-live="polite"` for toast/success
- [ ] Guardrail #37: `prefers-reduced-motion` respected
- [ ] Guardrail #42: No `--no-verify` on commits

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-4-review-decision-workflow.md` — Story 4.7 ACs]
- [Source: `_bmad-output/planning-artifacts/prd.md` — FR42 (1-click glossary from review)]
- [Source: `src/features/glossary/actions/createTerm.action.ts` — golden Server Action pattern]
- [Source: `src/features/review/components/FindingDetailContent.tsx` — integration point]
- [Source: `src/features/review/components/SuppressPatternDialog.tsx` — review dialog pattern reference]
- [Source: `src/features/glossary/components/TermEditDialog.tsx` — existing glossary dialog (reference only)]
- [Source: `src/db/schema/glossaries.ts` — glossary schema verified]
- [Source: `src/db/schema/glossaryTerms.ts` — glossary terms schema verified]
- [Source: `src/features/review/types.ts` — FindingForDisplay type]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- revalidateTag needs 2 args in this codebase — fixed `revalidateTag(..., 'minutes')`
- `server-only` import breaks client component tests — added mock to FindingDetailContent.test.tsx and FindingDetailSheet.test.tsx
- drizzleMock throwAtCallIndex needs placeholder value in returnValues array (callIndex increments before reject)
- TD-GLOSSARY-001 logged for missing `notes` column on glossary_terms (deferred to Epic 5+)

### Completion Notes List

- **Task 1:** Zod schemas for addToGlossary + updateGlossaryTerm in single file
- **Task 2:** addToGlossary server action — requireRole('qa_reviewer'), auto-create glossary, race-safe, NFKC normalize, case-insensitive dedup via SQL lower(), discriminated union result
- **Task 3:** updateGlossaryTerm server action — thin wrapper, tenant isolation via JOIN, audit with oldValue/newValue
- **Task 4:** AddToGlossaryDialog component — pre-fill from finding, form reset on open (G#11), focus restore (G#30), duplicate warning inline, success note about future QA runs (AC5)
- **Task 5:** Wired button in FindingDetailContent — OUTSIDE toolbar, BookMarked icon, conditional visibility (category='Terminology' + sourceTextExcerpt + targetLang)
- **Task 6:** 23 unit tests (14 addToGlossary + 5 updateGlossaryTerm + 4 button visibility in FindingDetailContent). Added server-only mocks to 2 existing test files
- **Task 7:** E2E smoke test — 3 tests: happy path add term, button hidden for non-terminology, duplicate detection + update existing

### Cross-file Pairs (Step 2 verification)

1. `addToGlossary.action.ts` → `AddToGlossaryDialog.tsx`: ActionResult<AddToGlossaryResult> discriminated union (created/duplicate)
2. `updateGlossaryTerm.action.ts` → `AddToGlossaryDialog.tsx`: ActionResult<UpdateTermResult>
3. `FindingDetailContent.tsx` → `AddToGlossaryDialog.tsx`: FindingForDisplay + sourceLang + targetLang + projectId props

### Pre-CR Scan Results (Step 9)

**Anti-pattern detector:** 0C, 0H — clean (4M pre-existing, 3L non-issues)
**Tenant isolation checker:** 1H FIXED (compound WHERE on UPDATE), 1M FIXED (innerJoin on dup check)
**Code quality analyzer:** H1 FIXED (tenant isolation), H2 tracked as TD-GLOSSARY-001
**Cross-file data flow reviewer:** I-1 FIXED (DOM read → useRef), I-2 FIXED (projectId guard on showAddToGlossary)

All CRITICAL and HIGH findings resolved. Story ready for CR.

### CR R1 Fixes Applied (2026-03-18)

- **H1 FIXED:** Added `sourceLang !== ''` guard to `showAddToGlossary` in FindingDetailContent.tsx (symmetric with targetLang)
- **H2 FIXED:** Created `AddToGlossaryDialog.test.tsx` — 10 tests covering AC1 pre-fill, AC3 duplicate/update, AC5 future QA note, G#11 form reset, error toast
- **M1 FIXED:** Added 4 validation tests to `updateGlossaryTerm.action.test.ts` (empty target, 500/501 boundary, invalid UUID)
- **M2 FIXED:** Added `requireRole('qa_reviewer', 'write')` assertion to FORBIDDEN tests in both action files
- **M3 FIXED:** Checked off Task 7 subtasks 7.1-7.5 in story file
- **M4 FIXED:** Reset `glossaryDialogOpen` when finding changes (moved useState before ref check)
- **L1 FIXED:** Added source term to AC3 duplicate warning message in AddToGlossaryDialog
- **L2 FIXED:** Added early return guard for `formRef.current === null` in `handleUpdateExisting`

### CR R2 Fixes Applied (2026-03-18)

- **M1-R2 FIXED:** Clear `duplicate` state on sourceTerm input change — prevents stale existingTermId from updating wrong glossary entry
- **M2-R2 FIXED:** Added `notes` audit log propagation test to `addToGlossary.action.test.ts`
- **M3-R2 FIXED:** Added `CREATE_FAILED` and `UPDATE_FAILED` defensive guard tests (Guardrail #4)
- **L1-R2 FIXED:** Added caseSensitive checkbox render test
- **L2-R2 FIXED:** Added updateGlossaryTerm error toast test in AddToGlossaryDialog
- **M1-R2 TEST:** Added stale duplicate clear test — verifies sourceTerm change dismisses warning

Total tests: 74 (up from 53 pre-CR)

### Conditional Scans

- RLS policy reviewer: SKIPPED (no schema/migration changes)
- Inngest function validator: SKIPPED (no pipeline files changed)

### File List

**New Files:**
- `src/features/review/validation/addToGlossary.schema.ts`
- `src/features/review/actions/addToGlossary.action.ts`
- `src/features/review/actions/updateGlossaryTerm.action.ts`
- `src/features/review/components/AddToGlossaryDialog.tsx`
- `src/features/review/components/AddToGlossaryDialog.test.tsx`
- `src/features/review/actions/addToGlossary.action.test.ts`
- `src/features/review/actions/updateGlossaryTerm.action.test.ts`
- `e2e/review-add-to-glossary.spec.ts`

**Modified Files:**
- `src/features/review/components/FindingDetailContent.tsx`
- `src/features/review/components/FindingDetailContent.test.tsx`
- `src/features/review/components/FindingDetailSheet.test.tsx`
- `_bmad-output/implementation-artifacts/tech-debt-tracker.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
