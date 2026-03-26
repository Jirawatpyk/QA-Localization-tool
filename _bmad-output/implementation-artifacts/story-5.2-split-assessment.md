# Story 5.2 Split Assessment

**Date:** 2026-03-26
**Assessor:** Bob (Scrum Master)
**Guardrail:** #48 (if any AC coordinates with >3 other ACs, must split) + CLAUDE.md AC limit <= 8
**Reference:** Epic 4 Retro — Story 4.2 had 8 ACs with extreme cross-cutting, produced 3 CR rounds, 5 TDs, 4 production bugs

---

## 1. Full AC Enumeration for Story 5.2 (as-is)

From the epic definition + RLS design spike, Story 5.2 needs these ACs:

| # | AC | Summary |
|---|-----|---------|
| AC1 | Non-native detection | Determine `user.native_languages` vs `file.targetLang` (BCP-47 prefix match) |
| AC2 | Auto-tag on every action | Every review action by non-native reviewer stores `{ non_native: true }` in `review_actions.metadata` |
| AC3 | Tag visible in export/audit | Non-native badge renders in export output + audit trail (italic + badge) |
| AC4 | Tag persistence + clearing | Tag persists until native reviewer confirms/changes; then cleared (or `native_verified: true` added) |
| AC5 | Flag for Native action (F key) | QA reviewer flags a finding for native review with comment + native reviewer selection |
| AC6 | Finding assignment creation | `INSERT finding_assignments` + `INSERT notifications` + `UPDATE findings.status = 'flagged'` |
| AC7 | "Flagged for Native" queue | Native reviewer sees routed findings in dedicated "For Verification" section |
| AC8 | Native reviewer scoped access (RLS) | Native reviewer sees ONLY assigned flagged segments; RLS enforces at DB level |
| AC9 | RLS enforcement on URL/API manipulation | Direct URL/API access blocked; UI shows "You have access to X flagged segments" |
| AC10 | Native reviewer capabilities | Can view source/target/back-translation, read flagger comment, add comment, confirm/override |
| AC11 | Finding comments thread | Threaded comments between flagger and native reviewer (`finding_comments` table) |
| AC12 | Notification on native comment | Original flagger receives notification when native reviewer comments |
| AC13 | Native confirm/override actions | Native reviewer can confirm (accept) or override (change decision); updates finding status + assignment status |
| AC14 | Score impact: NONE | Non-native tag is audit flag only, not score modifier |

**Total: 14 ACs** — far exceeds the 8 AC limit (CLAUDE.md guideline).

---

## 2. Cross-AC Interaction Matrix

Each cell = AC depends on / coordinates with:

| AC | Coordinates With | Count |
|----|-----------------|-------|
| AC1 | AC2 (determines when to tag) | 1 |
| AC2 | AC1 (detection logic), AC3 (display), AC4 (clearing), AC14 (score) | **4** |
| AC3 | AC2 (reads tag), AC4 (clearing affects display) | 2 |
| AC4 | AC2 (tag source), AC13 (native action triggers clear), AC11 (comment thread context) | 3 |
| AC5 | AC6 (creates assignment), AC7 (populates queue), AC10 (triggers native view), AC11 (initial comment) | **4** |
| AC6 | AC5 (UI trigger), AC7 (assignment data), AC8 (RLS depends on assignments), AC12 (notification) | **4** |
| AC7 | AC6 (data source), AC8 (RLS filtered), AC10 (capabilities in queue), AC13 (actions from queue) | **4** |
| AC8 | AC6 (assignment table), AC7 (queue filtering), AC9 (enforcement verification), AC10 (capabilities scoped) | **4** |
| AC9 | AC8 (RLS enforcement) | 1 |
| AC10 | AC7 (queue context), AC8 (scoped access), AC11 (comment capability), AC13 (action capability) | **4** |
| AC11 | AC5 (flagger comment), AC10 (comment capability), AC12 (triggers notification), AC13 (comment context for decision) | **4** |
| AC12 | AC6 (notification infra), AC11 (comment trigger) | 2 |
| AC13 | AC4 (clears tag), AC7 (updates queue), AC10 (capability), AC11 (decision with comment context) | **4** |
| AC14 | AC2 (tag has no score impact) | 1 |

### ACs with >3 cross-cutting interactions:

| AC | Interaction Count | Verdict |
|----|------------------|---------|
| AC2 | 4 | SPLIT |
| AC5 | 4 | SPLIT |
| AC6 | 4 | SPLIT |
| AC7 | 4 | SPLIT |
| AC8 | 4 | SPLIT |
| AC10 | 4 | SPLIT |
| AC11 | 4 | SPLIT |
| AC13 | 4 | SPLIT |

