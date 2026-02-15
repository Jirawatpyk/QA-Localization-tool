# Executive Summary

## Project Vision

**qa-localization-tool** is a standalone AI-powered localization QA web application — the first in the market to combine deterministic rule-based checks (Xbench parity) with multi-layer AI semantic analysis and confidence-based automation in a standalone platform.

**Core Value — Single-Pass Completion:** Shifts the paradigm from "multiple review rounds" to "one pass, done" by eliminating the QA → Proofreader → QA review loop entirely. This is achieved through 5 interdependent Pillars:

| # | Pillar | UX Implication |
|:-:|--------|---------------|
| 1 | **Intelligent Prioritization** | Score + severity tells reviewers what to focus on — UI must surface score prominently |
| 2 | **Progressive Disclosure** | Critical → Major → Minor (collapsed) — information architecture must layer clearly |
| 3 | **Confidence-based Trust** | Visual indicators (High/Medium/Low) enable instant decision-making — must be prominent, not interpretive |
| 4 | **Language Bridge** | AI explanation + back-translation for non-native reviewers — must be designed as first-class feature |
| 5 | **Actionable Suggestions** | Not just "wrong" but "here's the fix" with confidence — inline display alongside each finding |

## Target Users

**Primary Personas — 3 roles, 3 distinct need profiles:**

**Persona 1: คุณแพร (Senior QA Reviewer, EN→TH) — Power User**
- 5 years using Xbench daily, knows every strength and weakness → trust must be built from rule-based parity first
- Batch workflow: 10-15 files/day → batch upload + batch summary is the default experience
- Requires segment navigation, bulk accept/reject, progressive disclosure
- Trust journey: compare with Xbench → glance at Xbench → stop opening Xbench
- **Pain**: False positive fatigue — if AI flags incorrectly too often, she will abandon the tool
- **Hidden pain**: "วงจรแห่งการไม่ไว้ใจ" — no single source of truth → must check multiple times
- **Goal**: "The One Check" — single pass completion without sending to proofreader

**Persona 2: คุณนิด (QA Reviewer, non-native ZH/JA/KO) — Language Bridge User**
- Cannot read target language → must rely on AI explanation + back-translation
- 3 actions: Accept / Reject / **Flag for native review** (third action is critical)
- Smart Report with 3 tiers: Verified / Non-native accepted / Needs native verification
- Per-language confidence calibration (EN→ZH/JA/KO starts at 92% threshold)
- Non-native safety net: "Accepted by non-native reviewer" auto-tag on all decisions
- **Goal**: Team of 6-9 covers all languages without relying on freelance native reviewers

**Persona 3: PM/Coordinator — Self-service User**
- Not a QA expert → auto-pass + simple summary is sufficient
- Economy mode pre-selected in the Processing Mode Dialog at upload time (cost-aware, tooltip explains Thorough cost)
- Route to QA reviewer when score is low (manual reviewer selection)
- Content-type warning for sensitive content (legal/medical/financial) (Deferred — Growth Phase)
- Client feedback loop: simple ✅/❌ after delivery (Deferred — Growth Phase)
- **Goal**: Ship files to client without waiting in QA queue

**Secondary — VP/Director (Dashboard Only)**
- Views dashboard only: summary cards, quality trend chart, activity feed, export PDF/Excel
- Must prove ROI to C-level → dashboard = survival tool for QA team's headcount justification
- Measures: total files processed, average score, auto-pass rate, estimated hours saved

## Key Design Challenges

**1. Trust Architecture — The challenge that defines product success** 🔑
- Rule-based must achieve 100% Xbench parity before users will trust AI layer
- "Recommended pass" soft launch during initial adoption phase → true "Auto-pass" after trust established (based on agreement rate > 99%)
- Spot check mode: expanded detail (early adoption) → collapsed (growing familiarity) → glance & confirm (full trust established)
- Trust recovery path: if parity test fails → "Report missing check" + recovery messaging + visible fix
- AI Learning Indicator: show patterns learned + accuracy trend ("AI accuracy EN→TH: 85% → 91%")
- Pre-launch parity certification: คุณแพร must sign-off after repeated parity validation

**2. Dual-layer Information Architecture** 📊
- **Horizontal layers**: Batch summary → File detail → Segment detail → Issue detail
- **Vertical layers**: Rule-based results (instant, < 5s) → AI results (progressive streaming via Supabase Realtime)
- Both dimensions must work together smoothly — no jumpy transitions, no confusing state changes
- "AI pending" badge + rule-based first → AI findings stream in progressively
- Layer 1 results inject into AI prompts as context → AI knows what to skip (zero overlap)

**3. Multi-persona Progressive Disclosure** 👥
- PM: batch summary + auto-pass → done (minimal depth)
- QA Reviewer: drill down to segment + accept/reject/flag (full depth)
- Non-native Reviewer: AI explanation + back-translation + Flag for native review (specialized depth)
- VP: dashboard only → never sees review screens
- Same data, different depth — role-based views are UX-level differences, not just permissions

**4. False Positive Management** 💣
- Bulk reject + "Suppress this pattern" (offered after 3+ rejects of same pattern) → reduce fatigue
- AI Learning status with 2 distinct states: "📝 Feedback logged (50)" vs "✅ Applied to AI (32 patterns)"
- Option to filter AI suggestions from view (show rule-based findings only) — this is a view filter, not a processing mode change
- False positive rate tracking per language pair with visible improvement trend
- AI update changelog: "AI updated: +12 patterns, accuracy EN→TH: 85% → 91%"

