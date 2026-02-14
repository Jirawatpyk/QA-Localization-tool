# Defining Core Experience

### The Defining Experience

**"Upload, scan, decide, ship — in one pass."**

If a user had to describe qa-localization-tool to a colleague in one sentence:

| Persona | "Describe to friend" | Emotional Hook |
|---------|---------------------|---------------|
| **คุณแพร** | "อัพโหลดไฟล์ → เห็น error ทันทีพร้อมวิธีแก้ → กด Accept/Reject → ส่งลูกค้า ไม่ต้องส่ง proofreader" | "เสร็จจริงใน 1 รอบ" |
| **คุณนิด** | "มันแปล error กลับมาเป็นอังกฤษให้ — ฉันรีวิวภาษาจีนได้โดยไม่ต้องอ่านจีน" | "ฉันทำได้สิ่งที่เคยเป็นไปไม่ได้" |
| **PM** | "อัพโหลดไฟล์ → ถ้าคะแนนผ่าน ส่งลูกค้าได้เลย ไม่ต้องรอ QA" | "ไม่ต้องรออีกแล้ว" |
| **VP** | "เห็น dashboard ว่าทีม QA process กี่ไฟล์ คุณภาพเท่าไหร่ ประหยัดเวลากี่ชั่วโมง" | "พิสูจน์คุณค่าทีมได้" |

**The "Tinder Swipe" Equivalent:**

Tinder = Swipe right/left. qa-localization-tool = **"See finding → Accept/Reject in 3 seconds."** The 3-second finding decision is our "swipe" — repeated hundreds of times per day, must be instant, satisfying, and decisive. Everything in the product exists to make this moment perfect.

### User Mental Model

**How users currently think about QA — and where our tool shifts their model:**

#### คุณแพร's Mental Model (Power User — Xbench Veteran)

**Current model (Xbench):**
```
Run Xbench → Get static report → Read top to bottom →
  Open CAT tool → Find segment → Fix → Re-run Xbench →
    Send to Proofreader → Wait → Get corrections → QA again → Ship
```

**Key beliefs she brings:**
- "QA report is a document I READ, not a workspace I WORK IN"
- "Tool checks, I decide EVERYTHING — tool is never right on its own"
- "Same input = same output — deterministic is trustworthy, AI is unreliable"
- "False positive = disrespect for my time — 1 wrong answer outweighs 10 right ones"
- "I am the expert, tool is the assistant — never the other way around"

**Mental model shift required:**

| From (Xbench) | To (Our Tool) | Friction Point |
|---------------|--------------|---------------|
| Static report to read | Interactive workspace to work in | "Where's my report?" → Review mode IS the report |
| Review → Proofreader → QA again | Review → Done (single pass) | "How can I trust without second check?" → Audit trail + certificate |
| Tool flags only | Tool flags AND suggests fixes | "Don't tell me what to do" → Suggestions are offers, not commands |
| Every finding needs full attention | High-confidence findings can be bulk accepted | "I need to check everything" → Trust builds gradually over weeks |
| AI = unreliable black box | AI = learning assistant with visible accuracy | "How do I know AI is right?" → Confidence indicators + accuracy trend |

**Workarounds she currently uses (that our tool eliminates):**
- Excel spreadsheet to track reviewed files → automatic state persistence
- Copy-paste segment IDs between Xbench and Trados → click-to-navigate + copy ID
- Mental note of recurring false positives → pattern suppression after 3 rejects
- Ask colleagues on Slack about uncertain findings → Flag action with notification

#### คุณนิด's Mental Model (Non-native Reviewer)

**Current model:**
```
Open file → Read what I can → Guess what I can't →
  Ask native speaker colleague → Wait for answer →
    Decide based on their response → Flag uncertainty in Excel →
      Hope nothing was missed
```

**Key beliefs she brings:**
- "I can't judge what I can't read — I need a human translator"
- "Asking for help = showing incompetence" (cultural: ไม่อยากรบกวน)
- "Better to flag too much than miss something"
- "My judgment is limited by my language skills"

**Mental model shift required:**

| From (Current) | To (Our Tool) | Friction Point |
|----------------|--------------|---------------|
| "I can't read this" | "AI translates back to English for me" | "Can I trust the back-translation?" → Back-translation confidence indicator |
| Ask colleague, wait for answer | Flag in tool, get notified when resolved | "Will anyone look at my flags?" → Auto-notify + resolution feedback |
| Binary: I understand / I don't | Spectrum: High / Use with caution / Flag for native | "It's OK to be partially confident?" → Confidence levels give permission |
| My value = my language skills | My value = my QA judgment + AI augmentation | "Am I being replaced?" → AI assists, human decides |