**8 out of 14 ACs exceed the >3 threshold.** This is exactly the Story 4.2 pattern: too many cross-cutting concerns in one story.

---

## 3. Verdict: MUST SPLIT

Story 5.2 as-is has:
- **14 ACs** (limit: 8) — 175% over limit
- **8 ACs with >3 cross-cutting interactions** — Guardrail #48 violation
- **3 distinct technical domains**: (1) auto-tagging logic, (2) DB schema + RLS policies, (3) native reviewer UI + workflow
- **2 new tables** + **16 RLS policies** + **4 Server Actions** + **4 new components** (per RLS spike)

Attempting to implement this as one story would almost certainly produce 3+ CR rounds and multiple TDs, repeating Story 4.2's failure mode.

---

## 4. Proposed Split: 3 Sub-Stories

### Story 5.2a: Non-Native Auto-Tag & Detection

**Persona:** As a PM, I want non-native reviewer decisions automatically tagged so quality audit trail is maintained.

**Scope:** Detection logic + auto-tagging on review actions + display in audit/export. No new tables, no RLS changes, no native reviewer workflow.

**ACs:**

| # | AC | From |
|---|-----|------|
| A1 | Non-native detection: BCP-47 prefix match of `user.native_languages` vs `file.targetLang` | AC1 |
| A2 | Every review action (Accept/Reject/Flag) by non-native reviewer stores `{ non_native: true }` in `review_actions.metadata` | AC2 |
| A3 | Non-native badge visible in finding card, export output, and audit trail (italic + badge) | AC3 |
| A4 | Score impact: NONE — tag is audit flag only, not score modifier | AC14 |
| A5 | `determineNonNative()` helper with unit tests covering: exact match, prefix match, no match, empty native_languages, CJK variants (zh-Hans vs zh-Hant) | AC1 detail |

**Cross-AC interactions:** A1<->A2 (1), A2<->A3 (1), A2<->A4 (1) — max 2 per AC. PASS.

> **Note:** Tag clearing (when native reviewer confirms/overrides) is **out of scope** for 5.2a — handled in Story 5.2c (AC C7).

**Technical scope:**
- New helper: `determineNonNative(user, fileTargetLang)` in `src/features/review/helpers/`
- Modify existing review action Server Actions (add metadata flag)
- Badge component: `NonNativeTag.tsx`
- No new DB tables, no migration, no RLS changes

**Estimated effort:** Small (1-2 days)
**Dependencies:** None (uses existing `users.native_languages` + `review_actions.metadata`)

---

### Story 5.2b: Finding Assignment Schema & RLS Scoped Access

**Persona:** As a PM, I want native reviewers to only access findings assigned to them, so their scope stays focused and security is enforced at DB level.

**Scope:** New tables (`finding_assignments`, `finding_comments`), RLS policies, DB migration. No UI (except "You have access to X flagged segments" message). No workflow logic.

**ACs:**

| # | AC | From |
|---|-----|------|
| B1 | `finding_assignments` table created with schema per RLS spike section 2.1 | AC6 (schema) |
| B2 | `finding_comments` table created with schema per RLS spike section 2.2 | AC11 (schema) |
| B3 | Role-scoped RLS on `findings` table: admin/qa = full tenant, native = only assigned | AC8 |
| B4 | Role-scoped RLS on `segments` table: native = only segments linked to assigned findings | AC8 |
| B5 | Role-scoped RLS on `review_actions`: native = only actions on assigned findings | AC8 |
| B6 | RLS on `finding_assignments` + `finding_comments` (new tables) | AC8 |
| B7 | RLS enforcement verified: URL/API manipulation returns 0 rows for native reviewer on unassigned findings | AC9 |
| B8 | Performance indexes on `finding_assignments` per RLS spike section 4.1 | AC8 (perf) |

**Cross-AC interactions:** B3<->B4<->B5<->B6 are related (all RLS) but each is a separate table — no circular dependency. B7 depends on B3-B6 (verification). Max 3 per AC. PASS.

> **At 8 AC limit — no additions allowed during implementation.** If new ACs surface during dev, they must be deferred to a follow-up story or replace an existing AC with SM approval.

**Technical scope:**
- 2 DB migrations (schema + RLS policies)
- Drizzle schema files: `findingAssignments.ts`, `findingComments.ts`
- Drizzle `relations.ts` update: add `findingAssignments` and `findingComments` relations
- Drizzle `index.ts` (schema barrel): re-export new schema files
- `FindingAssignmentStatus` union type: `type FindingAssignmentStatus = 'pending' | 'in_review' | 'confirmed' | 'overridden'` in `src/types/` or co-located in schema
- 16 RLS policies (replace 6 existing + 10 new)
- 4 performance indexes
- RLS integration tests: `finding-assignments-rls.test.ts`, `native-reviewer-scoped-access-rls.test.ts`
- No UI components, no Server Actions (those are in 5.2c)

