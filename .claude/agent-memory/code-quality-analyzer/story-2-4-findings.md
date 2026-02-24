# Story 2.4 Rule Engine — Code Review Findings

## CR Round 1 (18 findings fixed)

- ReDoS risk in customRuleChecks: FIXED with MAX_CUSTOM_REGEX_LENGTH=500
- Audit log happy-path: FIXED with try-catch wrapper
- Error-path rollback: FIXED with try-catch wrapper
- isRuleCategory() Set creation: FIXED to module-level constant
- segments[0] language derivation: DOCUMENTED (deferred to Story 2.7)
- Drizzle schema missing index: DOCUMENTED in comment (still not in schema)
- CAS guard: CORRECTLY implemented
- withTenant(): CORRECT on all 5 DB operations

## CR Round 2 (NEW findings — 2C, 4H, 4L)

### Critical

- **C1: placeholderChecks Set deduplication** — extractPlaceholders() uses Set, loses duplicate count. Source `{0} of {1}, total {0}` → Set sees {"{0}","{1}"} only. False negative when repeated placeholders are missing from target.
- **C2: getLastNonWhitespace surrogate pair** — `trimmed[trimmed.length - 1]` returns lone surrogate for emoji/supplementary plane characters. Fix: use `[...trimmed]` spread.

### High

- **H1: normalizeNumber precision loss** — parseFloat + String() truncates 16+ digit numbers. Fix: return as-is for integers without separators.
- **H2: Thai numeral source normalization** — Only target text is normalized for Thai numerals. If source is Thai (TH→EN), Thai digits in source aren't extracted. Fix: add isThaiSource check.
- **H3: checkKeyTermConsistency O(G\*S)** — Nested loop over all glossary terms x all segments = potential slowdown at 500+ terms x 2000+ segments.
- **H4: Index not in Drizzle schema** — idx_findings_file_layer in Supabase migration but not Drizzle schema definition. Will cause issues on future db:generate.

### Low

- **L1: rule.reason no length limit** — Custom rule description unbounded, could be very long.
- **L2: End punctuation false positive for Thai** — Thai text doesn't use full stops; check fires incorrectly when source has `.` and Thai target has consonant ending.
- **L3: THAI_LANG_PREFIXES duplicated** — Same `['th']` array in numberChecks.ts and consistencyChecks.ts. Should be in constants.ts.
- **L4: stripThaiParticles no max iteration guard** — While loop could theoretically infinite loop if particles overlap in future.

## CR Round 3 (NEW findings — 2C, 5H, 4M, 3L)

### Critical

- **C1: NUMBER_REGEX captures hyphen as negative sign** — `[-+]?\d[\d.,]*\d|\d` without word boundary captures `-10` from `A-10` or `1-10`. False positives/negatives for hyphenated ranges.
- **C2: No stale findings cleanup on re-run** — `runRuleEngine` inserts findings without deleting old L1 findings for same fileId first. Re-parse → re-run = duplicate findings, MQM score inflation.

### High

- **H1: ReDoS protection incomplete** — MAX_CUSTOM_REGEX_LENGTH=500 doesn't prevent short catastrophic patterns like `(a+)+b` (8 chars). Need safe-regex2 or regex execution timeout.
- **H2: URL_REGEX case mismatch + missing parenthesis** — `/gi` flag on extraction but exact-match Set comparison. `HTTPS://EXAMPLE.COM` vs `https://example.com` = false positive. Also missing `(` in excluded chars.
- **H3: End punctuation floods EN→TH** — Thai doesn't use periods; every EN source ending with `.` flags every Thai target. Already noted in R2-L2 but **still unfixed**.
- **H4: Empty targets in checkSameSourceDiffTarget** — Not skipped, causing duplicate findings (completeness + consistency) for untranslated segments. checkSameTargetDiffSource has the skip, this function doesn't.
- **H5: Findings insert + status update not atomic** — Separate transaction for INSERT and bare UPDATE for status. If status UPDATE fails, findings exist but status = failed = inconsistent state.

### Medium

- **M1: PROPER_NOUN_RE too narrow** — `/^[A-Z][a-z]{1,28}$/` misses brand names with digits, hyphens, or mixed case (PlayStation5, Wi-Fi).
- **M2: Apostrophe false positive** — Single quote in QUOTE_CHARS flags `it's`, `don't` as unpaired quotes.
- **M3: Missing CJK quote brackets** — BRACKET_PAIRS lacks U+300E/300F (『』), U+2018/2019 (''), U+201C/201D ("").
- **M4: checkEndPunctuation ignores ctx** — `_ctx` prefix means language info unused, blocking language-aware punctuation skip.

### Low

- **L1: European number format ambiguity** — `1.000` matches European pattern → `1000`, but could be decimal `1.000` → `1`.
- **L2: Buddhist year no range validation** — |delta|=543 exempt even for non-year numbers (e.g., 500↔1043). Documented in tests.
- **L3: NUMBERS_ONLY_RE excludes +-% chars** — `-100`, `+100`, `99%` flagged as identical-to-source. Documented in tests.
