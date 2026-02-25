# Xbench QA Tag Mismatch Findings Summary
**Date:** 2026-02-24 (Golden-Test-Mona Report)  
**Total Findings:** 29 Tag Mismatch(es)

## Overview Table

| File | Status | Count | Issues |
|------|--------|-------|--------|
| AP BT Activity Guide.pptx.sdlxliff | ✓ PARSED | 7 | Nested tag changes, tag duplication |
| AP BT DG Next Chapter.pptx.sdlxliff | ✓ PARSED | 1 | All tags removed |
| AP BT DG Your Role.pptx.sdlxliff | ✗ NOT PARSED | 2 | Tags removed, tag missing |
| AP BT Program Change Summary.pptx.sdlxliff | ✓ PARSED | 12 | Tags removed/reorganized |
| AP BT SM Support Kit.pptx.sdlxliff | ✓ PARSED | 7 | Extra nesting, tag ID changes |
| **TOTALS** | | **29** | **4 parsed + 1 unparsed** |

## Parsed Files Summary (27 findings in 4 files)

### Activity Guide (7 findings)
- **Seg 10:** Malformed closing tag + corrupted text in target
- **Seg 106:** Period tag missing in target
- **Seg 144:** Nested tag removed in target
- **Seg 150:** Single-char tag missing in target  
- **Seg 160:** Nested tag duplicated in target
- **Seg 172:** Nested tag added in target
- **Seg 173:** Extra nested tag added in target

### DG Next Chapter (1 finding)
- **Seg 10:** All tags removed (6 tags) — copyright/header segment

### Program Change Summary (12 findings)
- **Seg 13:** Tag structure reorganized (3→1 tag)
- **Seg 22, 65, 105, 130:** Tags removed (training title segments)
- **Seg 38, 39, 41:** Extra zero-width-space tags removed
- **Seg 40, 53:** Tag nesting reorganized (creates malformed structure)
- **Seg 61, 62, 18, 19:** Tag structure reorganized/consolidated

### SM Support Kit (7 findings)
- **Seg 5:** All tags removed (4 tags) — copyright/header segment
- **Seg 24:** All tags removed (2 tags) — training plan title
- **Seg 25, 27, 28:** Extra nested `<g id="155">` added
- **Seg 26, 28:** Tag ID changed from source
- **Seg 29:** Tag duplication (`<g id="289">` nested in itself)

## Not-Parsed File (2 findings)

### DG Your Role (>15MB, not parsed)
- **Seg 10:** All tags removed (copyright/header)
- **Seg 127:** Comma tag missing

---

## Key Patterns Identified

| Pattern | Count | Files | Issue Level |
|---------|-------|-------|------------|
| Tags completely removed | 9 | All 5 | High |
| Tag nesting changes | 7 | Activity Guide, Program Change | High |
| Tag structure reorganized | 5 | Program Change, SM Support | Medium |
| Tag duplication/self-nesting | 3 | SM Support Kit | Medium |
| Individual tags missing | 9 | All 5 | Medium |

## Segment Categories

**Copyright/Header Segments (Seg 5, 10, 23):** Most aggressive tag removal
- Segments 5, 10, 23 across 4 files: ALL tags removed
- Pattern: Source has `<g id="X">` wrappers for language-specific text, target has plain text

**Training Plan/Title Segments (Seg 22, 24, 60, 65, 105, 130):**
- 6 segments with tag removal or major reorganization
- Pattern: Translator simplified "Global <g>Barista</g> TRAINER Training" → plain Thai text

**Instruction/Procedural Segments (Seg 144–173):**
- Most tag nesting issues (7 findings)
- Pattern: Nested tags duplicated or reorganized during translation

---

## Recommendations for Rule Engine

1. **Immediate (High Priority):**
   - Flag any segment where tag count differs >50% between source and target
   - Detect tag ID mismatches (source has `<g id="X">`, target missing)
   - Detect self-nested tags (e.g., `<g id="155"><g id="155">`)

2. **Follow-up (Medium Priority):**
   - Review copyright header segments (5, 10, 23) for intentional style simplification
   - Investigate training plan title segments (22, 60, 65) — may need context-aware exception rule
   - Analyze instruction segments (144–173) for translator conventions

3. **For Not-Parsed File:**
   - Consider file size optimization or implement streaming parser for "DG Your Role.pptx.sdlxliff"

---

## Full Detailed Report

See **`2026-02-24-xbench-tag-mismatch-findings-raw.txt`** for complete finding details with full source/target XML.