**5. Dual Taxonomy UX (QA Cosmetic + MQM)** 🏷️
- UI displays QA Cosmetic terms familiar to the team (from production standards)
- Reports/exports use MQM standard terms (industry-standard for clients/enterprise)
- Admin mapping editor UI — Mona must control the mapping herself without dev involvement (Deferred — Growth Phase admin persona)
- Challenge: prevent user confusion between 2 taxonomy systems in the same interface

**6. First 5 Minutes — Onboarding that delivers value immediately** ⏱️
- "Time to first value < 5 minutes" — must budget time carefully: Create Project + set language pair + import glossary + upload file → all must be minimal friction
- First 30 seconds: guided onboarding flow, not empty dashboard
- First-time user onboarding tour: 5-step walkthrough (severity → actions → auto-pass → report → feedback)
- Cost estimation in Processing Mode Dialog: "Economy: ~$0.15/file, ~30s | Thorough: ~$0.35/file, ~2 min" (estimates vary by file size)
- Trust calibration messaging: communicate that AI is assistant not oracle, false positive target < 10%

**7. Progressive Streaming Score Behavior** ⚡
- Score will "jump" as AI findings arrive (97 → 72 if AI finds Critical issue)
- Must have "interim" badge: "Score: 97 (rule-based only) → Analyzing with AI..." → "Final Score: 72"
- Queue position visibility: "Your batch: 3rd in queue, estimated start: 2 min"
- Progress granularity for large files: "Processing: 2,847 / 8,000 segments (36%)"
- Notification when batch completes — user may be doing other work while waiting
- Estimated time remaining display for long-running processes

**8. Error States & Edge Cases** ⚠️
- AI timeout mid-processing → partial results preservation + "Retry AI" button per file
- File parse failure → clear error message + supported format guidance
- Internet disconnection → graceful degradation + auto-retry when reconnected
- Wrong format upload → instant validation at upload time + format suggestion
- Per-file status in batch view: "AI complete ✅ / AI failed ⚠️ / Rule-based only 📋"
- Concurrent reviewers: file assignment/lock — "In review by คุณแพร" visible to others
- Duplicate file detection: "This file was uploaded yesterday (Score 97) — re-run?"

## Design Opportunities

**1. Language Bridge — Core differentiator no competitor offers** ⭐
- AI explanation in English + back-translation enables non-native reviewers to understand meaning without reading target language
- Must be designed as first-class experience — not hidden in tooltip
- Confidence indicator per language pair: visual High/Medium/Low (not just numbers)
- Per-language confidence calibration: system gets "smarter" per language pair over time

**2. Progressive Streaming UX** ⚡
- Rule-based results < 5 seconds → AI streams in progressively (via Supabase Realtime)
- Design so user can "start working immediately" from rule-based results while AI processes
- Score updates live as AI findings arrive — with clear interim vs final state
- "Work while you wait" pattern: review rule-based findings first, AI enriches later

**3. Confidence-driven Decision Making** 🎯
- High (>85%) / Medium (70-85%) / Low (<70%) visual indicators → reduces cognitive load instantly
- Bulk accept for high-confidence findings (>90%) → dramatically reduces review time
- Per-language calibration → system accuracy improves per language pair over time
- Confidence accuracy dashboard (Growth): "EN→ZH AI confirmed 9/10 findings"

**4. QA Certificate — Trust chain to client** 📜
- 1-click PDF generation → PM can send to client immediately
- Audit trail that proves every decision → compliance-ready documentation
- Detail levels: Standard (pass/fail summary) + Detailed (enterprise: checks performed, segments analyzed)

**5. Self-healing Foundation (Growth Phase Design)** 💊
- Growth phase: AI not only detects but "fixes" with before/after preview
- UX must design foundation that supports 💊 icon + Accept/Modify/Reject flow from MVP architecture
- Trust Gateway: High confidence → auto-apply (Vision), Medium → suggest, Low → flag only
- Progressive trust: Shadow Mode (invisible) → Assisted Mode (visible) → Autonomous Mode (auto-apply)

**6. Data-driven Quality Moat Visualization** 📈
- Show AI accuracy trend that "grows" in front of user — builds emotional investment
- "AI accuracy for EN→TH: 85% → 91% (learned from 23 feedback signals)" → creates loyalty
- Dashboard for VP transforms QA from cost center to measurable quality asset
- Moat: more usage = more accuracy = harder for competitors to match

**7. Emotional Journey Design** 💝
- Map emotional states alongside functional journey:
  - **Skepticism** (initial exposure) → comparison-friendly UX, Xbench parity visible and prominent
  - **Cautious testing** (early adoption) → spot check mode expanded, easy Xbench side-by-side comparison
  - **Pleasant surprise** (Aha! moment) → AI catches what Xbench can't — highlight prominently with celebration moment
  - **Growing trust** (growing familiarity) → spot check mode reduces, auto-pass begins to feel safe
  - **Full reliance** (trust established) → streamlined flow, minimal detail shown, maximum efficiency
- "Xbench Comfort Blanket" pattern: design for easy side-by-side comparison during transition period — let user close Xbench on their own terms
- Trust recovery path: if tool misses something → "Report missing check" + visible fix deployed + rebuild cycle with messaging