**Estimated effort:** Medium (2-3 days)
**Dependencies:** None (schema-only, no feature code depends on it yet)

---

### Story 5.2c: Native Reviewer Workflow — Flag, Comment, Confirm/Override

**Persona:** As a native reviewer, I want to see only flagged segments assigned to me with the ability to comment, confirm, or override decisions.

**Scope:** Full workflow: Flag for Native action, native reviewer queue, comments, confirm/override, notifications. Depends on 5.2a (tag) + 5.2b (schema + RLS).

**ACs:**

| # | AC | From |
|---|-----|------|
| C1 | "Flag for Native Review" action (F key or button) opens dialog: select native reviewer + add comment | AC5 |
| C2 | Flag action creates `finding_assignment` + sets `findings.status = 'flagged'` + sends notification to native reviewer | AC6 |
| C3 | Native reviewer sees "For Verification" queue showing only their assigned flagged findings | AC7 |
| C4 | Native reviewer can view source/target/back-translation + read flagger comment + add comment | AC10 |
| C5 | Finding comment thread: threaded comments between flagger and native reviewer | AC11 |
| C6 | Original flagger receives notification when native reviewer comments | AC12 |
| C7 | Native reviewer can confirm (accept) or override (change decision); tag cleared/updated, assignment status updated | AC4 + AC13 |

**Cross-AC interactions:** C1<->C2 (1), C2<->C3 (1), C3<->C4 (1), C4<->C5 (1), C5<->C6 (1), C7<->C2 (1) — max 3 per AC. PASS.

> **`withTenant()` requirement:** Every Server Action query (SELECT, UPDATE, DELETE) in 5.2c MUST use `withTenant(table.tenantId, tenantId)` per Guardrail #1. INSERT must set `tenantId` in values. This is especially critical for `finding_assignments` and `finding_comments` queries that join across tables — each table's `tenant_id` must be checked independently (defense-in-depth).

**Technical scope:**
- 4 new Server Actions: `flagForNativeReview.action.ts`, `addFindingComment.action.ts`, `confirmNativeReview.action.ts`, `overrideNativeReview.action.ts`
- 4 new components: `FlagForNativeDialog.tsx`, `NativeReviewQueue.tsx`, `FindingCommentThread.tsx`, scope message component
- Notification triggers (uses existing `notifications` table)
- UI shows "You have access to X flagged segments in this file"

**Estimated effort:** Large (3-5 days)
**Dependencies:** Story 5.2a (non-native detection for tag clearing) + Story 5.2b (finding_assignments + finding_comments tables + RLS)

---

## 5. Dependency Graph

```
Story 5.2a (Auto-Tag)          Story 5.2b (Schema + RLS)
  [no deps]                       [no deps]
       \                           /
        \                         /
         v                       v
         Story 5.2c (Native Workflow)
           [depends on 5.2a + 5.2b]
```

5.2a and 5.2b can be developed **in parallel** (different developers or sequential by same dev — no code overlap). 5.2c must wait for both.

---

## 6. AC Count & Interaction Summary

| Sub-Story | ACs | Max Cross-AC Interactions | Guardrail #48 | AC Limit (<=8) |
|-----------|-----|--------------------------|---------------|----------------|
| 5.2a | 5 | 2 | PASS | PASS |
| 5.2b | 8 | 3 | PASS | PASS (at limit) |
| 5.2c | 7 | 3 | PASS | PASS |
| **Original 5.2** | **14** | **4** | **FAIL** | **FAIL** |

---

## 7. Risk Mitigation

| Risk from Original 5.2 | How Split Mitigates |
|------------------------|-------------------|
| RLS policy migration breaks existing queries | 5.2b is isolated — can be tested + rolled back independently without UI changes |
| Non-native tag logic interacts with native workflow | 5.2a is standalone — tag works even without native reviewer workflow |
| CR rounds > 2 from cross-cutting complexity | Each sub-story has focused scope; reviewer can understand full context in single pass |
| Production bugs from simultaneous DB + UI + workflow changes | Changes land in 3 separate deploys with independent verification |
| Story 4.2 pattern repeat | Largest sub-story (5.2c) has 7 ACs with max 3 interactions — well within limits |

---

## 8. Recommendation

**Split Story 5.2 into 3 sub-stories (5.2a, 5.2b, 5.2c).** This is not optional — the original story violates both the 8 AC limit and Guardrail #48.

**Sprint planning suggestion:**
- Sprint N: 5.2a + 5.2b (parallel, no dependency)
- Sprint N: 5.2c (after 5.2a + 5.2b merge) — or Sprint N+1 if sprint capacity is tight
