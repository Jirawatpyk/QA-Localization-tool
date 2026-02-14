# Data Requirements & Human Feedback Plan

**Project:** qa-localization-tool
**Date:** 2026-02-12
**Author:** Mona (with John PM + Team)
**Purpose:** Comprehensive checklist of all real data and human feedback needed from Mona for AI agents to successfully build the system.

---

## Why This Document Exists

The BMAD AI agents (Winston, Amelia, Quinn, etc.) can build ~90% of the system from research and specifications alone. The remaining ~10% requires **real production data** and **human domain expertise** that only Mona and the QA team can provide. Without these inputs, the AI agents will produce working code that may not match real-world behavior.

This document serves as:
- A **preparation checklist** for Mona before and during development
- A **timeline** of when each input is needed
- A **format specification** so data is immediately usable
- A **feedback protocol** so review cycles are efficient

---

## A. Real Production Data

> **When needed:** Before Sprint 3 (Rule Engine development)
> **Where to put files:** `docs/test-data/` directory in project root

### A1. XLIFF Files from Production

| Detail | Specification |
|--------|--------------|
| **What** | Real XLIFF files from actual localization projects |
| **Format** | `.xliff` or `.xlf` |
| **Quantity** | 20-50 files (more = better golden test coverage) |
| **Must include** | Both XLIFF 1.2 and XLIFF 2.0 files |
| **Must include** | Files with inline tags (`<g>`, `<x/>`, `<ph>`, `<bx/>`, `<ex/>`, `<bpt>`, `<ept>` for 1.2; `<pc>`, `<ph>`, `<sc>`, `<ec>` for 2.0) |
| **Must include** | Files with notes/comments/context metadata |
| **Must include** | Files of varying quality — some clean, some with known issues |
| **Organize into** | `docs/test-data/xliff/clean/` and `docs/test-data/xliff/with-issues/` |
| **Sensitive data** | Anonymize or redact client-specific content if needed |
| **Status** | ⬜ Not started |

### A2. Excel Bilingual Files from Production

| Detail | Specification |
|--------|--------------|
| **What** | Real Excel files with source/target columns used in QA workflow |
| **Format** | `.xlsx` |
| **Quantity** | 5-10 files |
| **Must include** | Document which column is source and which is target |
| **Must include** | Note any other columns that carry useful metadata (context, notes, max length) |
| **Organize into** | `docs/test-data/excel/` |
| **Status** | ⬜ Not started |

### A3. Xbench Output for Parity Testing

| Detail | Specification |
|--------|--------------|
| **What** | Xbench QA report export from the **same XLIFF files** in A1 |
| **Format** | `.csv` or `.xml` (Xbench export format) |
| **Quantity** | One output per XLIFF file in A1 (or at least 20 files) |
| **How** | Run each XLIFF file through Xbench with all checks enabled → export results |
| **Purpose** | Our rule engine must catch everything Xbench catches (100% parity) |
| **File naming** | Match XLIFF filename: `original-file.xliff` → `original-file-xbench-output.csv` |
| **Organize into** | `docs/test-data/xbench-output/` |
| **Status** | ⬜ Not started |

### A4. Glossary Files

| Detail | Specification |
|--------|--------------|
| **What** | Real glossaries used in production QA |
| **Format** | `.csv`, `.xlsx`, or `.tbx` (whatever format the team uses) |
| **Quantity** | 2-3 glossaries from different projects/domains |
| **Must include** | Source term + approved target term(s) per entry |
| **Must document** | Case-sensitive or not? Multiple approved translations per term? |
| **Organize into** | `docs/test-data/glossaries/` |
| **Status** | ⬜ Not started |

### A5. QA Cosmetic Checklist (Extended Version)

| Detail | Specification |
|--------|--------------|
| **What** | If there is a more detailed version of the QA Cosmetic standards than what is in `docs/QA _ Quality Cosmetic.md` |
| **Format** | `.md`, `.xlsx`, or `.pdf` |
| **Include** | Any additional checks, client-specific rules, or language-specific notes not in the current document |
| **If no extended version** | Confirm that `docs/QA _ Quality Cosmetic.md` is the complete standard |
| **Status** | ⬜ Not started |

---

## B. Language Pair Samples

