# Xbench Parity Specification

**Status:** DRAFT — awaiting Mona's review and input
**Owner:** PM (John) — drafted from research; Mona provides domain validation
**Blocks:** Epic 2 / Story 2.4 (Rule-based QA Engine)
**FR Reference:** FR8, FR19, FR21

---

## 1. Purpose

This document defines the exact scope of "100% Xbench parity" for the qa-localization-tool's rule-based QA engine. It specifies which Xbench check types the tool must match, how parity is measured, and the golden test corpus structure for automated verification.

---

## 2. Frozen Check Types

Based on [Xbench QA Features](https://docs.xbench.net/user-guide/work-qa-features/) and research analysis. Total: **18 Xbench check types**.

### 2.1 Content Checks (2)

| # | Xbench Check | Tool Phase | Implementation |
|---|-------------|:----------:|----------------|
| 1 | Untranslated segments | MVP | Empty target or target === source detection |
| 2 | Target identical to source | MVP | String equality check (with language-pair exceptions for proper nouns, brand names) |

### 2.2 Formal / Structural Checks (8)

| # | Xbench Check | Tool Phase | Implementation |
|---|-------------|:----------:|----------------|
| 3 | Tag mismatches | MVP | Compare tag arrays from XLIFF parser (id, type, count, order) |
| 4 | Number mismatches | MVP | Regex extraction + set comparison (handle locale formats: `1,000.00` vs `1.000,00`) |
| 5 | Placeholder mismatches | MVP | Regex pattern for `{0}`, `%s`, `%d`, `{{var}}` etc. |
| 6 | Double spaces | MVP | Regex: `/  +/` |
| 7 | Leading/trailing spaces | MVP | Trim comparison between source and target |
| 8 | Unpaired quotes/brackets | Bonus | Balanced pair checker for `""`, `''`, `()`, `[]`, `{}` |
| 9 | URL mismatches | Bonus | URL regex extraction + comparison |
| 10 | End punctuation mismatch | Bonus | Compare last character punctuation between source and target |

### 2.3 Consistency Checks (3)

| # | Xbench Check | Tool Phase | Implementation |
|---|-------------|:----------:|----------------|
| 11 | Same source → different target | MVP | Cross-segment comparison (file-level index) |
| 12 | Same target → different source | MVP | Reverse consistency check |
| 13 | Key term inconsistency | MVP | Cross-segment term usage tracking |

### 2.4 Terminology Checks (2)

| # | Xbench Check | Tool Phase | Implementation |
|---|-------------|:----------:|----------------|
| 14 | Key terms deviation (glossary) | MVP | Glossary import + term matching (Story 1.5 engine) |
| 15 | Custom checklist rules | Bonus | Regex-based custom rules (extensible) |

### 2.5 Capitalization & Other (2)

| # | Xbench Check | Tool Phase | Implementation |
|---|-------------|:----------:|----------------|
| 16 | UPPERCASE word matching | MVP | Regex: `/\b[A-Z]{2,}\b/` — extract from source, verify in target |
| 17 | CamelCase word matching | Bonus | Regex: `/\b[A-Z][a-z]+[A-Z][a-z]+\b/` |

### 2.6 Spelling (1)

| # | Xbench Check | Tool Phase | Implementation |
|---|-------------|:----------:|----------------|
| 18 | Spell check | AI Layer 3 | Covered by AI pipeline — not rule-based |

### Parity Summary

| Category | Xbench Checks | MVP | Bonus | Phase 2 | AI | Gap |
|----------|:------------:|:---:|:-----:|:-------:|:--:|:---:|
| Content | 2 | 2 | — | — | — | 0 |
| Formal/Structural | 8 | 5 | 3 | — | — | 0 |
| Consistency | 3 | 3 | — | — | — | 0 |
| Terminology | 2 | 1 | 1 | — | — | 0 |
| Capitalization | 2 | 1 | 1 | — | — | 0 |
| Spelling | 1 | — | — | — | 1 | 0 |
| **Total** | **18** | **12** | **5** | **—** | **1** | **0** |

> **MVP + Bonus = 17 direct checks.** AI covers spelling. Total gap: 0. No Phase 2 deferred checks.

---

## 3. Category Mapping — Xbench → Tool Taxonomy

| Xbench Category | Tool Internal Category | MQM Dimension | Severity Default |
|----------------|----------------------|---------------|:----------------:|
| Untranslated | `completeness` | Accuracy > Omission | Critical |
| Target = Source | `completeness` | Accuracy > Untranslated | Major |
| Tag mismatch | `tag_integrity` | Accuracy > Markup | Critical |
| Number mismatch | `number_format` | Accuracy > Number | Major |
| Placeholder mismatch | `placeholder_integrity` | Accuracy > Markup | Critical |
| Double spaces | `spacing` | Fluency > Whitespace | Minor |
| Leading/trailing spaces | `spacing` | Fluency > Whitespace | Minor |
| Unpaired quotes/brackets | `punctuation` | Fluency > Punctuation | Minor |
| URL mismatch | `url_integrity` | Accuracy > Markup | Major |
| End punctuation | `punctuation` | Fluency > Punctuation | Minor |
| Consistency (S→T) | `consistency` | Accuracy > Consistency | Minor |
| Consistency (T→S) | `consistency` | Accuracy > Consistency | Minor |
| Term inconsistency | `consistency` | Terminology | Major |
| Glossary deviation | `glossary_compliance` | Terminology | Major |
| Custom rules | `custom_rule` | Configurable | Configurable |
| UPPERCASE matching | `capitalization` | Fluency > Grammar | Minor |
| CamelCase matching | `capitalization` | Fluency > Grammar | Minor |
| Spelling | `spelling` | Fluency > Spelling | Minor |

---

## 4. Xbench Configuration Profile

> **⬜ TODO — Mona to provide:**
>
> 1. Which Xbench check types are **enabled** in your current workflow?
> 2. Which checks do you **disable** (and why)?
> 3. Any custom checklist rules you use?
> 4. Default severity settings per check type?
> 5. Language-specific settings (e.g., Thai spacing exceptions)?

```
<!-- Example Xbench config export or screenshot here -->
```

---

## 5. Golden Test Corpus

### 5.1 Dev Bootstrap Data (available now)

Public XLIFF files for initial rule development — **Dev ใช้ได้เลยไม่ต้องรอ Mona:**

| Directory | Files | Use Case |
|-----------|:-----:|----------|
| `docs/test-data/sap-xliff/en-{ja,ko,zh}/` | 585 | Rule development — MT artifacts, number/placeholder issues |
| `docs/test-data/capstanlqc-xliff/haram-bad/` | 6 | Known-bad XLIFF — tag/markup issues (intentional) |
| `docs/test-data/capstanlqc-xliff/halal-good/` | 6 | Known-good XLIFF — false positive testing |
| `docs/test-data/ocelot-test-files/` | 38 | Spacing, MT artifacts, parser edge cases |

> **Note:** These files do NOT have paired Xbench output — they are for rule development only, not parity verification.

### 5.2 Golden Test Corpus (from Mona)

Uses existing directories defined in `docs/test-data/README.md`:

```
docs/test-data/
├── xliff/clean/              # XLIFF EN→TH with no/minimal issues
├── xliff/with-issues/        # XLIFF EN→TH with known issues
├── xbench-output/            # Xbench QA reports (matched to xliff/ files)
└── ...
```

**Naming convention** (from README): `project-a-file1.xliff` → `project-a-file1-xbench-output.csv`

The golden test corpus = `xliff/` + `xbench-output/` paired together. No separate directory needed.

### 5.3 Minimum Corpus Requirements

Mona to provide production EN→TH files into the existing `docs/test-data/` structure:

| Directory | Minimum | Notes |
|-----------|:-------:|-------|
| `xliff/clean/` | ≥ 5 files | Verify tool reports 0 findings |
| `xliff/with-issues/` | ≥ 15 files | Cover all check types below |
| `xbench-output/` | 1 per XLIFF | Matched CSV export from Xbench |

**Issue coverage across `xliff/with-issues/`:**

| Check Type | Min Files Containing It |
|-----------|:----------------------:|
| Tag mismatches | ≥ 3 |
| Number mismatches | ≥ 2 |
| Placeholder mismatches | ≥ 2 |
| Spacing issues | ≥ 2 |
| Glossary deviations | ≥ 2 |
| Thai-specific | ≥ 3 |
| CJK-specific | ≥ 1 |

> **Total: ≥ 20 files** (5 clean + 15 with issues) — realistic starting point. Expand over time as Dev finds edge cases.

### 5.4 Parity Test Process

```
CI Parity Test Pipeline:
1. Load XLIFF file from golden corpus
2. Run through tool rule engine → capture findings
3. Load matching Xbench output CSV
4. Compare: every Xbench finding must exist in tool findings
5. Report: [Both Found] / [Tool Only] / [Xbench Only]
6. PASS criteria: [Xbench Only] = 0 for all files
7. Any gap = test failure → fix rule → re-run
```

---

## 6. Parity Acceptance Criteria

| Criteria | Threshold | Measurement |
|----------|:---------:|-------------|
| Xbench findings caught by tool | ≥ 99.5% | `[Both Found] / [Total Xbench Findings]` |
| False negatives (Xbench-only) | 0 per file | `[Xbench Only]` count in parity report |
| False positives (tool-only) | ≤ 10% of total | `[Tool Only] / [Total Tool Findings]` — some bonus is OK |
| Thai-specific accuracy | ≥ 95% | Thai corpus subset parity score |
| Processing time | < 5s / 5K segments | NFR2 compliance |

---

## 7. Language-Specific Exceptions

### Thai (TH)

| Exception | Xbench Behavior | Tool Behavior |
|-----------|-----------------|---------------|
| No spaces between words | Xbench may miss spacing issues | Use Intl.Segmenter for word boundary detection |
| Thai numerals (๐-๙) | Xbench treats as non-number | Tool recognizes both Arabic and Thai numerals |
| Politeness particles (ครับ/ค่ะ) | Xbench flags as inconsistency | Tool exempts known particles from consistency check |

### CJK (ZH, JA, KO)

| Exception | Xbench Behavior | Tool Behavior |
|-----------|-----------------|---------------|
| Fullwidth punctuation | Xbench partial support | Tool normalizes halfwidth↔fullwidth before comparison |
| No spaces | Xbench space checks fail | Tool uses Intl.Segmenter for CJK word boundaries |

> **⬜ TODO — Mona to review:**
>
> Are there other language-specific exceptions in your current Xbench workflow?

---

## 8. Sign-off Checklist

- [ ] Check types frozen and confirmed by Mona
- [ ] Xbench configuration profile provided
- [ ] Category mapping reviewed and approved
- [ ] Golden test corpus: ≥ 20 EN→TH files collected (5 clean + 15 with issues)
- [ ] Golden test corpus: Xbench output exported for all files
- [ ] Language-specific exceptions confirmed
- [ ] Document status changed from DRAFT → APPROVED

**Once all items are checked, Story 2.4 is unblocked for development.**