#### PM's Mental Model

**Current model:**
```
Receive translated files → Put in QA queue → Wait 1-3 days →
  Get QA report → Send to Proofreader → Wait again →
    Get corrected files → Final QA → Ship to client
```

**Key beliefs:** "QA = bottleneck between me and delivery" / "I just need: can I ship this? Yes or no" / "I don't understand QA details, I trust the QA team"

**Mental model shift:** Wait in QA queue → Self-service upload and instant answer. "But what if auto-pass is wrong?" → Audit trail + QA Certificate provides proof.

#### VP's Mental Model

**Current:** Cannot measure QA team output, cannot prove ROI to C-level, quality is subjective.

**Shift:** Dashboard transforms QA from invisible process to measurable asset with KPIs (files processed, average score, auto-pass rate, hours saved).

### Success Criteria

**Measurable "this just works" indicators:**

| Criteria | Measurement | Target |
|----------|------------|--------|
| **Time to first result** | Upload to first findings visible | < 5 seconds (rule-based) |
| **Decision speed per finding** | Avg time from seeing finding to Accept/Reject | < 3 seconds for High confidence |
| **Batch completion time** | 12 files from upload to export | < 30 minutes (vs 2 days with proofreader loop) |
| **Auto-pass accuracy** | Auto-passed files with zero client complaints | > 99% |
| **False positive rate** | Findings rejected as false positive / total | < 10% (target < 5% after calibration) |
| **Keyboard-only review** | % of Core Loop completable without mouse | > 80% for power users |
| **Resume accuracy** | Return to partial review → correct position restored | 100% |
| **Language Bridge usability** | Non-native decision accuracy vs native reviewer | > 90% agreement rate |
| **Score comprehension** | Users who understand and trust the score | < 5% report "score confusion" |
| **Zero re-review** | Files needing second QA round | < 3% (vs current ~40%) |

### Novel vs Established UX Patterns

| Pattern | Classification | Education Needed? |
|---------|:---:|---------|
| Finding list with severity badges | **Established** (VS Code) | None |
| Accept/Reject per finding | **Established** (GitHub PR) | None |
| Inline suggestion with confidence | **Established** (Grammarly) | Minimal |
| Command palette (Ctrl+K) | **Established** (Linear, VS Code) | None for power users |
| Batch upload → summary | **Established** (file management) | None |
| MQM quality score | **Adapted** (Grammarly → industry standard) | Minimal — "like a grade" |
| Side panel for detail | **Established** (Linear, email) | None |
| Language Bridge | **Novel** — our innovation | Yes — onboarding must explain |
| Cross-file pattern resolve | **Novel** — our innovation | Yes — tooltip explanation |
| AI learning visibility | **Novel** — our innovation | Minimal — self-explanatory |
| Progressive streaming | **Novel** — our innovation | Yes — first-time explanation |
| Confidence-driven bulk accept | **Novel** — our innovation | Minimal — filter UI |
| Auto-pass with audit trail | **Adapted** (CI/CD → QA) | Yes — trust built gradually |

8/13 patterns are Established or Adapted — users feel familiar with ~60% of the interface immediately. The 5 Novel patterns are our differentiators and need targeted onboarding.

### Experience Mechanics

The detailed step-by-step mechanics of the Core Action Loop are defined in the **Core User Experience** section (Step 3), including visual scan path, per-persona views, 7 action types, 8 finding states, bulk operations, keyboard navigation, 10 design safeguards, and 12 edge case responses.

**Mechanics summary — 4 phases of core interaction:**

| Phase | User Action | System Response | Completion Signal |
|-------|-----------|----------------|------------------|
| **1. Initiation** | Drag & drop files → Select mode → Run | Validation → Queue → Processing | "Processing: 3 files queued" |
| **2. Scanning** | View batch summary → Identify files needing review | Rule-based < 5s → AI streams progressively | "7 auto-pass, 3 need review" |
| **3. Reviewing** | Drill into file → Core Loop × N findings | States update → Progress advances → Score recalculates | "Review Complete" per file |
| **4. Completing** | Export report → Generate certificate → Deliver | Report → Certificate PDF → Audit trail sealed | "Batch complete — Export ready" |