> **When needed:** Before Sprint 3 (Rule Engine development)
> **Purpose:** Test that rules work correctly across all target languages
> **Organize into:** `docs/test-data/language-samples/`

### Must-Have Samples per Language Pair

For **each language pair**, provide at least 2 files — one clean, one with known issues:

| # | Language Pair | Priority | Specific Edge Cases to Include |
|:-:|:------------:|:--------:|-------------------------------|
| B1 | **EN→TH** | 🔴 Critical (dogfood language) | No word spaces, line breaks, Thai numerals (๑๒๓), ครับ/ค่ะ spacing |
| B2 | **EN→ZH** | 🔴 Critical (no-space language) | Fullwidth punctuation (。，！), no spaces, simplified vs traditional |
| B3 | **EN→JA** | 🔴 Critical (no-space + mixed scripts) | Mixed scripts (hiragana/katakana/kanji), fullwidth characters, no spaces |
| B4 | **EN→KO** | 🟡 High | Korean spacing rules, Hangul syllables |
| B5 | **EN→ES** | 🟡 High | Inverted punctuation (¿¡), gender/number agreement, accents (á, ñ) |
| B6 | **Other pairs** | 🟢 Nice to have | DE, FR, AR (RTL) — if available |

> **Note:** TH, ZH, JA are all "Critical" because they share the same fundamental challenge — no spaces between words, making word boundary `\b` unusable. Rules must be validated against all three, not just one.

### Files with Known Issues (Critical for Golden Test)

| # | Issue Type | What to Provide | Purpose |
|:-:|-----------|----------------|---------|
| B6 | **Tag errors** | File where tags are missing/extra/reordered in target | Validate Rule 1 |
| B7 | **Missing translations** | File with empty targets or untranslated segments | Validate Rule 2 |
| B8 | **Number mismatches** | File where numbers differ between source and target | Validate Rule 3 |
| B9 | **Placeholder errors** | File with missing/extra placeholders in target | Validate Rule 4 |
| B10 | **Glossary violations** | File + glossary where terms are not followed | Validate Rule 5 |
| B11 | **Mixed issues** | File with multiple issue types — realistic production scenario | Integration test |

**Status:** ⬜ Not started

---

## C. Human Feedback Protocol

> **When needed:** During Sprint 3-8 (iterative development)
> **How it works:** AI agents produce output → Mona reviews → feedback drives improvement

### C1. Rule Findings Review (Sprint 3-5)

| Detail | Specification |
|--------|--------------|
| **What** | AI agents run rule engine on real files → produce findings list |
| **Mona's action** | Review each finding and mark: ✅ Correct / ❌ False Positive / 🏳️ Missing (false negative — issue exists but not caught) |
| **Format** | We will provide a simple review interface or spreadsheet |
| **Time commitment** | ~30 min per review round, estimated 3-5 rounds |
| **Goal** | Rule engine achieves < 5% false positive rate |

### C2. Score Validation (Sprint 5)

| Detail | Specification |
|--------|--------------|
| **What** | AI agents calculate MQM score for files → Mona validates |
| **Mona's action** | For each file: "Score 92 — does this feel right for the quality level?" |
| **Purpose** | Calibrate severity weights and auto-pass threshold |
| **Time commitment** | ~15 min, review 10-15 files with scores |

### C3. Xbench Parity Review (Sprint 5)

| Detail | Specification |
|--------|--------------|
| **What** | Side-by-side comparison: our findings vs Xbench findings |
| **Mona's action** | Confirm: "Xbench caught X but we didn't" → is this important? Should we add it? |
| **Purpose** | Ensure 100% parity on important checks |
| **Time commitment** | ~1 hour, one-time deep review |

### C4. AI Prompt Output Review (Sprint 6-8)

| Detail | Specification |
|--------|--------------|
| **What** | AI Layer 2+3 flag issues → Mona reviews AI findings |
| **Mona's action** | Per AI finding: ✅ Correct / ❌ False Positive / 🏳️ Missing |
| **Additional** | "AI said 'mistranslation' — is this actually wrong? Why?" |
| **Purpose** | Tune prompts to reduce false positives, improve recall |
| **Time commitment** | ~30 min per round, estimated 5-10 rounds over 3 sprints |

### C5. Multi-Language Rule Validation (Sprint 3-5)

