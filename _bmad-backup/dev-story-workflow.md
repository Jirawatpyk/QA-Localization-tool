---
name: dev-story
description: 'Execute story implementation following a context filled story spec file. Use when the user says "dev this story [story file]" or "implement the next story in the sprint plan"'
---

# Dev Story Workflow

**Goal:** Execute story implementation following a context filled story spec file.

**Your Role:** Developer implementing the story.

- Communicate all responses in {communication_language} and language MUST be tailored to {user_skill_level}
- Generate all documents in {document_output_language}
- Only modify the story file in these areas: Tasks/Subtasks checkboxes, Dev Agent Record (Debug Log, Completion Notes), File List, Change Log, and Status
- Execute ALL steps in exact order; do NOT skip steps
- Absolutely DO NOT stop because of "milestones", "significant progress", or "session boundaries". Continue in a single execution until the story is COMPLETE (all ACs satisfied and all tasks/subtasks checked) UNLESS a HALT condition is triggered or the USER gives other instruction.
- Do NOT schedule a "next session" or request review pauses unless a HALT condition applies. Only Step 10 decides completion.
- User skill level ({user_skill_level}) affects conversation style ONLY, not code updates.

---

## INITIALIZATION

### Configuration Loading

Load config from `{project-root}/_bmad/bmm/config.yaml` and resolve:

- `project_name`, `user_name`
- `communication_language`, `document_output_language`
- `user_skill_level`
- `implementation_artifacts`
- `date` as system-generated current datetime

### Paths

- `installed_path` = `{project-root}/_bmad/bmm/workflows/4-implementation/dev-story`
- `validation` = `{installed_path}/checklist.md`
- `story_file` = `` (explicit story path; auto-discovered if empty)
- `sprint_status` = `{implementation_artifacts}/sprint-status.yaml`

### Context

- `project_context` = `**/project-context.md` (load if exists)

---

## EXECUTION

