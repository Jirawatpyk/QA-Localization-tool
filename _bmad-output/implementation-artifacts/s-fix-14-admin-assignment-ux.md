# Story S-FIX-14: Admin & Assignment UX

Status: done

## Story

As an Admin,
I want to manage language pair assignments per reviewer in the User Management table and see helpful guidance when no reviewers match a file's target language,
so that the file assignment workflow can correctly filter and suggest eligible reviewers.

## Acceptance Criteria

### AC1: Language Pairs Column in User Management Table (UX-NEW-14)

**Given** an Admin opens the Admin > User Management page
**When** the user table renders
**Then:**
- A new "Language Pairs" column appears between "Role" and "Joined" columns
- Each reviewer (role = `qa_reviewer` or `native_reviewer`) shows their assigned language pairs as `Badge` components (e.g., `th-TH`, `ja-JP`, `zh-CN`)
- Admin role users show a muted "N/A" text (admins don't get file assignments)
- Reviewers with no language pairs show a muted "None assigned" text with subtle warning styling
- Column header: "Language Pairs"

**Implementation notes:**
- Source data: `users.nativeLanguages` JSONB column (BCP-47 string array, nullable)
- Already exists in DB schema at `src/db/schema/users.ts:14` — just not fetched or displayed
- Modify server query in `src/app/(app)/admin/page.tsx` to include `users.nativeLanguages` in SELECT
- Extend `UserRow` type in `UserManagement.tsx` to include `nativeLanguages: string[] | null`

### AC2: Language Pair Multi-Select Editor Per Reviewer (UX-NEW-14)

**Given** an Admin wants to assign language pairs to a reviewer
**When** they click the language pairs cell for a reviewer row
**Then:**
- An inline multi-select editor appears (use `Popover` + `Command` pattern from shadcn/ui — same pattern as `ReviewerSelector`)
- Options are sourced from the tenant's configured language pair targets in `language_pair_configs` table (field: `targetLang`)
- Admin can toggle language pairs on/off with checkmarks
- Changes save immediately on selection (optimistic with toast feedback)
- The updated language pairs persist to `users.nativeLanguages` JSONB column
- Audit log records the change

**Implementation notes:**
- Create new Server Action: `src/features/admin/actions/updateUserLanguages.action.ts`
  - Requires `admin` role (write)
  - Validates: `{ userId: z.string().uuid(), nativeLanguages: z.array(z.string().regex(/^[a-z]{2,3}(-[A-Z][a-zA-Z]{1,7})*$/).min(1)).max(20).refine(langs => new Set(langs).size === langs.length, 'Duplicate languages') }` (Guardrail #24: array uniqueness + BCP-47 format validation)
  - Fetch current `users.nativeLanguages` BEFORE update for audit `oldValue` (pattern: `updateUserRole.action.ts:46-56`)
  - Updates `users.nativeLanguages` via Drizzle: `db.update(users).set({ nativeLanguages }).where(and(eq(users.id, userId), withTenant(users.tenantId, tenantId)))`
  - Writes audit log: `action: 'user.languages.updated'`, `oldValue: { nativeLanguages: current }`, `newValue: { nativeLanguages }`
  - Import `writeAuditLog` from `@/features/audit/actions/writeAuditLog` (NOT `@/lib/audit`)
  - Import `revalidatePath` from `next/cache` — call `revalidatePath('/admin')` after success
  - Self-update is ALLOWED (unlike role changes) — admin may set their own languages even though they show "N/A" in the table
  - Returns updated user data
- Create new component: `src/features/admin/components/LanguagePairEditor.tsx`
  - Uses `Popover` + `Command` (CommandInput + CommandList + CommandItem with checkbox)
  - Props: `userId`, `currentLanguages: string[]`, `availableLanguages: string[]`, `disabled`, `onUpdate`
- Available languages fetched server-side in `admin/page.tsx` from `language_pair_configs` DISTINCT `targetLang` WHERE `tenantId`
- Pattern reference: existing `ReviewerSelector.tsx` uses same `Command` component

### AC3: Create User Form — Language Pairs Field (UX-NEW-14 extension)

**Given** an Admin creates a new reviewer via the Add User form
**When** they select role = `qa_reviewer` or `native_reviewer`
**Then:**
- A "Language Pairs" multi-select field appears below the Role field (hidden when role = `admin`)
- Uses the same `LanguagePairEditor` component pattern (but inline in the form, not popover)
- Selected language pairs are included in the `createUser` action
- If no language pairs selected, user is created with `nativeLanguages: []` (empty array, not null)

**Implementation notes:**
- Extend `createUserSchema` in `userSchemas.ts` to accept optional `nativeLanguages: z.array(z.string()).default([])`
- In `createUser.action.ts:37` update destructure: `const { email, displayName, role, nativeLanguages } = parsed.data`
- In `createUser.action.ts:60-65` add `nativeLanguages` to the `tx.insert(users).values({...})` object (inside the existing `db.transaction()` block)
- Also add `nativeLanguages` to the audit log `newValue` at line 79: `newValue: { email, role, displayName, nativeLanguages }`
- Conditional render in form: show language pair selector only when `newRole !== 'admin'`

### AC4: Empty Reviewer Fallback Message in Assignment Dialog (A-01 / TD-UX-021)

**Given** a user opens the File Assignment Dialog for a file
**When** no reviewers match the file's target language (0 results from `getEligibleReviewers`)
**Then:**
- Instead of generic "No matching reviewers found", show:
  - Icon: `UserPlus` (from lucide-react)
  - Heading: "No reviewers available for {targetLanguage}"
  - Body: "Assign language pairs to reviewers in User Management, or invite new team members."
  - CTA button: "Go to User Management" → navigates to `/admin` (using `next/link`)
- The CTA button is only shown to admin users (check `role` from current user context)
- Non-admin users see: "Contact your admin to assign reviewers for this language pair."

**Implementation notes:**
- Modify `ReviewerSelector.tsx` `<CommandEmpty>` content — replace plain text with structured empty state
- Pass `userRole` prop to `ReviewerSelector` (or `isAdmin` boolean)
- Pass `targetLanguage` prop to show in the message
- Use `Link` from `next/link` for navigation (not `router.push`)
- Update `FileAssignmentDialog.tsx` to pass role/targetLanguage down to ReviewerSelector

### AC5: All Reviewers Fallback — Show Unfiltered List (MULTI-05 partial)

**Given** no reviewers match the file's target language
**When** the empty state message is shown
**Then:**
- Below the empty state message, show an expandable section: "Show all reviewers (any language)"
- When expanded, shows all reviewers in the tenant regardless of language pair match
- Each reviewer shows a warning badge: "No match" in amber/yellow
- Selecting an unmatched reviewer shows a confirmation: "This reviewer is not assigned to {targetLanguage}. Assign anyway?"
- This allows admins to still assign files even when language pair data is incomplete

**Implementation notes:**
- Modify `getEligibleReviewers.action.ts` to accept optional `includeAll: boolean` parameter
- When `includeAll` is true, remove the `sql\`users.nativeLanguages @> ...\`` filter from `.where()` clause (line 74), then compute `isLanguageMatch` in the `.map()` step: `isLanguageMatch: (r.nativeLanguages ?? []).includes(targetLanguage)`
- When `includeAll` is false (default), set `isLanguageMatch: true` for all results (they all match by definition)
- Add `isLanguageMatch: boolean` field to `ReviewerOption` type
- In `ReviewerSelector.tsx`, add expandable section using `Collapsible` + `CollapsibleTrigger` + `CollapsibleContent` from `@/components/ui/collapsible` (installed from shadcn/ui, uses `radix-ui` under the hood)
- In `FileAssignmentDialog.tsx`, add confirmation dialog (use `AlertDialog`) before assigning unmatched reviewer

## UX States Checklist (Guardrail #96)

- [x] **Loading state:** Skeleton rows in language pairs column while page loads; Spinner in LanguagePairEditor while saving
- [x] **Error state:** Toast error on save failure with retry action; Inline error text in assignment dialog
- [x] **Empty state:** "None assigned" muted text for reviewers without language pairs; Structured empty state in assignment dialog (AC4)
- [x] **Success state:** Toast confirmation on language pair update; Badge immediately updates in table (optimistic)
- [x] **Partial state:** N/A — all operations are atomic
- [x] **UX Spec match:** Verified against `_bmad-output/planning-artifacts/ux-design-specification/`

## Tasks / Subtasks

- [x] Task 1: Extend admin page query + UserRow type (AC: #1)
  - [x] 1.1 Add `users.nativeLanguages` to SELECT in `admin/page.tsx`
  - [x] 1.2 Extend `UserRow` type to include `nativeLanguages: string[] | null`
  - [x] 1.3 Fetch tenant's available target languages from `language_pair_configs` (DISTINCT `targetLang`)
  - [x] 1.4 Pass both to `<UserManagement>` component

- [x] Task 2: Create `updateUserLanguages` Server Action (AC: #2)
  - [x] 2.1 Create `src/features/admin/actions/updateUserLanguages.action.ts`
  - [x] 2.2 Zod schema with BCP-47 regex + `.refine()` uniqueness (Guardrail #24)
  - [x] 2.3 Fetch current `nativeLanguages` BEFORE update for audit `oldValue`
  - [x] 2.4 Require admin role (write), update `users.nativeLanguages`, write audit log with old/new
  - [x] 2.5 Import `writeAuditLog` from `@/features/audit/actions/writeAuditLog`
  - [x] 2.6 `revalidatePath('/admin')` via `next/cache` after success

- [x] Task 3: Create `LanguagePairEditor` component (AC: #2)
  - [x] 3.1 Create `src/features/admin/components/LanguagePairEditor.tsx`
  - [x] 3.2 Popover + Command multi-select with checkbox items
  - [x] 3.3 Immediate save on toggle with optimistic update + toast
  - [x] 3.4 Disabled state during save

- [x] Task 4: Add Language Pairs column to user table (AC: #1)
  - [x] 4.1 Add column header between "Role" and "Joined"
  - [x] 4.2 Render badges for reviewers, "N/A" for admins, "None assigned" for empty
  - [x] 4.3 Click on cell opens `LanguagePairEditor` popover

- [x] Task 5: Extend Create User form (AC: #3)
  - [x] 5.1 Add conditional language pair selector when role is reviewer
  - [x] 5.2 Extend `createUserSchema` in `userSchemas.ts` with optional `nativeLanguages`
  - [x] 5.3 Update destructure at `createUser.action.ts:37` to include `nativeLanguages`
  - [x] 5.4 Add `nativeLanguages` to `tx.insert(users).values({...})` at line 60-65 (inside transaction)
  - [x] 5.5 Add `nativeLanguages` to audit log `newValue` at line 79

- [x] Task 6: Improve empty reviewer UX in assignment dialog (AC: #4, #5)
  - [x] 6.1 Add `targetLanguage` and `userRole`/`isAdmin` props to `ReviewerSelector`
  - [x] 6.2 Replace `CommandEmpty` with structured empty state (icon, heading, CTA)
  - [x] 6.3 Add "Show all reviewers" collapsible fallback
  - [x] 6.4 Add `includeAll` parameter to `getEligibleReviewers.action.ts`
  - [x] 6.5 Add `isLanguageMatch` field to `ReviewerOption`
  - [x] 6.6 Add confirmation AlertDialog for unmatched reviewer assignment

- [x] Task 7: Unit tests
  - [x] 7.1 `updateUserLanguages.action.test.ts` — success, unauthorized, invalid input, duplicate languages (Guardrail #24), invalid BCP-47
  - [x] 7.2 `updateUserLanguages.action.test.ts` — self-update allowed (unlike role), oldValue captured in audit
  - [x] 7.3 Extend `createUser.action.test.ts` — verify nativeLanguages flows through to `tx.insert(users)`
  - [x] 7.4 `getEligibleReviewers` — test `includeAll: true` returns all reviewers with `isLanguageMatch` field
  - [x] 7.5 `getEligibleReviewers` — test `includeAll: false` (default) only returns language-matched reviewers
  - [x] 7.6 Edge case: empty tenant (no `language_pair_configs`) — LanguagePairEditor shows empty options gracefully

## Dev Notes

### Architecture Patterns

- **Server Actions pattern:** `{verb}.action.ts` with `ActionResult<T>` return type, Zod validation, `requireRole()` guard, `writeAuditLog()`, `revalidatePath()`. See existing `updateUserRole.action.ts` as reference.
- **RBAC M3 pattern:** Use `requireRole('admin', 'write')` for mutations. JWT claims for reads.
- **Multi-tenancy:** Every DB query MUST use `withTenant()`. The `users.nativeLanguages` update MUST include `withTenant(users.tenantId, tenantId)` in WHERE clause.
- **Audit:** Every state-changing action writes to immutable audit log. Use `writeAuditLog()` from `@/features/audit/actions/writeAuditLog`. Must capture `oldValue` + `newValue` (see `updateUserRole.action.ts:46-56` pattern — fetch current state BEFORE updating).
- **revalidatePath:** Import from `next/cache`. No existing admin action uses it yet — this story introduces it. Add `revalidatePath('/admin')` after successful mutation to reconcile optimistic updates.

### Existing Components to Reuse

| Component | Location | Usage |
|-----------|----------|-------|
| `ReviewerSelector` | `src/features/project/components/ReviewerSelector.tsx` | Reference for Command-based selector pattern |
| `FileAssignmentDialog` | `src/features/project/components/FileAssignmentDialog.tsx` | Target for AC4/AC5 modifications |
| `FileAssignmentCell` | `src/features/project/components/FileAssignmentCell.tsx` | No changes needed |
| `Badge` | `src/components/ui/badge.tsx` | Language pair display |
| `Command` | `src/components/ui/command.tsx` | Multi-select base |
| `Popover` | `src/components/ui/popover.tsx` | Inline editor wrapper |
| `Collapsible` | `src/components/ui/collapsible.tsx` | "Show all reviewers" expandable section |
| `AlertDialog` | `src/components/ui/alert-dialog.tsx` | Unmatched reviewer confirmation |

### Existing Server Actions to Extend

| Action | Location | Changes |
|--------|----------|---------|
| `createUser.action.ts` | `src/features/admin/actions/` | Add optional `nativeLanguages` to schema + DB insert |
| `getEligibleReviewers.action.ts` | `src/features/project/actions/` | Add `includeAll` parameter, add `isLanguageMatch` to response |

### New Files to Create

| File | Type | Purpose |
|------|------|---------|
| `src/features/admin/actions/updateUserLanguages.action.ts` | Server Action | Update user's nativeLanguages |
| `src/features/admin/components/LanguagePairEditor.tsx` | Component | Multi-select language pair editor |
| `src/features/admin/actions/updateUserLanguages.action.test.ts` | Test | Unit tests for new action |
| `src/features/admin/validation/userSchemas.ts` | Validation | Extend with `updateUserLanguagesSchema` |

### DB Schema — Already Exists (No Migration Needed)

- `users.nativeLanguages` column: `jsonb('native_languages').$type<string[]>()` at `src/db/schema/users.ts:14` — nullable, already in production
- `language_pair_configs` table: `src/db/schema/languagePairConfigs.ts` — has `targetLang` field for available languages
- `file_assignments` table: `src/db/schema/fileAssignments.ts` — already fully defined with all fields

### Critical Guardrails

| # | Guardrail | Applies To |
|---|-----------|------------|
| 1 | `withTenant()` on EVERY query | All DB queries in new action + extended actions |
| 3 | Guard `rows[0]!` after SELECT | `updateUserLanguages` — verify user exists before update |
| 4 | `inArray(col, [])` = invalid SQL | Check `nativeLanguages.length` before any `inArray` usage |
| 8 | DB constraint audit on schema change | No schema change — just updating JSONB column |
| 15 | Severity display: icon + text + color | Badge color for language pairs — not color-only |
| 17 | Keyboard shortcuts suppressed in inputs | N/A — LanguagePairEditor is on admin page, not review page (no review shortcuts active) |
| 24 | Zod array uniqueness | `nativeLanguages` array must `.refine()` for uniqueness (no duplicate language codes) |
| 21 | Dialog state reset on re-open | LanguagePairEditor popover must reset on re-open |
| 22 | No bare `string` for status/severity | Use `AppRole` type for role checks |

### Deferred / Out of Scope

- **Reviewer Online/Offline availability indicators:** UX spec wireframe (user-journey-flows.md UJ4) shows green/yellow/red status dots. This requires Supabase Presence (Epic 6 scope). Intentionally DEFERRED — the "Show all reviewers" fallback (AC5) addresses the practical gap.
- **Clearing `nativeLanguages` on role change to admin:** When `updateUserRole` changes a user TO admin, `nativeLanguages` is NOT cleared (data preservation). The `getEligibleReviewers` query already filters by reviewer roles via `userRoles` join, so admin users with stale `nativeLanguages` won't appear in reviewer lists.
- **Keyboard shortcuts in LanguagePairEditor:** This component lives on the admin page (not review page). Review page keyboard handler at `useKeyboardActions` is not active on admin routes. No additional suppression needed.

### Anti-Patterns to Avoid

- Do NOT create a new DB table for `reviewer_language_pairs` — use existing `users.nativeLanguages` JSONB column
- Do NOT use `export default` — named exports only (EXCEPTION: `admin/page.tsx` is a Next.js page — `export default` is required there, do NOT change it)
- Do NOT add manual focus trap or Escape handling to `AlertDialog` — Radix `AlertDialog` handles Guardrail #18 (focus trap + Escape) automatically
- Do NOT use `any` type — strict typing throughout
- Do NOT use `console.log` — use structured logging if needed
- Do NOT use `process.env` directly — use `@/lib/env`
- Do NOT use inline Supabase client — use `db` from `@/db/client`

### Testing Requirements

- **Unit tests** for `updateUserLanguages.action.ts` — co-located at `updateUserLanguages.action.test.ts`
- **Extend** `createUser.action.test.ts` — verify `nativeLanguages` flows through
- **Extend** `getEligibleReviewers.action.test.ts` — test `includeAll` mode and `isLanguageMatch`
- Use test factories from `src/test/factories.ts`
- Use `drizzleMock` from `src/test/drizzleMock.ts` for DB mock

### Project Structure Notes

- All admin components stay in `src/features/admin/components/`
- All admin actions stay in `src/features/admin/actions/`
- The `LanguagePairEditor` is an admin-only component — do NOT put it in `src/components/ui/`
- The `ReviewerSelector` changes stay in `src/features/project/components/` (it belongs to project feature, not admin)
- Validation schemas extend existing `src/features/admin/validation/userSchemas.ts`

### Previous Story Intelligence

**From S-FIX-4 (Review Layout Complete — done):**
- Used CSS custom properties for responsive widths — follow same pattern if adding responsive behavior
- Used `useTransition` for async operations — same pattern for language pair updates
- Dialog state reset pattern (Guardrail #21): `const [prev, setPrev] = useState(open); if (prev !== open) { ... }` — already implemented in `FileAssignmentDialog.tsx:51-61`

**From Story 6.1 (File Assignment — done):**
- `getEligibleReviewers` already uses LEFT JOIN + COUNT FILTER for workload calculation
- `ReviewerSelector` already has `Command` pattern with auto-suggest star icon
- `FileAssignmentDialog` already handles form reset on re-open correctly
- `assignFile.action.ts` already exists — no changes needed for this story

### References

- [Finding UX-NEW-14]: `_bmad-output/DEEP-VERIFICATION-CHECKLIST.md` > Admin section
- [Finding A-01/TD-UX-021]: `_bmad-output/DEEP-VERIFICATION-CHECKLIST.md` > File Assignment
- [Finding MULTI-05]: `_bmad-output/DEEP-VERIFICATION-CHECKLIST.md` > Multi-user scenario
- [UX Spec — Reviewer Selector]: `_bmad-output/planning-artifacts/ux-design-specification/user-journey-flows.md` > UJ4 PM Self-Service
- [UX Spec — Component Strategy]: `_bmad-output/planning-artifacts/ux-design-specification/component-strategy.md` > ReviewerSelector
- [Architecture — RBAC M3]: `_bmad-output/planning-artifacts/architecture/core-architectural-decisions.md` > Section 2.1
- [File Assignment Spike]: `_bmad-output/planning-artifacts/research/file-assignment-ux-spike-2026-03-30.md`
- [Story 6.1 Implementation]: `_bmad-output/implementation-artifacts/6-1-file-assignment-language-pair-matching.md`
- [Existing Code — UserManagement]: `src/features/admin/components/UserManagement.tsx`
- [Existing Code — ReviewerSelector]: `src/features/project/components/ReviewerSelector.tsx`
- [Existing Code — FileAssignmentDialog]: `src/features/project/components/FileAssignmentDialog.tsx`
- [Existing Code — getEligibleReviewers]: `src/features/project/actions/getEligibleReviewers.action.ts`
- [DB Schema — users.nativeLanguages]: `src/db/schema/users.ts:14`
- [DB Schema — languagePairConfigs]: `src/db/schema/languagePairConfigs.ts`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M ctx) — Amelia (bmad-agent-dev)

### Debug Log References

- Unit tests (touched files): 34/34 PASS — `npx vitest run --project unit src/features/admin/... src/features/project/actions/getEligibleReviewers.action.test.ts`
- Type-check: GREEN (`npm run type-check`)
- Lint: 0 errors (pre-existing warnings only)
- Full unit suite: only pre-existing failures on main (`processFile.batch-completion.test.ts`, `processFile.story34.test.ts`) — verified by stash+retry on baseline. Not caused by this story. TaxonomyManager + ProjectTour flaked under full-run timing but passed in isolation.

### Completion Notes List

- **AC1 (Language Pairs column):** `admin/page.tsx` fetches `users.nativeLanguages` + DISTINCT `languagePairConfigs.targetLang`. `UserManagement` renders a new column between Role and Joined: `Badge`s for reviewers, `N/A` for admins, "None assigned" muted italic for empty.
- **AC2 (Inline multi-select editor):** New `LanguagePairEditor` component uses `Popover` + `Command` + `CommandItem` with check marks. Saves immediately on toggle via `updateUserLanguages` Server Action with optimistic update + toast. Shows `Loader2` spinner during save. Reverts optimistic state on failure.
- **AC2 (Server Action):** `updateUserLanguages.action.ts` — `requireRole('admin', 'write')`, Zod schema with BCP-47 regex + `.refine()` uniqueness (Guardrail #24), captures `oldValue` BEFORE update (pattern from `updateUserRole.action.ts:46-56`), writes audit log `user.languages.updated`, calls `revalidatePath('/admin')`. Self-update allowed.
- **AC3 (Create User form):** Added local-state chip picker (`NewUserLanguageChips`) rendered only when `role !== 'admin'`. `createUserSchema` extended with `nativeLanguages: z.array(bcp47).refine(uniqueness).default([])`. `createUser.action.ts` destructures + inserts into `users` + adds to audit `newValue`.
- **AC4 (Empty reviewer structured state):** `ReviewerSelector` `CommandEmpty` now renders `EmptyReviewerState` with `UserPlus` icon, heading "No reviewers available for {targetLanguage}", helper copy + conditional "Go to User Management" `next/link` button (admin only). Non-admin users see "Contact your admin..." text.
- **AC5 (Fallback + confirmation):** `getEligibleReviewersSchema` adds `includeAll: z.boolean().default(false)`. When true, removes `@> jsonb` filter and computes `isLanguageMatch` per reviewer. Auto-suggest only picks language-matched reviewers. `ReviewerSelector` shows `Collapsible` "Show all reviewers (any language)" trigger when primary list is empty; fallback list lazy-loads and renders `AlertTriangle` amber "No match" badge for unmatched reviewers. `FileAssignmentDialog` added `AlertDialog` confirmation ("This reviewer is not assigned to {targetLanguage}. Assign anyway?") when the selected reviewer came from the fallback and is unmatched.
- **Type propagation:** New required `currentUserRole: AppRole` prop added to `FileAssignmentDialog` → `FileAssignmentCell` → `FileHistoryTable` → `FileHistoryPageClient` → `files/page.tsx` (uses `currentUser.role` from `requireRole`). `FileHistoryTable.test.tsx` defaultProps updated.
- **Tests added:** `updateUserLanguages.action.test.ts` (9 tests: FORBIDDEN, invalid UUID, invalid BCP-47, duplicate dedup, NOT_FOUND, success+audit+revalidate, null previous, self-update allowed, empty clearing). `createUser.action.test.ts` extended (default empty, pass-through to insert + audit, duplicate rejection). `getEligibleReviewers.action.test.ts` extended (`isLanguageMatch=true` when default, per-row compute when `includeAll=true`, no auto-suggest on zero matches).
- **Guardrails respected:** #1 `withTenant()` on every query, #3 `rows[0]!` guard via `[current]` + NOT_FOUND check, #21 render-time reset pattern in dialog + UserManagement, #22 `AppRole` union (no bare string), #24 Zod array uniqueness refinement.

### File List

**New:**
- `src/features/admin/actions/updateUserLanguages.action.ts`
- `src/features/admin/actions/updateUserLanguages.action.test.ts`
- `src/features/admin/components/LanguagePairEditor.tsx`

**Modified:**
- `src/app/(app)/admin/page.tsx` — fetch `nativeLanguages` + DISTINCT `targetLang`
- `src/app/(app)/projects/[projectId]/files/page.tsx` — pass `currentUserRole`
- `src/features/admin/actions/createUser.action.ts` — destructure + insert + audit `nativeLanguages`
- `src/features/admin/actions/createUser.action.test.ts` — new tests for `nativeLanguages`
- `src/features/admin/components/UserManagement.tsx` — Language Pairs column + chip picker
- `src/features/admin/validation/userSchemas.ts` — BCP-47 + uniqueness refine + `updateUserLanguagesSchema`
- `src/features/batch/components/FileHistoryPageClient.tsx` — `currentUserRole` prop
- `src/features/batch/components/FileHistoryTable.tsx` — `currentUserRole` prop
- `src/features/batch/components/FileHistoryTable.test.tsx` — defaultProps
- `src/features/project/actions/getEligibleReviewers.action.ts` — `includeAll` + `isLanguageMatch`
- `src/features/project/actions/getEligibleReviewers.action.test.ts` — new tests
- `src/features/project/components/FileAssignmentCell.tsx` — `currentUserRole` prop
- `src/features/project/components/FileAssignmentDialog.tsx` — role-aware selector, fallback fetch, unmatched confirmation
- `src/features/project/components/ReviewerSelector.tsx` — structured empty state + collapsible fallback
- `src/features/project/validation/fileAssignmentSchemas.ts` — `includeAll` field

## Change Log

- 2026-04-05 — S-FIX-14 implementation: language pair assignment UX (admin page column + inline editor), Create User form extension, empty-state CTA + fallback reviewer list with unmatched confirmation. 34 new/modified unit tests, all GREEN.
- 2026-04-05 — Code review R1 (Blind + Edge + Auditor) — 0 decision-needed, 10 patch, 6 defer, 10 dismiss. Auditor verdict: **ACs satisfied 5/5** (AC3 cosmetic deviation: `NewUserLanguageChips` instead of `LanguagePairEditor` inline mode — functionally equivalent, dismissed).
- 2026-04-05 — R1 batch-patch applied: all 10 `patch` findings fixed. Touched unit tests 77/77 GREEN (34 new BCP-47 boundary tests + FORBIDDEN-includeAll security test). `npm run type-check` GREEN, `npm run lint` 0 errors. Story status → **done**.
- 2026-04-05 — R1 deferred items resolved (6/6): D1 optimistic-lock, D2 tie-break fix, D3 CommandEmpty cmdk, D4 empty-tenant guidance, D5 already covered by P10, D6 table-identity test helper. Tests 81/81 GREEN (+4 optimistic-lock tests). Zero remaining debt from R1.
- 2026-04-05 — Code review R2 (Blind + Edge + Auditor, full 3-layer). Auditor: ACs 5/5, R1 fixes 16/16 ✅. Adversarial layers flagged **2 regressions in D1** (case+order-sensitive compare, previousLanguages snapshot captures optimistic parent state) + TOCTOU gap + selectedReviewer stale → bypasses confirmation. 0 decision-needed, 9 patch, 4 defer, ~15 dismissed.
- 2026-04-05 — R2 batch-patch applied: all 9 patches fixed. R2-P1+P3 (normalized set compare + atomic conditional UPDATE with `IS NOT DISTINCT FROM` JSONB check), R2-P2 (serverLanguages prop for snapshot baseline), R2-P4 (clear selectedReviewer on targetLanguage), R2-P5 (guard empty targetLanguage), R2-P6 (revalidatePath on CONFLICT), R2-P7 (isLoading prop + skeleton), R2-P8 (fallbackOpen render-time reset), R2-P9 (6 new regression tests). Tests 87/87 GREEN (+6 new: order/case tolerance, TOCTOU zero-row CONFLICT, dual revalidate paths). Type-check GREEN, lint 0 errors. Story status → **done**.
- 2026-04-05 — R2 post-review triage: R2-D3 (sourceLang in availableLanguages) **dismissed** after domain analysis — UX spec models `nativeLanguages` as target-side only; adding sourceLang would produce dead data. R2-D1+D2 **resolved**: D2 admin-role filter added to `getEligibleReviewers` JOIN (correctness fix, not scope ambiguity); D1 new `LanguagePairEditor.test.tsx` covers display/optimistic/revert/CONFLICT/snapshot-baseline/empty-tenant. Only R2-D4 (full CONFLICT dialog per Guardrail #25) remains deferred. Tests **100/100 GREEN** (+13: 1 admin-exclusion + 12 component tests). Type-check GREEN, lint 0 errors.
- 2026-04-05 — Code review R3 (Edge + Auditor; Blind Hunter 529 overloaded). Auditor: ACs 5/5, R2 9/9, post-R2 3/3, 100/100 tests ✅. **Edge Hunter found 2 CRITICAL bugs in R2-P3 that Auditor missed** (Auditor verified spec-match, not semantic correctness of the new SQL): (#1) JSONB `IS NOT DISTINCT FROM ::jsonb` is positional compare — asymmetric with JS `languageSetsEqual` set-compare → guaranteed false CONFLICT on any reorder/case variation; (#2) `NULL IS NOT DISTINCT FROM '[]'::jsonb = false` in Postgres → users with null nativeLanguages can never save their first edit (CONFLICT every time). Also: R2-D2 admin-exclusion test is a no-op (mock drizzle doesn't enforce SQL semantics), LanguagePairEditor test has latent `mockReturnValue` leak. 3 patch, 0 defer, ~5 dismissed.
- 2026-04-05 — R3 batch-patch applied: all 3 patches fixed. **R3-P1** (CRITICAL double-bug): new `canonicalizeLanguages()` helper in `userSchemas.ts` (sort + lowercase via `normalizeBcp47`); applied in `updateUserLanguages.action.ts` (both write value + read baseline + client snapshot all canonicalized before compare) and `createUser.action.ts` (canonicalize before insert); SQL predicate now uses `COALESCE(users.nativeLanguages, '[]'::jsonb) IS NOT DISTINCT FROM ...` to unify null/[] handling; `admin/page.tsx` canonicalizes `availableLanguages` + `userList.nativeLanguages` on read to align display with canonical storage. **R3-P2**: module-level spy on drizzle `inArray` — 2 new tests verify the `REVIEWER_ROLES` filter is present in JOIN predicate for both `includeAll=true` and default paths (real regression guard, not behavioural no-op). **R3-P3**: `vi.resetAllMocks()` in `LanguagePairEditor.test.tsx` `beforeEach` to clear mock implementations between tests. Tests **104/104 GREEN** (+4: 3 R3-P1 canonicalization + 1 R3-P2 default-path filter; R3-P2 replaces the R2-D2 behavioural no-op). Type-check GREEN, lint 0 errors.
- 2026-04-05 — Code review R4 (Blind + Edge + Auditor). Auditor: ACs 5/5, R3 3/3, prior fixes 6/6, 104/104 tests ✅. **Blind + Edge Hunter found a new CRITICAL bug introduced by R3-P1** — the write side of `users.nativeLanguages` was canonicalized (lowercase) but the read side in `getEligibleReviewers.action.ts` was NOT. Files with target language in ANY uppercase form (`th-TH`, `ja-JP`, `zh-Hant-TW` — 90%+ of real-world tags) now match ZERO reviewers because the JSONB `@>` containment is case-sensitive and the stored nativeLanguages are lowercase. R3 fixed the admin UI but broke file assignment. 3 patch, 0 defer, ~10 dismissed.
- 2026-04-05 — R4 batch-patch applied: all 3 patches fixed. **R4-P1** (CRITICAL): `getEligibleReviewers.action.ts` now normalizes `targetLanguage` via `normalizeBcp47()` before building the JSONB `@>` predicate AND before the JS `.includes()` check in the `includeAll` branch. Read side now matches the canonical write side from R3-P1. **R4-P2**: `admin/page.tsx` swapped inline `Array.from(new Set(...)).sort()` for the shared `canonicalizeLanguages` helper — DRY + consistency. **R4-P3**: 2 new regression tests in `getEligibleReviewers.action.test.ts` — (a) reviewer with canonical `['th-th']` matches input `'th-TH'`, (b) `includeAll=true` computes `isLanguageMatch` using normalized form (`'TH-TH'` → canonical lookup). Tests **106/106 GREEN** (+2 R4 regression tests). Type-check GREEN, lint 0 errors.
- 2026-04-06 — **Root-cause refactor (RC-1..6)** — R1→R4 pattern was "fix one site, miss another" for language tag canonicalization. Root cause: comparisons scattered across modules with no shared abstraction. Fix attacks the whole class of bug:
  - **RC-1**: Moved `normalizeBcp47` + `canonicalizeLanguages` + `languageSetsEqual` to project-wide `src/lib/language/bcp47.ts`. `userSchemas.ts` re-exports for backwards compat.
  - **RC-2**: Added Zod `.transform(canonicalizeBcp47)` on `bcp47LanguageSchema` (userSchemas) and `bcp47Schema` (projectSchemas). Arrays also `.transform(canonicalizeLanguages)`. Any validated value is guaranteed canonical at the validation boundary — callers physically cannot skip canonicalization.
  - **RC-3**: Fixed exhaustive audit BUG #2 — `createProjectSchema` + `updateLanguagePairConfigSchema` now canonicalize `sourceLang` + `targetLangs` / `targetLang` via schema transforms. Every write to `projects.sourceLang`, `projects.targetLangs`, `languagePairConfigs.sourceLang`, `languagePairConfigs.targetLang` is canonical.
  - **RC-4**: Fixed BUG #2 cascade — `parseFile.action.ts` canonicalizes project/XLIFF language headers via `canonicalizeBcp47()` BEFORE inserting into `segments.sourceLang`/`segments.targetLang`. Also canonicalizes per-segment values in the batch map. Segments layer is now guaranteed canonical, which means downstream `ruleEngine`, `scoreFile`, `flagForNative`, `autoPassChecker`, `buildBTPrompt`, `determineNonNative` all receive canonical values without needing per-call-site patches.
  - **RC-5**: Fixed BUG #1 — `ProjectCreateDialog.tsx` canonicalizes state on input (`toggleTargetLang`, `setSourceLang` via `onValueChange`) and compares canonical forms in the `.includes()` checkbox check.
  - **RC-6**: Refactored `updateUserLanguages.action.ts` to rely on Zod transform output (no explicit action-level canonicalization); updated stale test expectations in `userSchemas.test.ts`, `createUser.action.test.ts`, `parseFile.action.test.ts` (5 test fixture updates to canonical form).
  - **Tests**: impacted-dirs suite **498/498 GREEN**; full unit suite **4669/4669 GREEN** (6 pre-existing failures in `processFile.story34.test.ts` and sibling Inngest tests — verified by stash+retry on main baseline, unrelated to this story). Type-check GREEN, lint 0 errors.
  - **Prevention**: Zod schema transforms are now the single source of truth for canonicalization. Any future call site that runs data through a schema cannot skip normalization. The rolling bug pattern is closed.
- 2026-04-06 — **Final comprehensive review (Phase 1-5)** — Mona requested full CR + root-cause sweep + pre-existing failure fix + refactor permission. 12 new findings uncovered despite RC refactor:
  - **Phase 1** — Pre-existing failures fixed: `processFile.story34.test.ts` + `processFile.batch-completion.test.ts` asserted `expect(step.sendEvent).not.toHaveBeenCalled()` but S-FIX-5 added `score.updated` event emission. Replaced broad assertions with event-name-specific filters. **Also caught a critical FALSE-GREEN**: my Phase 1 fix in `story34.test.ts` used `'batch.completed'` as the filter, but the actual event name is `'pipeline.batch-completed'` — the filter matched zero calls, passing the assertion trivially. Fixed (F1).
  - **Phase 2** — 3-agent CR on RC + R1-R4. Blind + Edge Hunter found 12 findings the RC refactor missed.
  - **Phase 3** — Codebase sweep for rolling-bug patterns: found 3 read-side holes that cascaded from legacy (pre-RC) data: `getEligibleReviewers.includeAll`, `flagForNative`, `scoreFile.createGraduationNotification`, `getBackTranslation` cache key.
  - **Phase 4** — Applied all fixes in a single refactor pass (F1–F12):
    - **F1**: False-green test — filter uses correct event name `'pipeline.batch-completed'`.
    - **F2**: Legacy row SQL predicate in `updateUserLanguages` — canonicalize DB side inside the atomic UPDATE via `jsonb_agg(lower(value) ORDER BY lower(value)) FROM jsonb_array_elements_text(...)`. Works for BOTH fresh and legacy rows — no backfill migration required.
    - **F3**: Read-side canonicalization added to `getEligibleReviewers` (JSONB `@>` + `isLanguageMatch`), `flagForNative` (JSONB `@>` + segment read), `scoreFile` (segment read), `getBackTranslation` (cache key + prompt builder).
    - **F4**: `canonicalizeBcp47` is now null-safe — returns `''` for `null`/`undefined`/non-string input so untyped boundaries (DB JSONB, XLIFF headers) can't throw.
    - **F5**: `createProjectSchema` rejects `sourceLang ∈ targetLangs`; `updateLanguagePairConfigSchema` rejects `sourceLang === targetLang` after canonicalization.
    - **F6**: Deleted duplicate `languageSetsEqual` local copy in `updateUserLanguages.action.ts` — now imports from `@/lib/language/bcp47`.
    - **F7**: Consolidated two `bcp47Schema` variants (userSchemas + projectSchemas) into shared `bcp47LanguageSchema` + `bcp47LanguageArraySchema(options)` in `@/lib/language/bcp47.ts`.
    - **F8**: `createProjectSchema.targetLangs` rejects case-insensitive duplicates explicitly (no more silent dedupe).
    - **F9**: Removed redundant `canonicalizeLanguages()` call in `createUser.action.ts` — schema transform is authoritative.
    - **F10**: New `src/lib/language/bcp47.test.ts` with 41 dedicated tests for the shared module (empty, single, dupes, mixed case, null-safety, schema integration).
    - **F11**: `admin/page.tsx` — `canonicalizeLanguages` now filters null/undefined defensively (from F4).
    - **F12**: `getEligibleReviewersSchema.targetLanguage` canonicalizes via `.transform(canonicalizeBcp47)` at schema boundary; `.max(10)` → `.max(35)` aligned with `bcp47LanguageSchema`.
  - **Phase 5** — Full verification:
    - **Full unit suite: 4718/4718 GREEN** (was 4669 passed + 6 pre-existing failures — now +49 tests, **0 failures**)
    - Type-check: GREEN
    - Lint: 0 errors
  - **Net effect**: All rolling-bug pattern holes closed. Legacy data regression mitigated without a migration (SQL-side canonicalization). Single source of truth schema in `@/lib/language/bcp47.ts` enforces canonicalization at all validation boundaries. No pre-existing failures blocking the suite.
- 2026-04-06 — Commit `9594cef feat(S-FIX-14): Admin & Assignment UX + root-cause canonicalization refactor` — 37 files, +3565/-256. Pre-commit lint-staged + type-check passed.
- 2026-04-06 — **Code review R6 (post-commit)** — Blind + Edge + Auditor against the committed snapshot. **Auditor: CLEAN** — all 42 tracked patches verified (ACs 5/5 + R1 10/10 + R2 9/9 + R3 3/3 + R4 3/3 + F 12/12), 4718/4718 tests GREEN, 0 regressions vs spec. **Adversarial layers found 4 issues** (2 duplicated across hunters):
  - **G1 (High)**: `ProjectCreateDialog` Select — `COMMON_LANGUAGES` has `'zh-Hant'` uppercase; state canonicalizes to `'zh-hant'` but `SelectItem value='zh-Hant'` → Radix can't find match → placeholder shown after selection. User-visible regression introduced by RC-5 client-side canonicalization. **Fix**: module-load `COMMON_LANGUAGES_CANONICAL` with all codes pre-canonicalized; SelectItem uses canonical value; downstream equality checks simplified to plain `.includes()`.
  - **G2 (Medium)**: `parseFile` canonicalization silently degrades `undefined` → `''` via F4 null-safety, violating Guardrail #14 "fail loud". Empty strings would pass NOT NULL checks and poison every downstream language comparison. **Fix**: `|| 'und'` fallback at all 3 canonicalization call sites in `parseFile.action.ts` (project read path, XLIFF header path, per-segment map).
  - **G3 (Low, both hunters)**: `bcp47.test.ts` max-length test false-green — items `'a1','a2'…` fail per-item regex before `.max()` refine evaluates. **Fix**: use 6 valid tags (`['en','th','ja','ko','es','de']`) + assert the message contains `"Maximum 5"`.
  - **G4 (Low, both hunters)**: `getEligibleReviewersSchema.targetLanguage` used hand-rolled `z.string().min(2).max(35).transform(canonicalizeBcp47)` — no regex validation, violating F7 single-source-of-truth. **Fix**: replace with shared `bcp47LanguageSchema` import.
  - **Verification**: type-check GREEN, lint 0 errors, impacted-dirs suite **1103/1103 GREEN**. G1-G4 cleanly applied.
  - **Deferred as tech debt (non-blocking)**: JWT stale role for `includeAll` (RBAC M3 question), lowercase BCP-47 display UX (needs `displayBcp47()` helper), deprecated re-export paths still imported by some files, no RLS test for F2 SQL, stale `batch.completed` comment phrasing, dead `prevOpen` reset block in `LanguagePairEditor`, potential `jsonb_array_elements_text` throw on non-string legacy data, subquery perf on large tenants.

## Review Findings (R4 — 2026-04-05)

**Sources:** Blind Hunter + Edge Case Hunter + Acceptance Auditor. Auditor verified spec compliance (5/5 + 3/3 + 6/6 + 104/104); adversarial layers caught the same class of bug as R3 — canonicalization applied asymmetrically between write and read paths.

### Patches

- [x] [Review][Patch] **R4-P1: `getEligibleReviewers` uses raw `targetLanguage` — R3-P1 canonicalization was write-only** — **CRITICAL production-blocker**:
  - `getEligibleReviewers.action.ts:~54` builds `targetLangJsonb = JSON.stringify([targetLanguage])` without canonicalization. R3-P1 made `users.nativeLanguages` store lowercase (`['th-th']`), but `targetLanguage` from `project.targetLangs` is still raw (`'th-TH'`).
  - SQL: `users.nativeLanguages @> '["th-TH"]'::jsonb` against stored `['th-th']` → JSONB `@>` is case-sensitive → **zero matches**. Every file whose project target has uppercase tags returns the empty reviewer state.
  - `includeAll=true` branch has the same bug in `.includes(targetLanguage)` at line ~95 → `isLanguageMatch` is always false, auto-suggest never fires, every reviewer gets the "No match" badge.
  - **Fix:** normalize `targetLanguage` via `normalizeBcp47()` before both the JSONB literal construction and the JS `.includes()`. **[getEligibleReviewers.action.ts]**
- [x] [Review][Patch] **R4-P2: `admin/page.tsx` uses inline canonicalization instead of `canonicalizeLanguages` helper** — DRY violation + drift risk. The helper exists (`userSchemas.ts`) and does exactly the same three ops (lowercase via `normalizeBcp47` → dedupe via Set → sort). Swap inline `Array.from(new Set(...)).sort()` calls for the helper import. **[admin/page.tsx]**
- [x] [Review][Patch] **R4-P3: Regression test for case-insensitive targetLanguage matching** — add a test in `getEligibleReviewers.action.test.ts` asserting that a reviewer with canonical `['th-th']` matches a file whose `targetLanguage='th-TH'`. Without this test, future refactors could silently re-introduce the same case-sensitivity bug. **[getEligibleReviewers.action.test.ts]**

### Deferred (none new in R4)

### Dismissed (R4 — ~10)

1. **Legacy unsorted-row CONFLICT loop** — feature is fresh; no DB rows predate R3-P1. If a backfill is ever needed it's a separate migration story.
2. **JSON.stringify SQL injection** — Drizzle `sql\`...${value}\`` parameterizes values; BCP-47 regex blocks special chars; defense-in-depth concern only.
3. **`mockToastSuccess`/`mockToastError` `resetAllMocks` concerns** — verified no-op: sonner mock closure retains refs, `vi.fn()` without `.mockImplementation` behaves identically after reset.
4. **Admin self-update creates "dead data"** — UI hides editor for admin rows; action endpoint is unreachable via normal flow. Documented in R3 dismissals.
5. **`vi.hoisted` missing for `mockInArrayCalls`** — async factory lazy-eval dodges TDZ in practice; tests pass; cosmetic robustness concern only.
6. **`Array.from(new Set([])).sort()` edge case** — works correctly for empty arrays.
7. **`createUserSchema` test expects non-canonical round-trip** — test asserts schema output, not action output; schema does not canonicalize (by design, the action does).
8. **`LanguagePairEditor.includes()` race on chip re-click after role flip** — UX hides editor for admin; unreachable.
9. **`fallbackGenRef` cosmetic redundancy on targetLanguage effect double-fire** — no bug, just a wasted generation ID on mount.
10. **React `act(...)` console warning on `LanguagePairEditor` suspended-resource test** — pre-existing, advisory, test passes.

## Review Findings (R3 — 2026-04-05)

**Sources:** Edge Case Hunter + Acceptance Auditor. Blind Hunter was unavailable (529 overloaded) — skipped, layer noted. Auditor verified R2 fixes line-by-line against the spec (5/5 + 9/9 + 3/3); Edge Hunter stress-tested semantic correctness and found **2 critical SQL-vs-JS asymmetries the Auditor could not catch**.

### Patches

- [x] [Review][Patch] **R3-P1: JSONB `IS NOT DISTINCT FROM` is positional — ASYMMETRIC with JS set-compare + breaks for `null` nativeLanguages** — **CRITICAL double-bug**:
  - (a) Postgres JSONB `IS NOT DISTINCT FROM ::jsonb` compares array elements by position. JS `languageSetsEqual` compares as a normalized set. Any reorder or case variation passes JS → fails SQL → returns CONFLICT + `revalidatePath` in a permanent loop. The atomic lock R2-P3 introduced is effectively *always* fires on certain rows.
  - (b) `previousLanguages = current.nativeLanguages ?? []` — if DB stores `NULL`, we compare `NULL IS NOT DISTINCT FROM '[]'::jsonb` which is `false` in Postgres. Users with null `nativeLanguages` (new accounts, role-flipped admins) **cannot save their first edit** — every write returns CONFLICT.
  - **Fix:** canonicalize `nativeLanguages` on write (sort + lowercase via `normalizeBcp47`) in the schema transform and action, AND use `COALESCE(users.nativeLanguages, '[]'::jsonb)` in the conditional UPDATE predicate. DB now always stores canonical-form; JS + SQL compare semantics align; null/[] unified.
  - **[updateUserLanguages.action.ts + userSchemas.ts + createUser.action.ts (also canonicalizes on insert for consistency)]**
- [x] [Review][Patch] **R3-P2: R2-D2 admin-exclusion test is a regression no-op** — the drizzle mock doesn't enforce SQL semantics, so the test only asserts that the action passes reviewer-role rows through — removing the `inArray(userRoles.role, REVIEWER_ROLES)` filter in production would not fail the test. **Fix:** add a negative test that spies on the JOIN predicate (or asserts admin-role rows in the mock input are NOT in the result), proving the filter is applied. **[getEligibleReviewers.action.test.ts]**
- [x] [Review][Patch] **R3-P3: `mockReturnValue(new Promise(() => {}))` leak in LanguagePairEditor tests** — `vi.clearAllMocks` (in `beforeEach`) does NOT reset mock implementations, only call history. The never-resolved promise stays as the mock's return value for any subsequent test that doesn't explicitly override. Currently safe because every later test calls `mockResolvedValue(...)`, but any future test added without explicit override inherits a hanging promise. **Fix:** use `vi.resetAllMocks()` in `beforeEach` (resets implementations), or explicitly `mockUpdateUserLanguages.mockReset()`. **[LanguagePairEditor.test.tsx]**

### Deferred (none new in R3)

R2-D4 (full CONFLICT dialog per Guardrail #25) remains the only carried-over deferred item.

### Dismissed (R3 — 5)

1. **New `[]` on every render in `UserManagement`** — perf only, React Compiler handles memoization; not correctness
2. **`reviewersLoading` theoretical leak on target-language mid-fetch** — Edge Hunter marked "safe by ordering accident"; current behaviour is correct
3. **Admin self-update creates "dead data"** — UI doesn't render `LanguagePairEditor` for admin rows (hidden behind `isReviewer` check in `UserManagement.tsx:204`), so the Server Action self-update path is unreachable through normal UI flow. Dev Notes already document this as "N/A in table". Dead code path in theory, but no UX consequence.
4. **`normalizeBcp47` lowercases script subtag** — `zh-Hant` and `zh-hant` both normalize to `zh-hant` — by design, two case-variants of the same tag are correctly deduplicated
5. **React `act(...)` warning on suspended-resource test** — advisory only, test passes; cosmetic polish

## Review Findings (R2 — 2026-04-05)

**Sources:** Blind + Edge + Auditor. Auditor verdict: ACs 5/5, R1 fixes 16/16. Adversarial findings below are **regressions introduced by R1 fixes** (especially D1).

### Patches

- [x] [Review][Patch] **R2-P1: D1 lock compare is case- AND order-sensitive** — `updateUserLanguages.action.ts:~58-61` uses `every((lang, i) => lang === previousLanguages[i])` which treats languages as an ordered tuple of case-sensitive strings. `['th-TH','ja']` vs DB `['ja','th-th']` produces a false CONFLICT even though the *sets* match under `normalizeBcp47`. **Fix:** compare `new Set(a.map(normalizeBcp47))` ⟷ `new Set(b.map(normalizeBcp47))` via size + element iteration. **[updateUserLanguages.action.ts]**
- [x] [Review][Patch] **R2-P2: `previousLanguages` snapshot captures already-optimistic parent state** — `LanguagePairEditor.handleToggle` snapshots `currentLanguages`, but `UserManagement` passes the optimistic `languagesByUser[id]` override when a save is in-flight. On rapid double-click, click #2 sends click #1's optimistic value as `previousLanguages` — if click #1's write landed, the snapshot equals DB and the lock passes (fine); if click #1 failed/is still in-flight, the snapshot ≠ DB and the lock triggers false CONFLICT. **Fix:** pass a separate `serverLanguages` prop (always from `user.nativeLanguages`, never the override) to `LanguagePairEditor` for snapshotting; keep `currentLanguages` for display only. **[LanguagePairEditor.tsx + UserManagement.tsx]**
- [x] [Review][Patch] **R2-P3: TOCTOU gap — SELECT+UPDATE not atomic** — `updateUserLanguages.action.ts:43-58` reads current state then updates in separate statements. Two fresh clients with identical valid snapshots both pass the lock check, then both UPDATE, last-write-wins. **Fix:** combine into a conditional UPDATE — add `previousLanguages` match to the UPDATE's WHERE clause (`WHERE user.id = $id AND native_languages = $previous`), then check `rowCount === 0` → return CONFLICT. Wrap in `db.transaction` if audit write needs atomicity. **[updateUserLanguages.action.ts]**
- [x] [Review][Patch] **R2-P4: `selectedReviewer` survives `targetLanguage` change → bypasses unmatched-confirmation** — `FileAssignmentDialog.tsx:~96-100` targetLanguage effect clears `fallbackReviewers` but keeps `selectedReviewer`. If user selected an unmatched reviewer from the old fallback list, `fromFallback` becomes `undefined` (fallback now null), the unmatched-confirmation AlertDialog is skipped, and `performAssign` runs silently. **Fix:** also `setSelectedReviewer(null)` in the targetLanguage effect. **[FileAssignmentDialog.tsx]**
- [x] [Review][Patch] **R2-P5: Empty `targetLanguage` still fires primary fetch → VALIDATION_ERROR flash** — `FileAssignmentDialog.tsx:~108` primary `useEffect` calls `getEligibleReviewers({ targetLanguage: '' })` when cell passes `targetLanguage ?? ''`; schema rejects (`min(2)`) and `setError` shows Zod message. **Fix:** early-return in the primary fetch effect and in the targetLanguage-clear effect when `!targetLanguage || targetLanguage.length < 2`. **[FileAssignmentDialog.tsx]**
- [x] [Review][Patch] **R2-P6: No `revalidatePath` on CONFLICT — client stuck** — `updateUserLanguages.action.ts` CONFLICT branch returns without calling `revalidatePath('/admin')`, so the next `UserManagement` render still has the stale prop; every subsequent click re-triggers CONFLICT. **Fix:** call `revalidatePath('/admin')` before returning CONFLICT so the client's next render has fresh data. **[updateUserLanguages.action.ts]**
- [x] [Review][Patch] **R2-P7: Empty-state flash during initial fetch** — `ReviewerSelector.tsx` renders `<EmptyReviewerState>` unconditionally when `reviewers.length === 0`, including the 50–300ms window before `FileAssignmentDialog`'s primary fetch resolves. Admins see "No reviewers available / Go to User Management" then real data. **Fix:** add `isLoading` prop to `ReviewerSelector`; show a skeleton/spinner inside the `!hasMatchingReviewers` branch when `isLoading=true`, suppressing `EmptyReviewerState`. Wire `isPending` from the primary fetch `useTransition`. **[ReviewerSelector.tsx + FileAssignmentDialog.tsx]**
- [x] [Review][Patch] **R2-P8: `ReviewerSelector.fallbackOpen` persists across parent state reset** — Local `useState(false)` on `fallbackOpen`; when parent clears `fallbackReviewers` due to `targetLanguage` change, the Collapsible stays visually open but no re-fetch can fire (guarded on `!fallbackReviewers && next`). User sees empty Collapsible with no way to retry. **Fix:** derive `fallbackOpen` from `fallbackReviewers != null` or reset via an effect `useEffect(() => { if (fallbackReviewers === null) setFallbackOpen(false) }, [fallbackReviewers])`. **[ReviewerSelector.tsx]**
- [x] [Review][Patch] **R2-P9: Missing regression tests for the 4 bugs above** — add unit tests: (a) D1 lock compare tolerates reordering + case variation, (b) CONFLICT branch calls `revalidatePath`, (c) `targetLanguage` change clears `selectedReviewer`, (d) empty `targetLanguage` short-circuits primary fetch. **[updateUserLanguages.action.test.ts + new FileAssignmentDialog / ReviewerSelector test coverage]**

### Deferred (post-R2 follow-up)

- [x] **R2-D1 RESOLVED (same session): LanguagePairEditor component tests** — optimistic update, revert on error, CONFLICT path, aria-label covered in new `LanguagePairEditor.test.tsx`. **[LanguagePairEditor.test.tsx]**
- [x] **R2-D2 RESOLVED (same session): Admins filtered out of `getEligibleReviewers`** — analysis showed this is a correctness bug, not scope ambiguity. UX spec + code flow confirm `nativeLanguages` matches target-side reviewers only; admins are not reviewers. Added `inArray(userRoles.role, ['qa_reviewer','native_reviewer'])` filter. **[getEligibleReviewers.action.ts + test]**
- [x] **R2-D4 DEFER ACCEPTED: Full CONFLICT dialog per Guardrail #25** — toast "refresh and try again" is MVP; proper dialog (Use theirs / Retry mine / Cancel) is real UX work. Deferred to UX polish sprint. Concurrent admin edits are rare in practice. **[LanguagePairEditor.tsx]**

### Dismissed (additional — 2026-04-05 post-R2 analysis)

- **R2-D3: `availableLanguages` excludes `sourceLang`** — **DISMISSED after domain analysis**. UX spec `component-strategy.md` explicitly models `nativeLanguages` as target-side only ("Native language pair" = reviewer native matches file *target* language; `LanguageBridge` component exists for non-native source cases). `getEligibleReviewers.action.ts:61` filters `users.nativeLanguages @> [targetLanguage]` — source lang has zero role in reviewer matching. Adding sourceLang to chips would produce dead data (admin picks a lang that never matches) and contradict the domain model. Not a bug.

### Dismissed (15)

1. BCP-47 over-permissive (`ab-12`, extlang, POSIX variants) — intentional "permissive shape check" per R1-P2
2. Stale JSDoc on `nativeLanguagesSchema.min 1` comment (behaviour correct)
3. `normalizeBcp47` "exported but unused in storage" — used in refine, kept for future
4. `pendingUserIds` unmount warning (React 19 safe)
5. Guardrail #21 dead reset block in `LanguagePairEditor` (harmless defensive code)
6. `fallbackGenRef` initial-mount bump (cosmetic, no bug)
7. `handleLoadFallback` micro-race (guard works, advisory only)
8. `finally` invariant "fragility" (architectural smell, not defect)
9. `findInsert` returns first match (valid concern but no current regression)
10. `createUser.action.test.ts` no order enforcement (intentional per D6)
11. Role flip `reviewer → admin` post-transition `onSettled` (works, cosmetic)
12. `null` role fallback to `qa_reviewer` (pre-existing)
13. `updateUserLanguages` doesn't verify target is reviewer (acceptable)
14. `mockSelectLimit` doesn't verify tenant (RLS tests cover)
15. `revert → onSettled` ordering flicker on CONFLICT (covered by R2-P6 revalidate fix)

## Review Findings (R1 — 2026-04-05)

**Sources:** Blind Hunter + Edge Case Hunter + Acceptance Auditor (parallel). AC verdict: **5/5**.

### Patches (must fix)

- [x] [Review][Patch] **Security: `getEligibleReviewers` lets non-admin reviewers set `includeAll=true`** — any `qa_reviewer`/`native_reviewer` can enumerate all tenant users + languages via crafted action call. Spec gates CTA to admin at UI layer only; Server Action has no `role === 'admin'` check when `includeAll=true`. **[src/features/project/actions/getEligibleReviewers.action.ts — `requireRole('qa_reviewer', 'read')` at top + no admin branch]** (Guardrail #62 defense-in-depth)
- [x] [Review][Patch] **BCP-47 regex too strict + case-mismatched with `languagePairConfigs.targetLang`** — `/^[a-z]{2,3}(-[A-Z][a-zA-Z]{1,7})*$/` rejects bare `en`/`th` (actually accepts these — 2–3 lower), but rejects legitimate `zh-hant-TW` (lowercase script) and `es-419` (numeric region). `availableLanguages` from `targetLang` may contain tags in any case — admin picks a chip, save rejects with cryptic Zod error. Replace with permissive pattern `^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$` + normalize to a canonical form before compare/store. **[src/features/admin/validation/userSchemas.ts:~13-29]**
- [x] [Review][Patch] **`LanguagePairEditor` optimistic revert closes over stale prop** — `handleToggle` builds `nextLanguages` from `currentLanguages` prop, then on failure calls `onUpdate?.(currentLanguages)` inside `startTransition`. On rapid double-click, the second click's revert captures the prop value AFTER the first click already mutated parent state → reverts click #1 as well. Fix: snapshot `currentLanguages` to a local `const previous = currentLanguages` at function entry and revert to that. **[src/features/admin/components/LanguagePairEditor.tsx:~47-65]**
- [x] [Review][Patch] **`UserManagement` reconciliation wipes in-flight optimistic state on sibling rows** — After `revalidatePath('/admin')` fires for row A, `currentUsersKey` changes → `setLanguagesByUser(Object.fromEntries(users))` unconditionally replaces ALL rows, including row B mid-toggle (visual revert, then re-flip on B's response). Fix: merge — preserve any `languagesByUser[id]` whose `users[id].nativeLanguages` still differs from the optimistic value (pending write marker), or track `pendingIds: Set<string>` excluded from reconciliation. **[src/features/admin/components/UserManagement.tsx:~241-258]**
- [x] [Review][Patch] **`handleLoadFallback` has no AbortController + no `try/finally`** — unlike the primary fetch (lines 73-102 uses `aborted` flag), the fallback does not guard resolution; if user closes dialog mid-fetch, `setFallbackReviewers`/`setFallbackLoading(false)` fire on unmounted state, and a throw leaves the loading spinner forever. Wrap in `try/finally`, add an `aborted` flag tied to dialog open state. **[src/features/project/components/FileAssignmentDialog.tsx:~104-115]**
- [x] [Review][Patch] **`fallbackReviewers` not cleared when `targetLanguage` changes mid-dialog** — reset only happens on dialog close. If parent updates `targetLanguage` while open, `reviewers` re-fetches for new language but `fallbackReviewers` holds stale data from previous language → user may select reviewer matched to the OLD language, confirmation dialog shows WRONG language. Add `targetLanguage` to the effect that clears `fallbackReviewers`. **[src/features/project/components/FileAssignmentDialog.tsx:~72-115]**
- [x] [Review][Patch] **A11y: `LanguagePairEditor` trigger `aria-label` uses raw UUID** — `aria-label={\`Edit language pairs for user ${userId}\`}` → screen readers announce gibberish. Pass `displayName` prop and use it. **[src/features/admin/components/LanguagePairEditor.tsx:~119]** (Guardrail #19 meaningful labels)
- [x] [Review][Patch] **Empty `targetLanguage` renders broken empty-state copy** — `FileAssignmentCell` passes `targetLanguage ?? ''`; if empty, `EmptyReviewerState` renders "No reviewers available for " (trailing space, no language). Also `"This reviewer is not assigned to . Assign anyway?"`. Guard: if `targetLanguage` is falsy, render generic "for this file" text OR skip the fallback UI entirely. **[src/features/project/components/ReviewerSelector.tsx:~1380 + FileAssignmentDialog.tsx:~1077]**
- [x] [Review][Patch] **Raw `sql\`... asc\`\`` in admin page — anti-pattern** — CLAUDE.md forbids raw SQL in app code; use Drizzle `asc()` helper: `.orderBy(asc(languagePairConfigs.targetLang))`. **[src/app/(app)/admin/page.tsx:~36]**
- [x] [Review][Patch] **Missing BCP-47 boundary tests** — no unit test for `userSchemas.ts` regex covering: bare `en`, `th`, `zh-Hant-TW`, `zh-hant-TW` (case), `es-419` (numeric region), invalid `EN-us`, max-length 20, duplicate dedup, mixed-case. Guardrail #6 requires boundary tests for every constraint. **[src/features/admin/validation/userSchemas.test.ts — new file]**

### Deferred — RESOLVED in same session (2026-04-05)

All 6 deferred items addressed immediately after R1 patches. No remaining debt from this review.

- [x] **D1 RESOLVED — Optimistic-lock on concurrent admin edits** — `updateUserLanguagesSchema` now accepts optional `previousLanguages` snapshot; server compares against DB state and returns `CONFLICT` on mismatch. `LanguagePairEditor` passes the pre-click snapshot. 4 new unit tests cover match/mismatch/null/omitted. **[updateUserLanguages.action.ts + userSchemas.ts + LanguagePairEditor.tsx]**
- [x] **D2 RESOLVED — Auto-suggest tie-break fix** — removed strict `<` comparison; SQL `ORDER BY workload` already provides deterministic tie-break, so the first matched row always gets auto-suggested. Existing tied-workload test updated to assert the new behavior. **[getEligibleReviewers.action.ts]**
- [x] **D3 RESOLVED — `CommandEmpty` cmdk behavior** — moved `EmptyReviewerState` out of cmdk's `CommandEmpty` (which only renders on filter miss) into a sibling branch that renders unconditionally when `hasMatchingReviewers === false`. The primary `Command` is only mounted when there are matching reviewers. **[ReviewerSelector.tsx]**
- [x] **D4 RESOLVED — Empty-tenant guidance** — `NewUserLanguageChips` empty state now shows an explanatory helper pointing admins to "Projects → Settings" to configure language pairs first. `LanguagePairEditor` popover empty state updated with the same guidance. **[UserManagement.tsx + LanguagePairEditor.tsx]**
- [x] **D5 RESOLVED — Max 20 boundary test** — already covered in P10 (accepts exactly 20, rejects 21). No additional work.
- [x] **D6 RESOLVED — Test fragility: position-based insert assertions** — introduced `__table` sentinels on mocked schema objects via `vi.hoisted()` + `findInsert(calls, tableName)` helper. `usersInsert` / `auditInsert` assertions now locate rows by table identity rather than array index. **[createUser.action.test.ts]**

### Dismissed (noise / handled / cosmetic)

1. AC3 uses `NewUserLanguageChips` vs `LanguagePairEditor` inline mode — functionally equivalent, spec says "same pattern" not "same component"
2. `LanguagePairEditor` has dead Guardrail #21 reset block (no state to reset — harmless)
3. `newLanguages` retained on role flip `reviewer → admin → reviewer` (intentional convenience)
4. `NewUserLanguageChips.toggle` closure (React batching via parent — works fine)
5. Duplicate `withTenant()` in both branches of `getEligibleReviewers` whereFilters (style only)
6. Audit log after DB update not in transaction (per Guardrail: happy-path let throw — current pattern matches other actions)
7. Link to `/admin` loses form state in modal (expected)
8. `AlertDialogAction "Assign anyway"` lacks destructive styling (style preference)
9. Type lie `fallbackReviewers ?? undefined` (cosmetic — exactOptionalPropertyTypes quirk)
10. Self-update unit test (claimed present in Completion Notes)
