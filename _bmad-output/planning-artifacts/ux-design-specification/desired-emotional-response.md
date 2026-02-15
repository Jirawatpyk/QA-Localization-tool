# Desired Emotional Response

## Primary Emotional Goals

**Overarching Emotion: "Provable Confidence" (ความมั่นใจที่พิสูจน์ได้)**

Not just "feeling" confident — the tool must provide **evidence** for every confidence claim (score, audit trail, parity proof). This is the emotional foundation that differentiates qa-localization-tool from competitor tools that ask users to "just trust."

| Persona | Current Pain | Target Emotion | Evidence Mechanism |
|---------|-------------|---------------|-------------------|
| **คุณแพร** | "วงจรแห่งการไม่ไว้ใจ" — no single source of truth, must check multiple times | **Confident + In Control** — "จับได้หมด ไม่พลาดแม้แต่จุดเดียว" | Xbench parity proof, 100% rule-based match, audit trail |
| **คุณนิด** | Cannot read target language, depends on native reviewers | **Capable + Unafraid** — "ฉันรีวิวภาษาจีนได้โดยไม่ต้องอ่านจีน" | Language Bridge (back-translation + AI explanation), confidence indicator, Flag safety net |
| **PM** | Waiting in QA queue, afraid to ship without QA sign-off | **Relieved + Fast** — "ส่งได้เลย ไม่ต้องรอใคร" | Auto-pass badge, QA Certificate, score threshold |
| **VP** | Cannot prove QA team value to C-level | **Justified + Proud** — "ทีม QA สร้าง ROI ชัดเจน" | Dashboard metrics, quality trends, hours saved calculation |

## Emotional Journey Mapping

**Phase 1: Skepticism (Day 1)**
- User emotion: "อีก tool หนึ่ง... ได้จริงเหรอ?"
- Design response: Comparison-friendly UX — rule-based results labeled by check type for easy Xbench side-by-side verification
- Target transition trigger: "ไม่พลาดแม้แต่จุดเดียวที่ Xbench จับได้" → skepticism cracks

**Phase 2: Cautious Testing (Week 1-2)**
- User emotion: "ลองดูก่อน แต่ยังเปิด Xbench ไว้ข้างๆ"
- Design response: Spot check mode with expanded detail — easy to verify every finding. "Xbench Comfort Blanket" pattern: let user close Xbench on their own terms
- Target transition trigger: "AI จับ error ที่ Xbench จับไม่ได้!" → AHA moment → emotional hook

**Phase 3: Pleasant Surprise (Week 2-3)**
- User emotion: "โอ้โห ไม่คิดว่าจะจับได้!"
- Design response: AI findings visually distinct from rule-based — the first AI finding should feel like a revelation. Celebrate the moment subtly (not confetti — professional context)
- Target transition trigger: Multiple AI catches build pattern → "tool นี้ฉลาดกว่าที่คิด"

**Phase 4: Growing Trust (Week 3-4)**
- User emotion: "เริ่มไว้ใจได้ ไม่ต้องเช็คทุกอัน"
- Design response: Spot check mode starts collapsing — user sees less detail by default. Auto-accept for High confidence + Minor begins to feel safe. Bulk accept becomes routine
- Target transition trigger: "Recommended pass" files consistently clean → trust in auto-pass grows

**Phase 5: Full Reliance (Month 2+)**
- User emotion: "tool ฉัน tool เดียว ไม่ต้องเปิดอย่างอื่น"
- Design response: Streamlined flow — minimal detail shown, maximum efficiency. Auto-pass is trusted. Xbench uninstalled (or forgotten)
- Target transition trigger: PM ships auto-pass files without QA → no client complaints → "The One Check" achieved

**Phase 6: Ownership (Month 3+)**
- User emotion: "tool ฉลาดขึ้นเพราะฉัน"
- Design response: AI learning indicator personal and visible — "AI learned 23 patterns from YOUR feedback"
- Target transition trigger: "AI accuracy EN→TH: 85% → 91%" — user feels invested, switching cost becomes emotional not just functional

## Micro-Emotions

**Critical micro-emotion pairs within the Core Action Loop:**

