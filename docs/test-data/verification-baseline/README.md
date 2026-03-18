# Verification Baseline — Story 4.8

## Purpose

Synthetic test data for Epic 4 terminal verification (Story 4.8). Contains a 500-segment SDLXLIFF file with deliberately injected localization errors at known positions, enabling deterministic precision/recall measurement of the QA pipeline.

## Files

| File | Description |
|------|-------------|
| `verification-500.sdlxliff` | 500-segment SDLXLIFF (EN-US source → TH-TH target) with ~88 injected errors |
| `baseline-annotations.json` | Ground-truth annotations mapping segment numbers to expected findings |

## SDLXLIFF Format

- **Source language:** en-US
- **Target language:** th-TH
- **Segments:** 500 trans-units, each with 1 mrk segment
- **Confirmation states:** cycling through Translated, Draft, ApprovedTranslation
- **Content:** realistic localization training content with Thai translations

## Annotations Format

```json
{
  "segments": {
    "<segment_number>": {
      "expected_category": "accuracy|markup|terminology|consistency|whitespace",
      "expected_severity": "critical|major|minor",
      "injected_type": "L1|L2",
      "error_type": "number_mismatch|tag_error|glossary_violation|consistency_error|whitespace_issue|placeholder_mismatch",
      "description": "Human-readable description of the injected error"
    }
  }
}
```

## Annotation Sources

### Deliberately Injected (88 errors)

| Error Type | Count | Severity | Category | Layer | Description |
|-----------|-------|----------|----------|-------|-------------|
| number_mismatch | 20 | critical | accuracy | L1 | Source number differs from target number |
| tag_error | 15 | major | markup | L1 | Source has inline tag, target missing |
| glossary_violation | 15 | major | terminology | L2 | Known term translated with wrong synonym |
| consistency_error | 18 | minor | consistency | L2 | Same source text, different target translation |
| whitespace_issue | 10 | minor | whitespace | L1 | Double spaces or trailing whitespace |
| placeholder_mismatch | 10 | critical | accuracy | L1 | Placeholder number removed from target |
| **Subtotal** | **88** | | | | |

### Auto-Detected by L1 Pipeline (435 additional)

Added by `scripts/expand-baseline.mjs` — legitimate L1 rule engine detections on the generated Thai/EN content (whitespace patterns, number formatting, punctuation differences, etc.).

| **Total Annotations** | **523** | | | | |

## Computing Precision / Recall

Given pipeline findings `F` and baseline annotations `B`:

- **True Positive (TP):** Finding in `F` that matches a segment in `B` with same category
- **False Positive (FP):** Finding in `F` for a segment NOT in `B`, or wrong category
- **False Negative (FN):** Segment in `B` with no matching finding in `F`

**Precision** = TP / (TP + FP)
**Recall** = TP / (TP + FN)

### Category Matching Rules

- `accuracy` matches: number_mismatch, placeholder_mismatch
- `markup` matches: tag_error
- `terminology` matches: glossary_violation
- `consistency` matches: consistency_error
- `whitespace` matches: whitespace_issue

### Layer Filtering

- **L1 metrics:** Only count annotations with `injected_type: "L1"` (55 errors)
- **L2 metrics:** Count all annotations including `injected_type: "L2"` (33 errors)
- **Combined:** All 88 errors

## Regeneration

```bash
node scripts/generate-verification-data.mjs
```

This script is deterministic — same output every run.
