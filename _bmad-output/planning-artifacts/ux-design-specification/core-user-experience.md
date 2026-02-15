# Core User Experience

## Defining Experience

**Core Action Loop — "Review & Decide":**

The defining interaction of qa-localization-tool is the **Finding Review Decision Moment** — the 3-5 seconds when a reviewer looks at a finding and decides: Accept, Reject, or Flag. Everything in the UX must serve this moment. Users perform this loop **100-300 times/day** (10-15 files × 10-30 findings/file) — every millisecond of friction is amplified.

```
                    BATCH LEVEL
                    ┌─────────────────────────┐
                    │ Batch Summary            │
                    │ "7 auto-pass, 3 review"  │
                    │ Click file → drill down  │
                    └──────────┬──────────────┘
                               ▼
                    FILE LEVEL
                    ┌─────────────────────────┐
                    │ File: report_TH.sdlxliff │
                    │ Score: 72 │ 17 findings  │
                    │ Auto-scroll to 1st Crit  │
                    └──────────┬──────────────┘
                               ▼
              ┌──── CORE LOOP (100+ times/day) ────────┐
              │                                         │
              │   1. 👁️ Scan: Severity → Type → Layer    │
              │   2. 📖 Read: Source/Target highlight    │
              │      + Language Bridge (if non-native)   │
              │   3. 🎯 Check: Confidence + Suggestion   │
              │   4. ⚡ Decide: Accept(A) / Reject(R)    │
              │      / Flag(F)                           │
              │   5. → Auto-advance to next finding      │
              │                                         │
              └──────────┬──────────────────────────────┘
                         │ All findings resolved
                         ▼
                    FILE COMPLETE
                    ┌─────────────────────────┐
                    │ "Review Complete ✅"      │
                    │ → Next file in batch     │
                    └──────────┬──────────────┘
                               │ All files done
                               ▼
                    BATCH COMPLETE
                    ┌─────────────────────────┐
                    │ "Batch done! Export?"     │
                    │ [📄 Report] [📜 Cert]    │
                    └─────────────────────────┘
```

### Visual Scan Path — "3-Second Decision"

Every finding is designed for a left-to-right, top-to-bottom scan completing in 3 seconds:

| Second | Phase | What the eye sees |
|:---:|-------|------------------|
| 1st | **PRIORITY SCAN** | Severity badge (🔴 Critical / 🟠 Major / 🟡 Minor) → Error type (QA Cosmetic term) → Layer badge (Rule / AI) |
| 2nd | **UNDERSTAND** | Source segment (highlighted) → Target segment (error highlighted) → AI Suggestion + Confidence indicator |
| 3rd | **DECIDE** | Action buttons: Accept (A) / Reject (R) / Flag (F) with keyboard hotkeys |

### Finding Information Hierarchy

| Priority | Element | Purpose | Source |
|:---:|---------|--------|--------|
| 1st | **Severity badge** | Determines whether to read in detail — Critical must read, Minor may bulk accept | PRD: Intelligent Prioritization |
| 2nd | **Error type** | What kind of error — Terminology? Consistency? Mistranslation? (QA Cosmetic terms in UI) | Dual Taxonomy |
| 3rd | **Source + Target** | Actual context — highlight only the problematic part, not entire segment | PRD: Progressive Disclosure |
| 4th | **Suggestion** | "Fix it to what" — not just flagging errors but providing solutions | PRD Pillar 5: Actionable Suggestions |
| 5th | **Confidence** | "How trustworthy" — 🟢 High >85% / 🟡 Medium 70-85% / 🔴 Low <70% | PRD Pillar 3: Confidence-based Trust |
| 6th | **Layer badge** | Rule-based (deterministic) vs AI (semantic) — builds trust literacy over time | 3-Layer Pipeline |

### Per-Persona View Differences

| Element | คุณแพร (Native QA) | คุณนิด (Non-native QA) |
|---------|-------------------|----------------------|
| Language Bridge | Hidden (not needed) | **Always visible** — first-class, never collapsed |
| Flag action | Not available (she is the native reviewer) | **Available** — "Flag for native review" |
| Confidence weight | Supplementary (she can judge herself) | **Primary decision factor** when cannot read target language |
| AI Explanation | Optional expand | **Always visible** |
| Core actions | Accept / Reject | Accept / Reject / **Flag** |
| Extended actions | Note / Source Issue / Add Finding / Severity Override | Note / Source Issue / Add Finding / Severity Override |

