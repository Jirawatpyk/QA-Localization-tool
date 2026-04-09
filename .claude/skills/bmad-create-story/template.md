# Story {{epic_num}}.{{story_num}}: {{story_title}}

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a {{role}},
I want {{action}},
so that {{benefit}}.

## Acceptance Criteria

1. [Add acceptance criteria from epics/PRD]

## UX States Checklist (Guardrail #96)

<!-- MANDATORY for stories that create/modify UI. Delete if story is backend-only. -->
<!-- Each state must be addressed: implement, N/A with reason, or "existing — verified". -->

- [ ] **Loading state:** {{what shows while data loads}}
- [ ] **Error state:** {{what shows on failure + recovery action}}
- [ ] **Empty state:** {{what shows when no data + CTA}}
- [ ] **Success state:** {{what shows after action completes}}
- [ ] **Partial state:** {{what shows during progressive loading}}
- [ ] **UX Spec match:** Verified against `_bmad-output/planning-artifacts/ux-design-specification/`

## Tasks / Subtasks

- [ ] Task 1 (AC: #)
  - [ ] Subtask 1.1
- [ ] Task 2 (AC: #)
  - [ ] Subtask 2.1

<!--
GUARDRAIL (A2 from S-FIX-7 retro 2026-04-09): verification tasks require artifact references.

Any task whose title contains words like "verification", "E2E", "test", "Playwright",
"real DB", "multi-user", "verify flow", or "manual verify" is considered a verification
task. Verification tasks MUST reference a concrete artifact when marked [x]:

  ❌ BAD  (self-asserted, no audit trail):
  - [x] Task 9: Multi-user verification via Playwright MCP

  ✅ GOOD (artifact referenced inline):
  - [x] Task 9: Multi-user verification via Playwright MCP
        (script: scripts/sfix7-setup-test-data.mjs, log: _bmad-output/sfix7-e2e-2026-04-09.md)
  - [x] Task 9: Multi-user verification via Playwright MCP
        (test: e2e/s-fix-7-release-button.spec.ts)
  - [x] Task 9: Manual accessibility audit
        (screenshot set: _bmad-output/a11y-audit-s-fix-7/)

Acceptable artifact types:
  - Test file path (e.g., `e2e/...spec.ts`, `src/**/*.test.ts`)
  - Script file (e.g., `scripts/*.mjs`, `scripts/*.ts`)
  - Screenshot or snapshot directory (e.g., `.playwright-mcp/`)
  - Manual verification log entry in story's Dev Agent Record with specific commands run
  - Playwright MCP session artifact reference

Self-asserted verification checkboxes create false coverage. S-FIX-7 Task 9 was marked
done with SQL-based release instead of clicking the button — 3 CRIT bugs (C4, R3-C1,
E2E-C1) in the untested Release flow cascaded into a 5-round CR marathon (~64 patches).

See `memory/feedback-task-9-requires-artifact.md` and `memory/feedback-e2e-between-cr-rounds.md`.
-->

<!--
E2E VERIFICATION GATE (A1 from S-FIX-7 retro):

If this story creates or modifies INTERACTIVE UI flows (buttons, dialogs, navigation,
forms, async state transitions), the FIRST task should be an E2E Playwright MCP session
BEFORE the first CR round, not after. Paper review cannot catch runtime-only bugs like
useTransition timing, URL resolution, React strict-mode, or transaction isolation.

Pattern:
  - [ ] Task 0: E2E gate — Playwright MCP session before CR R1
    - [ ] 0.1 Write test data setup script (`scripts/{story-key}-setup.mjs`)
    - [ ] 0.2 Click through happy path + 1-2 edge cases in real browser
    - [ ] 0.3 Capture DB state before/after with verification script
    - [ ] 0.4 Document results in story's "Dev Agent Record → E2E Verification" section

Skip Task 0 ONLY if the story is:
  - Pure server logic (no UI)
  - Data migration (no runtime UI)
  - Test-only changes
-->

## Dev Notes

- Relevant architecture patterns and constraints
- Source tree components to touch
- Testing standards summary

### Project Structure Notes

- Alignment with unified project structure (paths, modules, naming)
- Detected conflicts or variances (with rationale)

### References

- Cite all technical details with source paths and sections, e.g. [Source: docs/<file>.md#Section]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