<workflow>
  <critical>Communicate all responses in {communication_language} and language MUST be tailored to {user_skill_level}</critical>
  <critical>Generate all documents in {document_output_language}</critical>
  <critical>Only modify the story file in these areas: Tasks/Subtasks checkboxes, Dev Agent Record (Debug Log, Completion Notes), File List,
    Change Log, and Status</critical>
  <critical>Execute ALL steps in exact order; do NOT skip steps</critical>
  <critical>Absolutely DO NOT stop because of "milestones", "significant progress", or "session boundaries". Continue in a single execution
    until the story is COMPLETE (all ACs satisfied and all tasks/subtasks checked) UNLESS a HALT condition is triggered or the USER gives
    other instruction.</critical>
  <critical>Do NOT schedule a "next session" or request review pauses unless a HALT condition applies. Only Step 10 decides completion.</critical>
  <critical>User skill level ({user_skill_level}) affects conversation style ONLY, not code updates.</critical>

  <step n="1" goal="Find next ready story and load it" tag="sprint-status">
    <check if="{{story_path}} is provided">
      <action>Use {{story_path}} directly</action>
      <action>Read COMPLETE story file</action>
      <action>Extract story_key from filename or metadata</action>
      <goto anchor="task_check" />
    </check>

    <!-- Sprint-based story discovery -->
    <check if="{{sprint_status}} file exists">
      <critical>MUST read COMPLETE sprint-status.yaml file from start to end to preserve order</critical>
      <action>Load the FULL file: {{sprint_status}}</action>
      <action>Read ALL lines from beginning to end - do not skip any content</action>
      <action>Parse the development_status section completely to understand story order</action>

      <action>Find the FIRST story (by reading in order from top to bottom) where:
        - Key matches pattern: number-number-name (e.g., "1-2-user-auth")
        - NOT an epic key (epic-X) or retrospective (epic-X-retrospective)
        - Status value equals "ready-for-dev"
      </action>

      <check if="no ready-for-dev or in-progress story found">
        <output>📋 No ready-for-dev stories found in sprint-status.yaml

          **Current Sprint Status:** {{sprint_status_summary}}

          **What would you like to do?**
          1. Run `create-story` to create next story from epics with comprehensive context
          2. Run `*validate-create-story` to improve existing stories before development (recommended quality check)
          3. Specify a particular story file to develop (provide full path)
          4. Check {{sprint_status}} file to see current sprint status

          💡 **Tip:** Stories in `ready-for-dev` may not have been validated. Consider running `validate-create-story` first for a quality
          check.
        </output>
        <ask>Choose option [1], [2], [3], or [4], or specify story file path:</ask>

        <check if="user chooses '1'">
          <action>HALT - Run create-story to create next story</action>
        </check>

        <check if="user chooses '2'">
          <action>HALT - Run validate-create-story to improve existing stories</action>
        </check>

        <check if="user chooses '3'">
          <ask>Provide the story file path to develop:</ask>
          <action>Store user-provided story path as {{story_path}}</action>
          <goto anchor="task_check" />
        </check>

        <check if="user chooses '4'">
          <output>Loading {{sprint_status}} for detailed status review...</output>
          <action>Display detailed sprint status analysis</action>
          <action>HALT - User can review sprint status and provide story path</action>
        </check>

        <check if="user provides story file path">
          <action>Store user-provided story path as {{story_path}}</action>
          <goto anchor="task_check" />
        </check>
      </check>
    </check>

    <!-- Non-sprint story discovery -->
    <check if="{{sprint_status}} file does NOT exist">
      <action>Search {implementation_artifacts} for stories directly</action>
      <action>Find stories with "ready-for-dev" status in files</action>
      <action>Look for story files matching pattern: *-*-*.md</action>
      <action>Read each candidate story file to check Status section</action>

      <check if="no ready-for-dev stories found in story files">
        <output>📋 No ready-for-dev stories found

          **Available Options:**
          1. Run `create-story` to create next story from epics with comprehensive context
          2. Run `*validate-create-story` to improve existing stories
          3. Specify which story to develop
        </output>
        <ask>What would you like to do? Choose option [1], [2], or [3]:</ask>

        <check if="user chooses '1'">
          <action>HALT - Run create-story to create next story</action>
        </check>

        <check if="user chooses '2'">
          <action>HALT - Run validate-create-story to improve existing stories</action>
        </check>

        <check if="user chooses '3'">
          <ask>It's unclear what story you want developed. Please provide the full path to the story file:</ask>
          <action>Store user-provided story path as {{story_path}}</action>
          <action>Continue with provided story file</action>
        </check>
      </check>

      <check if="ready-for-dev story found in files">
        <action>Use discovered story file and extract story_key</action>
      </check>
    </check>

    <action>Store the found story_key (e.g., "1-2-user-authentication") for later status updates</action>
    <action>Find matching story file in {implementation_artifacts} using story_key pattern: {{story_key}}.md</action>
    <action>Read COMPLETE story file from discovered path</action>

    <anchor id="task_check" />

    <action>Parse sections: Story, Acceptance Criteria, Tasks/Subtasks, Dev Notes, Dev Agent Record, File List, Change Log, Status</action>

    <action>Load comprehensive context from story file's Dev Notes section</action>
    <action>Extract developer guidance from Dev Notes: architecture requirements, previous learnings, technical specifications</action>
    <action>Use enhanced story context to inform implementation decisions and approaches</action>

    <action>Identify first incomplete task (unchecked [ ]) in Tasks/Subtasks</action>

    <action if="no incomplete tasks">
      <goto step="8">Pre-CR quality scan</goto>
    </action>
    <action if="story file inaccessible">HALT: "Cannot develop story without access to story file"</action>
    <action if="incomplete task or subtask requirements ambiguous">ASK user to clarify or HALT</action>

  </step>

  <step n="2" goal="Load project context and verify codebase">
    <critical>Load all available context to inform implementation</critical>

    <action>Load {project_context} for coding standards and project-wide patterns (if exists)</action>
    <!-- Story sections already parsed in Step 1 — reuse extracted Dev Notes, ACs, Tasks -->

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- CODEBASE VERIFICATION (before implementation) -->
    <!-- Prevents: stale story claims, mock drift, cross-file blind spots -->
    <!-- Evidence: Story 4.5 CR (3 HIGH from stale assumptions), 4.4b CR (1C+2H from cross-file gaps) -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <critical>🔍 CODEBASE VERIFY: Validate story Dev Notes against actual code before implementation</critical>

    <!-- 1. Verify "Existing Code to Extend" table -->
    <action>Extract "Existing Code to Extend" table from Dev Notes (if exists)</action>
    <check if="table exists">
      <action>For EACH file in table:
        1. Read actual file — verify signatures, types, props match story claims
        2. Run: git log --oneline -10 -- {file_path} — check for recent refactors
      </action>
      <check if="critical drift: file no longer exists OR type/interface moved to different file OR drift impacts >50% of tasks">
        <action>HALT: "Critical codebase drift — story assumptions fundamentally broken. SM should re-evaluate story scope."</action>
      </check>
      <check if="minor drift: signatures changed, fields added/removed, but file still exists at same path">
        <action>Record drift in Dev Notes → "Codebase Verification" section with: file, expected vs actual, impact</action>
        <action>Adjust implementation approach based on actual code state</action>
        <output>⚠️ **Codebase drift detected** — {{mismatch_count}} file(s) differ from story spec.
          Dev Notes updated with corrections. Implementation will use actual code state.
        </output>
      </check>
      <check if="no mismatches found">
        <output>✅ **Codebase verified** — all story assumptions match current code</output>
      </check>
    </check>
    <check if="no Existing Code to Extend table">
      <action>Identify key files from Tasks/Subtasks descriptions that will be modified</action>
      <action>Read those files to understand current interfaces and patterns</action>
      <output>ℹ️ No explicit code table in story — read {{file_count}} key files from task descriptions</output>
    </check>

    <!-- 2. Verify "New Files to Create" paths -->
    <action>For EACH new file path in Dev Notes: verify target directory exists, check no file conflict at path</action>

    <!-- 3. Scan existing tests for files being modified — catch mock drift early -->
    <action>For EACH file that will be MODIFIED:
      1. Find co-located test files (*.test.ts, *.test.tsx)
      2. Note mocked interfaces that may need updating when source changes
      3. Record in Dev Notes → "Test Files to Update" list
    </action>

    <!-- 4. Pre-identify cross-file data flows (Guardrail #44 prevention) -->
    <action>From Tasks, list pairs where file A produces state consumed by file B.
      Record as "Cross-file Pairs" in Dev Notes — feeds Step 9 pre-CR reviewer scope.
    </action>

    <output>✅ Codebase verification complete — {{verified_count}} files checked, {{pair_count}} cross-file pairs identified</output>

  </step>

  <step n="3" goal="Detect review continuation and extract review context">
    <critical>Determine if this is a fresh start or continuation after code review</critical>

    <action>Check if "Senior Developer Review (AI)" section exists in the story file</action>
    <action>Check if "Review Follow-ups (AI)" subsection exists under Tasks/Subtasks</action>

    <check if="Senior Developer Review section exists">
      <action>Set review_continuation = true</action>
      <action>Extract from "Senior Developer Review (AI)" section:
        - Review outcome (Approve/Changes Requested/Blocked)
        - Review date
        - Total action items with checkboxes (count checked vs unchecked)
        - Severity breakdown (High/Med/Low counts)
      </action>
      <action>Count unchecked [ ] review follow-up tasks in "Review Follow-ups (AI)" subsection</action>
      <action>Store list of unchecked review items as {{pending_review_items}}</action>

      <output>⏯️ **Resuming Story After Code Review** ({{review_date}})

        **Review Outcome:** {{review_outcome}}
        **Action Items:** {{unchecked_review_count}} remaining to address
        **Priorities:** {{high_count}} High, {{med_count}} Medium, {{low_count}} Low

        **Strategy:** Will prioritize review follow-up tasks (marked [AI-Review]) before continuing with regular tasks.
      </output>
    </check>

    <check if="Senior Developer Review section does NOT exist">
      <action>Set review_continuation = false</action>
      <action>Set {{pending_review_items}} = empty</action>

      <output>🚀 **Starting Fresh Implementation**

        Story: {{story_key}}
        Story Status: {{current_status}}
        First incomplete task: {{first_task_description}}
      </output>
    </check>

  </step>

  <step n="4" goal="Mark story in-progress" tag="sprint-status">
    <check if="{{sprint_status}} file exists">
      <action>Load the FULL file: {{sprint_status}}</action>
      <action>Read all development_status entries to find {{story_key}}</action>
      <action>Get current status value for development_status[{{story_key}}]</action>

      <check if="current status == 'ready-for-dev' OR review_continuation == true">
        <action>Update the story in the sprint status report to = "in-progress"</action>
        <action>Update last_updated field to current date</action>
        <output>🚀 Starting work on story {{story_key}}
          Status updated: ready-for-dev → in-progress
        </output>
      </check>

      <check if="current status == 'in-progress'">
        <output>⏯️ Resuming work on story {{story_key}}
          Story is already marked in-progress
        </output>
      </check>

      <check if="current status is neither ready-for-dev nor in-progress">
        <output>⚠️ Unexpected story status: {{current_status}}
          Expected ready-for-dev or in-progress. Continuing anyway...
        </output>
      </check>

      <action>Store {{current_sprint_status}} for later use</action>
    </check>

    <check if="{{sprint_status}} file does NOT exist">
      <output>ℹ️ No sprint status file exists - story progress will be tracked in story file only</output>
      <action>Set {{current_sprint_status}} = "no-sprint-tracking"</action>
    </check>

  </step>

  <step n="5" goal="Implement task">
    <critical>FOLLOW THE STORY FILE TASKS/SUBTASKS SEQUENCE EXACTLY AS WRITTEN - NO DEVIATION</critical>

    <action>Review the current task/subtask from the story file - this is your authoritative implementation guide</action>

    <!-- Mandatory Query Plan for DB/action tasks -->
    <check if="task touches src/db/*, src/features/*/actions/*, or src/features/*/helpers/*">
      <critical>Output a Query Plan BEFORE writing code: table of queries with withTenant status</critical>
    </check>

    <!-- IMPLEMENT -->
    <action>Implement the task according to story specification</action>
    <action>Run existing tests to ensure no regressions</action>

    <!-- Post-task tenant scan for DB/action files -->
    <check if="task modified src/db/*, src/features/*/actions/*, or src/features/*/helpers/*">
      <action>Launch tenant-isolation-checker on changed files. Fix CRITICAL/HIGH immediately.</action>
    </check>

    <action>Document technical approach and decisions in Dev Agent Record</action>

    <action if="new dependencies required beyond story specifications">HALT: "Additional dependencies need user approval"</action>
    <action if="3 consecutive implementation failures occur">HALT and request guidance</action>
    <action if="required configuration is missing">HALT: "Cannot proceed without necessary configuration files"</action>

    <critical>NEVER implement anything not mapped to a specific task/subtask in the story file</critical>
    <critical>NEVER proceed to next task until current task/subtask is complete</critical>
    <critical>Execute continuously without pausing until all tasks/subtasks are complete or explicit HALT condition</critical>
    <critical>Do NOT propose to pause for review until Step 9 completion gates are satisfied</critical>

  </step>

  <step n="6" goal="Run validations and tests">
    <action>Determine how to run tests for this repo (infer test framework from project structure)</action>
    <action>Run all existing tests to ensure no regressions</action>
    <action>Run the new tests to verify implementation correctness</action>
    <action>Run linting and code quality checks if configured in project</action>
    <action>Validate implementation meets ALL story acceptance criteria; enforce quantitative thresholds explicitly</action>
    <action if="regression tests fail">STOP and fix before continuing - identify breaking changes immediately</action>
    <action if="new tests fail">STOP and fix before continuing - ensure implementation correctness</action>
  </step>

  <step n="7" goal="Validate and mark task complete ONLY when fully done">
    <critical>NEVER mark a task complete unless ALL conditions are met - NO LYING OR CHEATING</critical>

    <!-- VALIDATION GATES -->
    <action>Verify ALL tests for this task/subtask ACTUALLY EXIST and PASS 100%</action>
    <action>Confirm implementation matches EXACTLY what the task/subtask specifies - no extra features</action>
    <action>Validate that ALL acceptance criteria related to this task are satisfied</action>
    <action>Run full test suite to ensure NO regressions introduced</action>

    <!-- REVIEW FOLLOW-UP HANDLING -->
    <check if="task is review follow-up (has [AI-Review] prefix)">
      <action>Extract review item details (severity, description, related AC/file)</action>
      <action>Add to resolution tracking list: {{resolved_review_items}}</action>

      <!-- Mark task in Review Follow-ups section -->
      <action>Mark task checkbox [x] in "Tasks/Subtasks → Review Follow-ups (AI)" section</action>

      <!-- CRITICAL: Also mark corresponding action item in review section -->
      <action>Find matching action item in "Senior Developer Review (AI) → Action Items" section by matching description</action>
      <action>Mark that action item checkbox [x] as resolved</action>

      <action>Add to Dev Agent Record → Completion Notes: "✅ Resolved review finding [{{severity}}]: {{description}}"</action>
    </check>

    <!-- ONLY MARK COMPLETE IF ALL VALIDATION PASS -->
    <check if="ALL validation gates pass AND tests ACTUALLY exist and pass">
      <action>ONLY THEN mark the task (and subtasks) checkbox with [x]</action>
      <action>Update File List section with ALL new, modified, or deleted files (paths relative to repo root)</action>
      <action>Add completion notes to Dev Agent Record summarizing what was ACTUALLY implemented and tested</action>
    </check>

    <check if="ANY validation fails">
      <action>DO NOT mark task complete - fix issues first</action>
      <action>HALT if unable to fix validation failures</action>
    </check>

    <check if="review_continuation == true and {{resolved_review_items}} is not empty">
      <action>Count total resolved review items in this session</action>
      <action>Add Change Log entry: "Addressed code review findings - {{resolved_count}} items resolved (Date: {{date}})"</action>
    </check>

    <action>Save the story file</action>
    <action>Determine if more incomplete tasks remain</action>
    <action if="more tasks remain">
      <goto step="5">Next task</goto>
    </action>
    <action if="no tasks remain">
      <goto step="8">Pre-CR quality scan</goto>
    </action>

  </step>

  <step n="8" goal="Pre-CR quality scan with sub-agents">
    <critical>Run automated scans BEFORE marking story for review</critical>

    <!-- L1 fix: lint + type-check FIRST — agents should scan compilable code -->
    <action>Run lint + type-check on the project. Fix any errors before launching agents.</action>

    <action>Launch FOUR sub-agents IN PARALLEL on all files in story File List:
      1. anti-pattern-detector — CLAUDE.md violations
      2. tenant-isolation-checker — missing tenant isolation
      3. code-quality-analyzer — code smells, mock drift (single-file)
      4. feature-dev:code-reviewer (subagent_type="feature-dev:code-reviewer") — CROSS-FILE Data Flow Reviewer (Guardrail #44).
         Scope: ONLY state/data that crosses file boundaries (single-file = agent #3).
         INITIAL SCOPE: If "Cross-file Pairs" section exists in story Dev Notes (from Step 2 codebase verification),
           use those pairs as starting scope — verify them FIRST, then discover additional pairs from code.
         Phase 1 — DISCOVERY (mandatory): List ALL cross-file pairs as [Producer] → [Consumer]: [what flows].
           If 0 pairs found → state "No cross-file data flows detected" and terminate. Do NOT skip to findings.
         Phase 2 — VERIFICATION per pair:
           (a) Contract match — data shape/type/order correct across boundary?
           (b) Lifecycle completeness — created, consumed, AND cleaned up across both files?
           (c) Staleness — consumer can read outdated data from producer?
           (d) Timing/race — producer write and consumer read can race?
           (e) Error/edge states — producer in non-happy-path state?
         RISK FILTER: P0 (data corruption, wrong output, silent data loss) + P1 (race, stale state, unhandled error propagation). Skip P2+.
         OUTPUT: 1) Cross-file pair list 2) Findings per pair with severity + evidence (file:line).
         DO NOT report single-file issues (= agent #3's job)
    </action>
    <check if="File List contains src/db/schema/* or src/db/migrations/*">
      <action>ALSO launch: rls-policy-reviewer</action>
    </check>
    <check if="File List contains src/features/pipeline/* or src/lib/inngest/*">
      <action>ALSO launch: inngest-function-validator</action>
    </check>
    <check if="CRITICAL or HIGH findings">
      <action>Fix immediately, re-run scans until clean or LOW-only</action>
    </check>
    <action>Record scan results in Dev Agent Record</action>
    <goto step="9">Story completion</goto>

  </step>

  <step n="9" goal="Story completion and mark for review" tag="sprint-status">
    <action>Verify ALL tasks and subtasks are marked [x]</action>
    <action>Run the full regression suite</action>
    <action>Confirm File List includes every changed file</action>

    <!-- DoD then status update -->
    <action>Validate definition-of-done checklist</action>
    <action>Update the story Status to: "review"</action>

    <!-- Enhanced Definition of Done Validation -->
    <action>Validate definition-of-done checklist with essential requirements:
      - All tasks/subtasks marked complete with [x]
      - Implementation satisfies every Acceptance Criterion
      - Unit tests for core functionality added/updated
      - Integration tests for component interactions added when required
      - End-to-end tests for critical flows added when story demands them
      - All tests pass (no regressions, new tests successful)
      - Code quality checks pass (linting, static analysis if configured)
      - File List includes every new/modified/deleted file (relative paths)
      - Dev Agent Record contains implementation notes
      - Change Log includes summary of changes
      - Only permitted story sections were modified
    </action>

    <!-- Mark story ready for review - sprint status conditional -->
    <check if="{sprint_status} file exists AND {{current_sprint_status}} != 'no-sprint-tracking'">
      <action>Load the FULL file: {sprint_status}</action>
      <action>Find development_status key matching {{story_key}}</action>
      <action>Verify current status is "in-progress" (expected previous state)</action>
      <action>Update development_status[{{story_key}}] = "review"</action>
      <action>Update last_updated field to current date</action>
      <action>Save file, preserving ALL comments and structure including STATUS DEFINITIONS</action>
      <output>✅ Story status updated to "review" in sprint-status.yaml</output>
    </check>

    <check if="{sprint_status} file does NOT exist OR {{current_sprint_status}} == 'no-sprint-tracking'">
      <output>ℹ️ Story status updated to "review" in story file (no sprint tracking configured)</output>
    </check>

    <check if="story key not found in sprint status">
      <output>⚠️ Story file updated, but sprint-status update failed: {{story_key}} not found

        Story status is set to "review" in file, but sprint-status.yaml may be out of sync.
      </output>
    </check>

    <!-- Final validation gates -->
    <action if="any task is incomplete">HALT - Complete remaining tasks before marking ready for review</action>
    <action if="regression failures exist">HALT - Fix regression issues before completing</action>
    <action if="File List is incomplete">HALT - Update File List with all changed files</action>
    <action if="definition-of-done validation fails">HALT - Address DoD failures before completing</action>

    <!-- Guardrail #50: MUST run tests before claiming done -->
    <critical>FINAL VERIFICATION — Run `npm run test:unit`, `npm run lint`, `npm run type-check` NOW and verify GREEN output with your own eyes. "Probably passes" or "passed earlier" is NOT acceptable. If any test fails, HALT and fix before marking review. (Epic 4 Retro — 3 failing tests discovered during retro that nobody knew about)</critical>

  </step>

  <step n="10" goal="Completion communication and user support">
    <action>Execute the enhanced definition-of-done checklist using the validation framework</action>
    <action>Prepare a concise summary in Dev Agent Record → Completion Notes</action>

    <action>Communicate to {user_name} that story implementation is complete and ready for review</action>
    <action>Summarize key accomplishments: story ID, story key, title, key changes made, tests added, files modified</action>
    <action>Provide the story file path and current status (now "review")</action>

    <action>Based on {user_skill_level}, ask if user needs any explanations about:
      - What was implemented and how it works
      - Why certain technical decisions were made
      - How to test or verify the changes
      - Any patterns, libraries, or approaches used
      - Anything else they'd like clarified
    </action>

    <check if="user asks for explanations">
      <action>Provide clear, contextual explanations tailored to {user_skill_level}</action>
      <action>Use examples and references to specific code when helpful</action>
    </check>

    <action>Once explanations are complete (or user indicates no questions), suggest logical next steps</action>
    <action>Recommended next steps (flexible based on project setup):
      - Review the implemented story and test the changes
      - Verify all acceptance criteria are met
      - Ensure deployment readiness if applicable
      - Run `code-review` workflow for peer review
      - Optional: If Test Architect module installed, run `/bmad:tea:automate` to expand guardrail tests
    </action>

    <output>💡 **Tip:** For best results, run `code-review` using a **different** LLM than the one that implemented this story.</output>
    <check if="{sprint_status} file exists">
      <action>Suggest checking {sprint_status} to see project progress</action>
    </check>
    <action>Remain flexible - allow user to choose their own path or ask for other assistance</action>

  </step>

</workflow>