> **Flag action availability:** Flag is available based on the reviewer's native language vs the file's target language, not based on persona role. Example: คุณแพร reviewing EN→TH (her native language): no Flag. คุณแพร reviewing EN→JA: Flag available.

### Action Sub-flows

> **Note:** Safeguard and Edge Case references below are defined later in this document under [Core Loop Design Safeguards](#core-loop-design-safeguards) and [Edge Cases](#edge-cases).

**✓ Accept (Hotkey: A)** — Zero friction
- 1 click → finding greyed out → cursor auto-advances to next finding
- No confirmation dialog
- Marked as "Accepted" in audit trail
- Undo: Ctrl+Z (available within session)

**✗ Reject (Hotkey: R)** — Optional feedback
- 1 click → finding marked rejected → optional reason dropdown appears (not mandatory)
- Reason options: False positive / Already fixed / Intentional / Other (free text)
- Reason data feeds AI learning when provided
- **Pattern suppression:** After 3+ rejects of same error pattern → "Suppress this pattern for this project? [Yes / No]"

**⚑ Flag (Hotkey: F)** — Non-native reviewer only
- 1 click → finding marked "Needs native review" → cursor advances
- Auto-notify native reviewer(s) assigned to that language pair (see Safeguard #7)
- Flag counter badge visible on dashboard for assigned native reviewers
- Flag resolution feedback: notifies flagger when native reviewer resolves the item
- In Smart Report: appears in "Needs Native Verification" tier

**📝 Note (Hotkey: N)** — Stylistic observations (see Edge Case #10)
- 1 click → finding marked "Noted — no action required" → cursor advances
- No MQM score penalty — acknowledged but not treated as error
- In Report: appears in separate "Stylistic Observations" section

**🔤 Source Issue (Hotkey: S)** — Source text problems (see Edge Case #11)
- 1 click → finding marked "Source issue" → cursor advances
- No translation score penalty — problem is in source, not translation
- In Report: appears in "Source Quality Issues" section → routed to content team

**Severity Override** — Available on Accept action (see Edge Case #5)
- Accept dropdown: "Accept" (keep severity) / "Accept as Major" / "Accept as Minor"
- Score recalculates using overridden severity
- Audit trail records original AI severity + reviewer override + reason

**➕ Add Finding (Hotkey: +)** — Manual finding (see Edge Case #7)
- Select segment → specify error type + severity → creates manual finding with "👤 Manual" badge
- Affects MQM score + serves as AI training data for missed issues

### Bulk Operations

- **Shift+Click** multi-select → "Accept Selected (N)"
- **Filter + Accept All:** Filter by Confidence: High + Severity: Minor → "Accept All Filtered"
- **Rules:** ❌ Cannot bulk accept Critical — button is disabled when Critical findings are selected (tooltip: 'Critical findings must be reviewed individually') / ⚠️ Bulk accept Major requires confirmation / ✅ Bulk accept Minor + High confidence — no confirmation needed
- **Spot check safety net:** After bulk accept >10 findings → show 2-3 random samples for quick verification (see Safeguard #8)
- **Bulk accept accuracy tracking:** Per-user metric visible in profile — builds accountability

> **Two separate bulk safety mechanisms:** (1) Confirmation dialog for bulk actions on ≥6 items, (2) Spot-check sample display after bulk accept of ≥11 findings — both apply independently.

### Keyboard Navigation

| Scope | Shortcut | Action |
|-------|----------|--------|
| Within file | J / ↓ | Next finding |
| Within file | K / ↑ | Previous finding |
| Within file | Tab | Next **unresolved** finding (skip accepted/rejected) |
| Within file | Ctrl+↓ / Ctrl+↑ | Next / Previous **Critical** finding |
| Between files | ] / Alt+↓ | Next file in batch |
| Between files | [ / Alt+↑ | Previous file in batch |
| Global | Alt+Home | Back to batch summary |

| Global | Ctrl+K | **Command palette** — search, filter, navigate (see Safeguard #4) |
| Review mode | Ctrl+Enter | **Focus mode** — finding detail expands inline, full keyboard flow |
| Global | Ctrl+F | Filter panel toggle |
| Global | Ctrl+B | Bulk select mode |
| Global | Escape | Back to list / close panel |

**Smart Navigation behaviors:**
- Open new file → auto-scroll to **first Critical finding** (not first segment)
- Tab skips resolved findings → focus only on remaining work
- Progress indicator: "Finding 3/17 (14 remaining)"
- **Resume on return:** "Continue from Finding #15?" when returning to partially-reviewed file (see Safeguard #9)

### Finding States

| State | Icon | Meaning | Score Impact |
|-------|:---:|---------|:---:|
| Pending | ⬜ | Not yet reviewed (default) | Pending |
| Accepted | ✅ | Reviewer confirms this is a real error | Yes (MQM penalty) |
| Re-accepted | ✅↩ | Re-accepted after previous rejection by reviewer | Yes (MQM penalty re-applied) |
| Rejected | ❌ | False positive or intentional | No penalty |
| Flagged | 🚩 | Needs native review (non-native reviewer only) | Pending until resolved |
| Noted | 📝 | Stylistic observation — no action required | No penalty |
| Source Issue | 🔤 | Problem in source text, not translation | No penalty |
| Manual | 👤 | Manually added by reviewer (tool missed it) | Yes (MQM penalty) |

When all findings in a file are resolved → File status changes to "Review Complete ✅" → Auto-navigate to next file in batch.

### Core Loop Design Safeguards (Pre-mortem Findings)

Ten failure modes identified through pre-mortem analysis, with preventive design measures:

**Safeguard 1: Decision Fatigue Prevention** (Severity: Critical)
- Problem: 450 Accept/Reject decisions/day causes cognitive exhaustion — Xbench doesn't require per-finding decisions
- Prevention:
  - **Auto-resolve mode**: Findings with High confidence (>90%) + Minor severity → auto-accepted with "Auto-accepted" badge, reviewable in audit log. Finding state: 'Auto-accepted' — uses Accepted state with 'Auto' badge. Visible in FindingCard as green-tinted with ⚡ Auto badge. Configurable per project in Settings (default: enabled for Minor + High confidence >90%).
  - **"Acknowledge & Continue" mode**: Alternative to mandatory Accept/Reject — reviewer sees finding, moves on, finding logged as "Reviewed — no action" for audit trail (equivalent to the Note action — marks finding as reviewed without Accept/Reject, see Note action definition above)
  - **Smart batching**: Group similar findings (e.g., 8 terminology issues of same pattern) → resolve as group with single decision

**Safeguard 2: False Positive Management** (Severity: Critical)
- Problem: AI false positive rate >15% makes rejection the dominant activity
- Prevention:
  - **Confidence threshold filter**: Default hide findings with confidence <70% — user can toggle "Show low-confidence findings"
  - **AI credibility indicator per file**: "AI accuracy for this language pair: 91%" — sets expectations upfront
  - Pattern suppression after 3+ rejects (already designed in Action Sub-flows)

**Safeguard 3: Context Switch Reduction** (Severity: Major)
- Problem: Dual monitor = 600+ eye switches/day between QA tool and CAT tool
- Prevention:
  - **Surrounding segments display**: Show 1-2 segments before/after the finding segment for inline context
  - **One-click segment jump**: Copy segment ID + deep link format that Trados can consume
  - **Mini source/target preview**: Show enough context within the finding card to minimize CAT tool lookups

**Safeguard 4: Full Keyboard-Driven Flow** (Severity: Major)
- Problem: Keyboard shortcuts cover only ~40% of real workflow — side panel, filters, navigation require mouse
- Prevention:
  - **Command palette** (Ctrl+K): Search, filter, navigate — all from keyboard
  - **Side panel always visible** in review mode — no click to open/close
  - **Focus mode** (Ctrl+Enter): Finding detail expands inline instead of side panel — entire flow stays keyboard-only
  - Additional shortcuts: Ctrl+F = filter panel, Ctrl+B = bulk select mode, Escape = back to list

**Safeguard 5: Information Density Control** (Severity: Major)
- Problem: 7 elements per finding → 8-10 second scan time instead of target 3 seconds
- Prevention:
  - **Compact mode** (default): Severity + Source/Target highlight + Suggestion only — 3-second scan achievable
  - **Detailed mode** (toggle): Full view with confidence, layer badge, AI explanation — for uncertain findings
  - **Per-finding expand**: Click/Enter to toggle individual finding between compact and detailed
  - User preference saved: compact/detailed default persists across sessions

**Safeguard 6: Score Transition Clarity** (Severity: Minor)
- Problem: Score jumps from 97→72 mid-review causes anxiety and distrust
- Prevention:
  - Score badge shows **phase**: "97 (Rule-based)" → "Analyzing..." → "72 (Final)"
  - **Score change notification**: Toast message "Score updated: AI found 2 Critical issues — tap to view"
  - **Score change log**: Expandable history showing what caused each score change
  - Already designed interim badge in Step 2 — ensure animation/transition is smooth, not jarring

**Safeguard 7: Flag Workflow Completion** (Severity: Critical)
- Problem: Flagged findings go into a black hole — no notification, no assignment, no follow-up
- Prevention:
  - **Auto-notify**: When findings are flagged → notification sent to native reviewer(s) assigned to that language pair
  - **Flag counter badge**: Dashboard shows "5 items waiting for native review" for assigned native reviewers
  - **Flag expiry warning**: "3 flagged items pending >48 hours — escalate to project lead?"
  - **Flag resolution feedback**: When native reviewer resolves → คุณนิด gets notified "Your flagged item was confirmed as error / dismissed"

**Safeguard 8: Bulk Accept Safety Net** (Severity: Major)
- Problem: Habitual bulk accept leads to missed real issues → client complaints → trust collapse
- Prevention:
  - **Spot check prompt**: After bulk accept >10 findings → show 2-3 random samples: "Quick check — these were bulk accepted. Look correct?"
  - **Bulk accept accuracy tracking**: Per-user metric, visible to self: "Your bulk accept accuracy: 97% (3/100 overturned by client feedback)"
  - **Weekly bulk accept report**: Summary of what was bulk accepted + any client-reported issues in those items

**Safeguard 9: Review State Persistence** (Severity: Minor)
- Problem: Close browser mid-review → return → lost position → re-review or missed findings
- Prevention:
  - **Auto-save**: Every Accept/Reject/Flag saves immediately (Supabase real-time)
  - **Resume prompt**: "Welcome back — you reviewed 14/28 findings in report_TH.sdlxliff. Continue from Finding #15?"
  - **Default filter on return**: Show only unresolved findings when resuming a partially-reviewed file
  - **Session breadcrumb**: Visual indicator of last-reviewed position in the finding list

**Safeguard 10: Back-translation Reliability Signal** (Severity: Major)
- Problem: AI back-translation can be wrong → non-native reviewer makes wrong decision based on it
- Prevention:
  - **Back-translation confidence**: Separate indicator from finding confidence — "Back-translation reliability: 🟢 High / 🟡 Use with caution"
  - **"When in doubt, Flag" principle**: Prominent in Language Bridge UI — reinforces that Flag is the safe option
  - **Dual back-translation**: For Low reliability cases, show 2 alternative back-translations for cross-reference
  - **Back-translation accuracy tracking**: Per language pair, improves over time with feedback

### Core Loop Edge Cases (What If Scenarios)

Twelve edge case scenarios explored through What If analysis, with design implications:

**Edge Case 1: High-Volume Files (200+ findings)**
- Scenario: Large low-quality file generates 200+ findings — current Core Loop design assumes 10-30
- Design response:
  - **Triage mode**: Auto-activate when findings > 50 — show Critical + Major only, Minor collapsed under "and 147 Minor findings"
  - **Error pattern grouping**: "23 Terminology errors (same pattern: 'cloud computing')" → resolve as group with single decision
  - **Re-translation threshold**: When findings > N and score < 50 → "This file may need re-translation — review top issues or reject file?"
  - **Component behavior:** FindingList applies Triage filter preset — Critical + Major findings shown, Minor collapsed under summary row 'and N Minor findings (tap to expand)'. Filter bar shows active 'Triage Mode' badge.

**Edge Case 2: AI Findings Arrive Mid-Review**
- Scenario: User reviewing rule-based findings → AI completes → 8 new findings appear
- Design response:
  - **Append-only rule**: New AI findings always append to END of list — never insert into middle of active review
  - **Non-disruptive notification**: Toast "AI found 8 additional findings — added to end of list"
  - **Dual progress display**: "10/15 reviewed (rule-based) | +8 AI findings pending"
  - **Focus mode protection**: If user is in Focus mode → badge count updates silently, no toast interruption

**Edge Case 3: Concurrent Reviewers on Same File**
- Scenario: Two reviewers open the same file simultaneously
- Design response:
  - **Soft lock on first action**: File locks when reviewer performs first Accept/Reject/Flag (not on open — viewing is free)
  - **Lock visibility**: "In review by คุณแพร" banner for second viewer
  - **View-only mode**: Second reviewer can view findings but actions are disabled
  - **Lock timeout**: Auto-release after 30 minutes of inactivity with warning at 25 minutes
  - **Lock override**: Project lead can force-release lock if needed

**Edge Case 4: Same Error Across 50 Segments / 10 Files**
- Scenario: Glossary term mistranslated consistently across entire batch
- Design response:
  - **Cross-file pattern detection**: "This error appears in 50 segments across 10 files"
  - **"Resolve pattern" action**: Accept/Reject the pattern once → auto-apply to all instances across batch
  - **Batch-level pattern summary**: Surfaced in batch summary view, not just per-file
  - **Glossary update prompt**: After accepting terminology pattern → "Add correction to glossary for future runs?"

**Edge Case 5: Severity Disagreement**
- Scenario: AI classifies finding as Critical but reviewer considers it Minor (stylistic preference)
- Design response:
  - **Severity override**: Accept finding but change severity — "Accept as Minor" dropdown on Accept action
  - **Score recalculation**: MQM score recalculates using overridden severity (penalty 1 instead of 25)
  - **Audit trail**: "AI: Critical → Reviewer override: Minor (reason: stylistic preference)"
  - **AI calibration data**: Severity overrides feed AI training for better future classification

**Edge Case 6: Glossary Is Wrong**
- Scenario: Rule-based flags "doesn't match glossary" but the glossary entry itself is outdated/incorrect
- Design response:
  - **"Flag glossary issue" action**: From finding → create glossary maintenance task without leaving review
  - **Glossary quick-edit**: Optional 1-click path to update glossary entry inline
  - **Re-run offer**: After glossary update → "Re-run affected files with updated glossary?"
  - Prevents repeated false positives from incorrect glossary entries

**Edge Case 7: Manual Finding Addition**
- Scenario: Reviewer spots an error that neither rule-based nor AI detected — wants to include in report
- Design response:
  - **"Add finding" action (+)**: Select segment → specify error type + severity → creates manual finding
  - **Manual finding badge**: "👤 Manual" layer badge — distinct from Rule/AI in report
  - **Score impact**: Manual findings affect MQM score calculation
  - **AI training signal**: Manual findings = high-value "missed issue" training data for AI improvement
  - Aligns with "Report missing check" from Trust Recovery path

**Edge Case 8: Rule-based vs AI Contradiction**
- Scenario: Rule says "Missing number '500'" but AI says "Correctly converted to Thai numeral '๕๐๐'"
- Design response:
  - **Conflict merge**: When AI contradicts rule-based finding → merge into single finding showing both perspectives
  - **Display format**: "Rule: ❌ Missing number | AI: ✅ Correctly adapted (92% confidence)"
  - **Single decision**: User resolves once, not twice — reduces decision fatigue
  - **Architecture note**: 3-Layer Pipeline already injects L1 results into AI context — AI should resolve conflicts at analysis time, presenting merged view to user

**Edge Case 9: Re-run Previously Reviewed File**
- Scenario: Updated file version re-uploaded after initial review
- Design response:
  - **Delta review mode**: "12 findings resolved from previous version, 5 new findings, 3 changed"
  - **Decision carry-over**: Identical findings from previous review → auto-apply previous Accept/Reject decisions
  - **Version comparison badge**: "v2 — Changes: 45 segments modified"
  - **Score comparison**: "Previous: 72 → Current: 89 (+17)" — visible improvement

**Edge Case 10: Subjective / Stylistic Findings**
- Scenario: AI flags tone/register mismatch — no clear right/wrong, matter of preference
- Design response:
  - **"Note" action (4th action)**: Acknowledge observation without Accept/Reject — "Reviewed, no action required"
  - **No MQM penalty**: "Note" findings do not affect quality score
  - **Separate report section**: "Stylistic Observations" — distinct from error findings in export
  - Alternative: AI classifies as "Preference" severity level (below Minor) with near-zero penalty weight

**Edge Case 11: Source Text Contains Errors**
- Scenario: Translation accurately reflects source, but source English itself is wrong
- Design response:
  - **"Source issue" action**: Flag that the problem originates in source text, not translation
  - **Separate report section**: "Source Quality Issues" — routed to content/writing team, not translation team
  - **No translation score penalty**: Source issues do not penalize translation quality score
  - **Source issue tracking**: Aggregate source issues across files → "Source quality report for content team"

**Edge Case 12: Mixed Language Pairs in Batch**
- Scenario: Single batch contains EN→TH + EN→ZH + EN→JA files
- Design response:
  - **Group by language pair**: Batch summary shows language pair groups, not flat file list
  - **Per-language AI confidence**: "AI accuracy for EN→TH: 91% | EN→JA: 78%" at group header
  - **Language-specific thresholds**: Auto-pass threshold may differ by language pair (configurable per project)
  - **Language pair filter**: Filter batch view by language pair for focused review

**Three layers of core experience by persona:**

| Persona | Core Experience | Depth Required |
|---------|----------------|:-:|
| **คุณแพร** | Finding Review + Decision (Accept/Reject) at segment level | Full |
| **คุณนิด** | Finding Review + Language Bridge (AI explanation + back-translation) + Flag for native | Full + Language Bridge |
| **PM** | Batch Summary + Auto-pass confirmation | Summary only |
| **VP** | Dashboard metrics | Metrics only |

**"Zero-click Value" Target:** Files that are clean should flow from upload to auto-pass without any user interaction — the ultimate expression of single-pass completion.

## Platform Strategy

**Platform:** Web application (Next.js App Router + shadcn/ui + Tailwind CSS)

**Dual Monitor Workspace Design:**

| Left Monitor | Right Monitor (Our Tool) |
|:---:|:---:|
| CAT Tool (Trados Studio) — source/target segments in translation context | qa-localization-tool — batch summary, issue list, review actions |

**Design Constraints from Dual Monitor Setup:**
- Tool must work well at **single monitor width** (not requiring dual-screen itself)
- **Side panel (Sheet) pattern** for segment detail — no full page navigation, no tab switching
- **Issue → Segment navigation** opens detail in side panel instantly
- **Copy segment ID** to clipboard for cross-referencing in CAT tool on other monitor
- Layout must be **information-dense but scannable** — QA reviewers process 10-15 files/day, every pixel counts

**Input Method:** Primarily mouse + keyboard. Keyboard shortcuts for power users (Accept = A, Reject = R, Flag = F, Next = ↓, Bulk select = Shift+Click)

**Responsive Considerations:** Desktop-first design. Tablet/mobile for VP dashboard viewing only (read-only metrics). Core review workflow is desktop-only.

**Offline:** Not required — all processing requires AI API access. Graceful handling of connection loss with auto-retry.

## Effortless Interactions

**Things that happen automatically (zero user effort):**

| Automatic Action | How | User Sees |
|-----------------|-----|-----------|
| Language pair detection | Read from XLIFF/SDLXLIFF metadata | Pre-filled, editable if wrong |
| File format detection | Extension + XML namespace inspection | Correct parser selected silently |
| SDLXLIFF confirmation states | Skip "Approved" segments, focus "Draft"/"Translated" | Fewer segments to review = faster |
| Trados comments as AI context | Read `<sdl:cmt>` → inject into AI prompt | Better AI accuracy (user doesn't see this) |
| Glossary matching | Precomputed index at import time → instant match per run | Glossary violations appear in rule-based results |
| Score calculation | MQM formula: `100 - (Penalties / WordCount × 1000)` | Score badge on every file |
| Auto-pass routing | Score >= 95 + 0 Critical + AI L2 clean | "Auto-pass ✅" badge — no action needed |
| Duplicate detection | File hash comparison | "Uploaded yesterday (Score 97) — re-run?" prompt |
| Batch summary | Aggregate all file results | "7 auto-pass, 3 need review" at a glance |
| Severity classification | Rule-based = predetermined, AI = MQM auto-classify | Color-coded severity badges |
| Economy mode for PM | Role-based default | Processing Mode Dialog pre-selects Economy for PM role, Thorough for QA role — selected per batch at upload time |

**Effortless Patterns:**
- **Drag & drop upload** — drop files anywhere on the page
- **Batch = default** — uploading multiple files is the primary flow, single file is the exception
- **Progressive results** — start reviewing rule-based findings while AI still processing
- **Bulk accept** — select multiple high-confidence findings, one click to accept all
- **Smart defaults** — Processing Mode Dialog pre-selects Economy for PM, Thorough for QA, threshold set once per project

## Critical Success Moments

**Moment 1: "Xbench Parity Proof" (Initial Exposure) — TRUST FOUNDATION**
> คุณแพรเปิด Xbench report ข้างๆ เทียบทีละจุด → tool ของเราจับได้ทุกอย่างที่ Xbench จับได้ → "ไม่พลาดแม้แต่จุดเดียว"
> **If this fails:** Trust destroyed permanently. Tool becomes "another check" not "the one check."
> **UX requirement:** Rule-based results must appear instantly and be clearly labeled by check type for easy comparison.

**Moment 2: "AI Sees What Xbench Can't" (Early Usage) — AHA! MOMENT**
> AI flags: "Segment #47: 'bank account' translated as 'ริมฝั่งแม่น้ำ' — should be 'บัญชีธนาคาร'" confidence 94%
> **If this succeeds:** "โอ้โห Xbench ไม่เคยจับแบบนี้ได้!" → emotional hook that drives continued usage
> **UX requirement:** AI findings must visually stand out from rule-based findings. The first AI finding should feel like a revelation.

**Moment 3: "The Language Bridge" (Early Adoption) — SCALABILITY UNLOCK**
> คุณนิด sees AI explanation + back-translation for EN→ZH file → understands the meaning error without reading Chinese
> **If this succeeds:** Team of 6-9 can cover all languages without native reviewers → game changer
> **UX requirement:** Back-translation + explanation must be prominent, not collapsed or hidden.

**Moment 4: "Batch Summary Magic" (Early Adoption) — EFFICIENCY PROOF**
> Upload 12 files → "8 auto-pass, 4 need review" → done by lunch instead of 2 days with proofreader loop
> **If this succeeds:** Single-pass completion proven. Proofreader loop eliminated.
> **UX requirement:** Batch summary must be the FIRST thing seen after processing. Clear, immediate, actionable.

**Moment 5: "Auto-pass Trusted" (Trust Established) — FULL ADOPTION**
> PM uploads urgent files → 2 auto-pass → ships to client without waiting for QA → no complaints from client
> **If this succeeds:** QA becomes self-service. Team capacity 2-3x.
> **UX requirement:** Auto-pass audit trail must be accessible and convincing. QA Certificate available.

**Moment 6: "AI Learning Visible" (Ongoing Usage) — EMOTIONAL INVESTMENT**
> "AI accuracy EN→TH: 85% → 91% (learned from your 23 feedback signals)"
> **If this succeeds:** User feels ownership. "MY tool is getting smarter because of ME."
> **UX requirement:** AI learning indicator must be visible, personal, and tied to user's own contributions.

## Experience Principles

Seven guiding principles that govern every UX decision in this product:

| # | Principle | Description | Example |
|:-:|----------|-------------|---------|
| 1 | **Trust Before Features** | Rule-based parity must be proven before AI features matter. Never sacrifice basic accuracy for advanced capabilities. | Xbench parity 100% is MVP Gate — no exceptions |
| 2 | **Instant Value, Progressive Depth** | Show actionable results immediately (rule-based < 5s). Let AI enrich progressively. Never make users wait for everything to finish. | Rule-based findings first → AI streams in → Score updates live |
| 3 | **Decide in 3 Seconds** | Every finding must provide enough context for a 3-5 second decision. Confidence indicator + suggestion + severity = instant decision support. | 🟢 High confidence + suggestion shown inline = Accept immediately |
| 4 | **Batch First, File Second** | The default experience is batch processing (10-15 files). Single file is the exception. Summary → Drill down, never the reverse. | Batch summary as landing page after processing |
| 5 | **Show the Learning** | Make AI improvement visible and personal. Users who see the system learning from THEIR feedback develop loyalty no competitor can replicate. | "AI learned 12 patterns from your feedback — accuracy: 85% → 91%" |
| 6 | **Safe to Trust, Easy to Override** | Auto-pass must be safe (audit trail, periodic blind audit (Deferred — Growth Phase: system randomly selects 5% of auto-passed findings for manual re-review)). But overriding must be frictionless (1-click reject, report missed issue). Trust is earned gradually, never forced. | "Recommended pass" during initial adoption → true "Auto-pass" after trust established |
| 7 | **Design for the Dual Monitor QA Reviewer** | Core users work with CAT tool on one screen and our tool on the other. Information density matters. Every click saved is multiplied by 10-15 files/day. | Side panel for detail, keyboard shortcuts, compact data tables |