| Detail | Specification |
|--------|--------------|
| **What** | Rule engine results on non-Latin language files — TH, ZH, JA, KO, AR |
| **Mona's action** | Per language: confirm "This spacing/punctuation flag — is this a real issue or normal for this language?" |
| **Purpose** | Calibrate rules for language-specific patterns (no-space languages, fullwidth punctuation, RTL, mixed scripts) |
| **Languages** | TH (no spaces, Thai numerals), ZH (no spaces, fullwidth), JA (mixed scripts), KO (spacing), AR (RTL) |
| **Time commitment** | ~30 min, during C1 review rounds — cover all available language pairs |

### C6. Ongoing False Positive Monitoring (Sprint 8+)

| Detail | Specification |
|--------|--------------|
| **What** | Weekly sample review of auto-pass files |
| **Mona's action** | Blind review 5% of auto-passed files → compare with tool findings |
| **Purpose** | Auto-pass confidence audit (target > 99% accuracy) |
| **Time commitment** | ~30 min/week |

---

## D. Domain Knowledge (Captured During PRD)

> **When needed:** During PRD creation (John PM will ask these questions)
> **No preparation needed** — just be ready to answer during PRD interview

| # | Question | Purpose |
|:-:|---------|---------|
| D1 | **Which rules are most frequently triggered in current QA?** | Prioritize rule development order |
| D2 | **What are common exception patterns?** (brand names, URLs, tech terms that should NOT be flagged as untranslated) | Build exception lists per project |
| D3 | **What content types does the team handle?** (legal, marketing, technical, medical, general) | Configure auto-pass thresholds per content type |
| D4 | **Walk through today's workflow step by step** — from receiving a file to delivering to client | Validate user journey and identify automation points |
| D5 | **What are the most annoying false positives from Xbench?** | Train AI to avoid the same mistakes |
| D6 | **How does batch processing work today?** — how many files at once? How is the summary reported? | Design batch UX |
| D7 | **What does the ideal QA report look like?** — what sections, what format, what info is critical? | Design report export |
| D8 | **How does the handoff to native reviewer work today?** | Design "Flag for native review" workflow |

---

## Summary Timeline

```
NOW (Before PRD)
├── ✅ This document created
├── ⬜ Mona starts collecting A1-A5 files
└── ⬜ D1-D8 answered during PRD interview with John

Before Sprint 3 (~Week 4-5)
├── ⬜ A1: 20-50 XLIFF files in docs/test-data/xliff/
├── ⬜ A2: 5-10 Excel files in docs/test-data/excel/
├── ⬜ A3: Xbench output in docs/test-data/xbench-output/
├── ⬜ A4: Glossaries in docs/test-data/glossaries/
├── ⬜ A5: QA Cosmetic extended (or confirm current is complete)
├── ⬜ B1-B5: Language pair samples in docs/test-data/language-samples/
└── ⬜ B6-B11: Files with known issues

Sprint 3-5 (Rule Engine)
├── ⬜ C1: Rule findings review (3-5 rounds × 30 min)
├── ⬜ C2: Score validation (1 round × 15 min)
├── ⬜ C3: Xbench parity review (1 round × 1 hour)
└── ⬜ C5: Multi-language rule validation — TH, ZH, JA, KO, AR (during C1)

Sprint 6-8 (AI Pipeline)
└── ⬜ C4: AI prompt output review (5-10 rounds × 30 min)

Sprint 8+ (Launch & Beyond)
└── ⬜ C6: Weekly false positive monitoring (30 min/week)
```

---

## Data Security Notes

- All production files should be **anonymized** if they contain client-confidential content
- Remove or redact: client names, internal project codes, sensitive business information
- Keep: all translation content, tags, metadata, formatting — these are essential for testing
- Store in `docs/test-data/` — add to `.gitignore` if the repo will be public

---

## File Organization Structure

```
docs/
└── test-data/
    ├── xliff/
    │   ├── clean/              # Files with no/minimal issues
    │   └── with-issues/        # Files with known issues
    ├── excel/                  # Excel bilingual files
    ├── xbench-output/          # Xbench QA reports (matched to xliff/)
    ├── glossaries/             # Production glossary files
    └── language-samples/
        ├── en-th/              # Thai samples
        ├── en-zh/              # Chinese samples
        ├── en-ja/              # Japanese samples
        └── en-ko/              # Korean samples
```
