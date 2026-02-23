# Architecture Assumption Checklist

**Owner:** Charlie (Senior Dev) + Mona (Project Lead)
**Created:** 2026-02-23 (Epic 1 Retrospective — Action Item A1)
**When to use:** Run this checklist BEFORE locking Acceptance Criteria on any story.
  SM reviews with dev lead — takes 5–10 minutes per story.
  Goal: catch planning assumptions that don't match real architecture before coding begins.

---

## HOW TO USE

1. SM creates story draft (AC not yet locked)
2. SM + dev lead run through all checkboxes below
3. Any ❌ = revise AC before locking
4. Sign off → AC locked → story ready for implementation

---

## SECTION 1: Route & URL Structure

- [ ] **R1** — Does the story reference any URL or route (e.g., `/glossary`, `/upload`, `/admin/X`)?
  - If YES: Verify the route EXISTS in `src/app/` directory structure
  - Red flag: Story 1.7 assumed `/glossary` and `/upload` top-level — they don't exist
  - ✅ Pattern: nested routes live inside `/projects/[projectId]/...`

- [ ] **R2** — Does any UI element link to or navigate to a route?
  - Verify the target route is reachable from the current user's role
  - Check if the route is in `(auth)/` (public) or `(app)/` (protected)

- [ ] **R3** — Does the story require a new route to be created?
  - If YES: add route creation as an explicit subtask in the story

---

## SECTION 2: Database Schema

- [ ] **D1** — Does the story read or write columns that already exist in the schema?
  - Check `src/db/schema/` for actual column names
  - Red flag: Story 2.2 needs 4 columns not yet in `segments` table

- [ ] **D2** — Does the story require adding new columns to an existing table?
  - If YES: mark as `ALTER TABLE` (not `CREATE TABLE`) and add migration subtask
  - Note: ALTER is riskier — verify backward compatibility

- [ ] **D3** — Does the story use any table that has `tenant_id`?
  - Verify `withTenant()` is mentioned in the implementation tasks
  - Exception: `taxonomy_definitions` has no `tenant_id`

- [ ] **D4** — Does the story write state-changing data?
  - Verify audit log write is included in the Server Action tasks

---

## SECTION 3: Components & UI Library

- [ ] **C1** — Does the story use any dropdown / select component?
  - If using shadcn/ui Select: it is Radix UI — NOT a native `<select>`
  - E2E tests must use two-click pattern (see `_bmad-output/e2e-testing-gotchas.md`)

- [ ] **C2** — Does the story reference a shadcn/ui component that hasn't been installed yet?
  - Run `npx shadcn@latest add [component]` to verify it exists
  - Check `src/components/ui/` for already-installed components

- [ ] **C3** — Does the story have server-rendered + client-interactive parts?
  - Verify RSC boundary is correctly placed (Server page → Client entry component)
  - `"use client"` must NOT be on `page.tsx`

---

## SECTION 4: API & Server Actions

- [ ] **A1** — Does the story need a Server Action or Route Handler?
  - Server Action: UI mutations (forms, CRUD, review actions)
  - Route Handler: file upload with progress, webhooks, Inngest serve
  - Verify the correct pattern is used (not mixed)

- [ ] **A2** — Does the story call an external service (Supabase Storage, AI provider, Inngest)?
  - Verify the service client is available in the correct runtime
  - Check runtime compatibility table in `project-context.md`

- [ ] **A3** — Does the story return data to the client?
  - Verify `ActionResult<T>` pattern is used (not custom return shapes)
  - `{ success: true, data: T }` or `{ success: false, error: string, code: string }`

---

## SECTION 5: Third-party Library Behavior

- [ ] **L1** — Does the story use any library that has known gotchas in this project?
  - Drizzle ORM → see `_bmad-output/drizzle-typescript-gotchas.md`
  - Playwright E2E → see `_bmad-output/e2e-testing-gotchas.md`
  - Inngest → see `_bmad-output/inngest-setup-guide.md`
  - SDLXLIFF parsing → see `_bmad-output/sdlxliff-research-note.md`

- [ ] **L2** — Does the story use a new library not yet in the project?
  - Check runtime compatibility (Edge / Node.js / Browser)
  - Verify it doesn't conflict with existing packages

---

## SECTION 6: Cross-feature Dependencies

- [ ] **X1** — Does this story depend on data or functions from a previous story?
  - Verify the dependency story is `done` (not just `review`) before starting
  - Document the dependency explicitly in the story

- [ ] **X2** — Does this story produce output that a future story depends on?
  - Note the dependency in both stories' ACs

- [ ] **X3** — Does this story integrate with the Inngest pipeline?
  - Verify story order: pipeline functions must exist before Story 2.6 wires them
  - Check function is registered in `src/app/api/inngest/route.ts`

---

## SECTION 7: Testing

- [ ] **T1** — Does the story have complex UI interactions (file upload, drag-drop, multi-step forms)?
  - Plan E2E test patterns BEFORE writing AC
  - Verify Playwright helpers exist in `e2e/helpers/` for the interaction type

- [ ] **T2** — Does the story require new test fixtures?
  - Add fixture creation as an explicit subtask
  - Use factory functions from `src/test/factories.ts` for unit tests
  - Use `e2e/fixtures/` for E2E tests

- [ ] **T3** — Does the story change DB schema?
  - RLS tests must be updated/added in `src/db/__tests__/rls/`

---

## SECTION 8: Scope Boundaries

- [ ] **S1** — Does the story's AC reference UI elements from a future story?
  - If YES: either pull that UI into this story or explicitly mark as "foundation only — UI deferred to Story X.Y"
  - Red flag: Story 1.6 taxonomy display — deferred to Epic 4 but not explicitly noted in original AC

- [ ] **S2** — Does the story reference any placeholder values that need calibration?
  - Mark as `PROVISIONAL` with a note about when/how they'll be calibrated
  - Example: language pair thresholds in Story 1.3

- [ ] **S3** — Does the story touch mobile layout?
  - Verify breakpoints match Tailwind defaults (no arbitrary values)
  - Note if mobile behaviour is suppressed (e.g., "desktop-only" features)

---

## SIGN-OFF

```
Story: ___________________________
Date:  ___________________________
Reviewed by: Charlie + ___________

Sections passed:  [ ] 1  [ ] 2  [ ] 3  [ ] 4  [ ] 5  [ ] 6  [ ] 7  [ ] 8
Issues found: ____________________
AC revised: [ ] Yes  [ ] No — AC LOCKED ✅
```

---

## Quick Red Flags (Top 5 from Epic 1)

| Red Flag | Check |
|----------|-------|
| Story references `/route` that doesn't exist | Section 1 |
| Story writes to DB but no migration task | Section 2 |
| Story uses Radix Select in E2E test | Section 3 + 5 |
| Story assumes columns exist that haven't been added | Section 2 |
| Story scope bleeds into future stories without explicit deferral note | Section 8 |
