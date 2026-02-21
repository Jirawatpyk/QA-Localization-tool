---
name: 'step-04-self-check'
description: 'Self-audit implementation against tasks, tests, AC, and patterns'

nextStepFile: './step-05-adversarial-review.md'
---

# Step 4: Self-Check

**Goal:** Audit completed work against tasks, tests, AC, and patterns before external review.

---

## AVAILABLE STATE

From previous steps:

- `{baseline_commit}` - Git HEAD at workflow start
- `{execution_mode}` - "tech-spec" or "direct"
- `{tech_spec_path}` - Tech-spec file (if Mode A)
- `{project_context}` - Project patterns (if exists)

---

## SELF-CHECK AUDIT

### 1. Tasks Complete

Verify all tasks are marked complete:

- [ ] All tasks from tech-spec or mental plan marked `[x]`
- [ ] No tasks skipped without documented reason
- [ ] Any blocked tasks have clear explanation

### 2. Tests Passing

Verify test status:

- [ ] All existing tests still pass
- [ ] New tests written for new functionality
- [ ] No test warnings or skipped tests without reason

### 3. Acceptance Criteria Satisfied

For each AC:

- [ ] AC is demonstrably met
- [ ] Can explain how implementation satisfies AC
- [ ] Edge cases considered

### 4. Patterns Followed

Verify code quality:

- [ ] Follows existing code patterns in codebase
- [ ] Follows project-context rules (if exists)
- [ ] Error handling consistent with codebase
- [ ] No obvious code smells introduced

### 5. Automated Sub-agent Scans (ALL scans — lean: one pass)

Launch ALL applicable sub-agents IN PARALLEL for a single-pass scan:

**Always run:**
1. **anti-pattern-detector** (subagent_type="anti-pattern-detector") — CLAUDE.md anti-pattern violations
2. **tenant-isolation-checker** (subagent_type="tenant-isolation-checker") — missing tenant isolation
3. **code-quality-analyzer** (subagent_type="code-quality-analyzer") — code quality, patterns, maintainability
4. **testing-qa-expert** (subagent_type="testing-qa-expert") — test coverage gaps, test quality

**Conditional (only when relevant files changed):**
5. IF schema/migration files changed → **rls-policy-reviewer** (subagent_type="rls-policy-reviewer")
6. IF Inngest/pipeline files changed → **inngest-function-validator** (subagent_type="inngest-function-validator")

- [ ] anti-pattern-detector — no CRITICAL/HIGH findings
- [ ] tenant-isolation-checker — no CRITICAL/HIGH findings
- [ ] code-quality-analyzer — findings reviewed
- [ ] testing-qa-expert — findings reviewed
- [ ] rls-policy-reviewer (if triggered) — no CRITICAL/HIGH findings
- [ ] inngest-function-validator (if triggered) — no CRITICAL/HIGH findings
- [ ] All CRITICAL/HIGH findings fixed and re-verified

If CRITICAL or HIGH findings exist: fix immediately, re-run lint + type-check + tests, then re-scan until clean.

---

## UPDATE TECH-SPEC (Mode A only)

If `{execution_mode}` is "tech-spec":

1. Load `{tech_spec_path}`
2. Mark all tasks as `[x]` complete
3. Update status to "Implementation Complete"
4. Save changes

---

## IMPLEMENTATION SUMMARY

Present summary to transition to review:

```
**Implementation Complete!**

**Summary:** {what was implemented}
**Files Modified:** {list of files}
**Tests:** {test summary - passed/added/etc}
**AC Status:** {all satisfied / issues noted}

Proceeding to adversarial code review...
```

---

## NEXT STEP

Proceed immediately to `step-05-adversarial-review.md`.

---

## SUCCESS METRICS

- All tasks verified complete
- All tests passing
- All AC satisfied
- Patterns followed
- Tech-spec updated (if Mode A)
- Summary presented

## FAILURE MODES

- Claiming tasks complete when they're not
- Not running tests before proceeding
- Missing AC verification
- Ignoring pattern violations
- Not updating tech-spec status (Mode A)