| Moment | Desired Emotion | Emotion to Avoid | Design Mechanism |
|--------|----------------|-----------------|-----------------|
| See finding severity | **Clarity** — instant priority understanding | Confusion — "how bad is this?" | Color-coded severity badges |
| Read source/target | **Recognition** — "I see the problem" | Overwhelm — too much text to parse | Highlight only problematic part, not full segment |
| Check confidence | **Trust calibration** — "I know how much to trust this" | Blind trust OR complete skepticism | Indicators with percentage + layer badge |
| See suggestion | **Relief** — "I don't have to think of the fix myself" | Frustration — suggestion is wrong/unhelpful | Suggestion shown inline + severity override if disagreed |
| Make decision | **Decisiveness** — "I'm sure about this" | Anxiety — "what if I'm wrong?" | Undo available + audit trail + "When in doubt, Flag" |
| After decision | **Progress** — "moving forward efficiently" | Tedium — "still 200 more to go..." | Progress indicator + smart grouping for similar findings |
| AI findings arrive | **Enrichment** — "more insight, better quality" | Disruption — "stop changing things!" | Append-only + non-disruptive notification |
| Score changes | **Understanding** — "I know why it changed" | Anxiety — "what happened?!" | Score change log + clear interim vs final labeling |
| Encounter false positive | **Empowerment** — "I can teach the system" | Frustration — "another wrong answer" | Reject → feedback → pattern suppression → AI learns |
| Complete a file | **Accomplishment** — "done, and done right" | Uncertainty — "did I miss something?" | "Review Complete" + auto-navigate next file |
| Complete a batch | **Definitive completion** — "เสร็จจริงๆ ไม่ต้องส่งซ้ำ" | Lingering doubt — "hope the client doesn't find anything" | QA Certificate + audit trail + score summary |
| Return to tool next day | **Familiarity** — "back to my tool" | Dread — "ugh, more reviewing" | Resume prompt + show yesterday's progress + AI learning update |

## Design Implications

**Emotion-to-UX Design Connection Map:**

| Target Emotion | UX Design Approach | Specific Implementation |
|---------------|-------------------|------------------------|
| **Provable Confidence** | Evidence-first UI — never claim without proof | Score = formula visible, Parity = check-by-check comparison, Auto-pass = audit trail accessible |
| **Capability (non-native)** | Language Bridge as first-class feature | Back-translation always visible for non-native, confidence indicator per language pair, "When in doubt, Flag" principle |
| **Efficiency** | Minimize decisions per unit of value | Auto-resolve High+Minor, cross-file pattern resolve, batch-level actions, keyboard-only flow |
| **Control** | Override everything, force nothing | Severity override, manual finding addition, Note action, rule-based only mode toggle, confidence threshold filter |
| **Progressive Trust** | Earned trust, never forced | "Recommended pass" → true Auto-pass timeline, spot check mode reduces naturally, AI accuracy trend visible |
| **Ownership** | Personal AI learning visible | "AI learned N patterns from YOUR feedback", per-user accuracy metrics, feedback impact notifications |
| **Safety during errors** | Every error state has: what happened + nothing lost + what to do next | Partial results preserved, retry per file, graceful degradation, auto-save review state |
| **Accomplishment** | Clear completion signals at every level | File "Review Complete", batch summary, QA Certificate generation, score comparison for re-runs |

**Negative Emotions to Actively Prevent:**

| Emotion | Cause | Prevention |
|---------|-------|-----------|
| **Decision fatigue** | 450 Accept/Reject per day | Auto-resolve mode, smart grouping, bulk accept, Triage mode for 200+ findings |
| **False positive frustration** | AI flags incorrectly >10% | Confidence threshold filter, pattern suppression, AI accuracy indicator, rule-based only mode |
| **Context switch exhaustion** | 600+ eye switches between monitors/day | Surrounding segments in finding card, sufficient inline context, copy segment ID |
| **Score anxiety** | Score jumps unexpectedly mid-review | Interim badge, score change notification with reason, score change log |
| **Flag futility** | Flagged items never get attention | Auto-notify native reviewer, flag counter badge, expiry warning, resolution feedback |
| **Lost progress panic** | Close browser, lose position | Auto-save, resume prompt, unresolved filter default on return |
| **Overwhelm** | Too much information per finding | Compact/Detailed mode toggle, progressive disclosure within finding |

## Emotional Design Principles

Five principles that translate emotional goals into actionable design rules:

| # | Principle | Rule | Measurement |
|:-:|----------|------|------------|
| 1 | **Evidence Over Assertion** | Never tell users to "trust" — show them why they should. Every confidence claim must have visible proof. | Users can explain WHY they trust the tool (not just "it feels right") |
| 2 | **Celebrate Quietly** | Mark achievements without interrupting flow. Professional QA context — no gamification. Progress indicators and completion badges should feel informative, not patronizing. | No confetti, no "Great job!" popups — completion signals are clean and professional |
| 3 | **Frustration Has a 3-Strike Limit** | If the same frustration occurs 3 times (false positive, repeated error, slow response), proactively offer a solution — don't wait for the user to find it. | Pattern suppression prompt after 3 rejects, "Suppress this check?" after repeated dismissals |
| 4 | **Progress Must Always Move Forward** | Progress indicators should never go backwards. AI findings append to end, not middle. Score changes explain themselves. Batch progress only increments. | "10/15 reviewed + 8 AI pending" (never "10/23" that feels like regression) |
| 5 | **The Tool Remembers, The User Doesn't Have To** | Auto-save everything, resume intelligently, carry over decisions to re-runs, remember user preferences. The cognitive burden of "where was I?" should never exist. | Resume prompt accuracy, decision carry-over rate, zero re-review of already-decided findings |
