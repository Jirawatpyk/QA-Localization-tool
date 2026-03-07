---
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan']
lastStep: 'step-04-coverage-plan'
lastSaved: '2026-03-07'
---

# Step 1: Mode Detection

- **Mode**: Epic-Level
- **Epic**: 2 — File Processing & QA Engine
- **Status**: Epic 2 is DONE (Stories 2.1-2.10, 1,513+ tests)
- **Prerequisites**: All met (epic docs, architecture, stories with ACs)

# Step 2: Loaded Context

## Configuration
- tea_use_playwright_utils: true
- tea_browser_automation: auto
- test_framework: playwright
- test_artifacts: _bmad-output/test-artifacts

## Project Artifacts
- Epic 2 doc: 10 stories (2.1-2.10)
- FRs: FR1-FR8, FR11-FR15, FR19, FR21, FR37, FR62
- NFRs: NFR1, NFR2, NFR7, NFR8, NFR10, NFR16

## Existing Test Coverage
- Unit tests: ~90+ files
- Component tests: ~40+ files
- E2E specs: 17 files
- RLS tests: 6 files

## Knowledge Fragments
- risk-governance.md
- probability-impact.md
- test-levels-framework.md
- test-priorities-matrix.md

## Pre-mortem Analysis (Elicitation)

| # | Failure Scenario | Score | Action |
|---|-----------------|-------|--------|
| F1 | Parser silent data loss (nested tags stripped silently) | 6 | MITIGATE |
| F2 | Thai/CJK word count drift (ICU version mismatch) | 6 | MITIGATE |
| F3 | Pipeline race condition (duplicate findings on re-upload) | 4 | MONITOR |
| F4 | Excel column swap (wrong source/target mapping) | 4 | MONITOR |
| F5 | Tenant data leak via parity report (missing withTenant) | 3 | DOCUMENT |
| F6 | Rule engine false negative (placeholder format gap) | 6 | MITIGATE |

### Key Tests Identified from Pre-mortem
- Nested tag boundary test (1, 3, 5, 10 levels) + round-trip integrity
- Cross-Node segmenter consistency + score boundary at threshold +/-1
- Concurrent pipeline idempotency (same file, 2 triggers)
- Swapped column mapping direction verification
- RLS cross-tenant parity report isolation
- Extended placeholder format coverage (30+ formats) + parity regression

## Failure Mode Analysis (Elicitation)

### Component Failure Modes (33 total across 7 components)

**File Upload & Storage (Story 2.1):** 6 modes — file size bypass, SHA-256 collision, path traversal, concurrent upload race, interrupted upload cleanup, batch record atomicity
**SDLXLIFF/XLIFF Parser (Story 2.2):** 6 modes — XXE injection, unknown namespace, empty target, encoding mismatch, tag ID collision, massive segment count
**Excel Parser (Story 2.3):** 5 modes — merged cells, formula cells, hidden rows, multi-sheet, large row count
**Rule Engine (Story 2.4):** 6 modes — ReDoS backtracking, glossary false positive, number locale, cross-file false alarm, custom rule config corruption, Thai particle
**MQM Score Calculator (Story 2.5):** 5 modes — division by zero, score overflow, rejected finding counted, layer status mismatch, auto-pass threshold wrong language
**Inngest Pipeline (Story 2.6):** 5 modes — step ID collision, retry exhaustion, concurrency key bypass, payload size limit, realtime push failure
**Batch Summary & Parity (Story 2.7):** 3 modes — sort instability, parity segment off-by-one, missing check without tenant

### Coverage Gaps Identified

| Priority | ID | Gap | Component | Test Level |
|---|---|---|---|---|
| P0 | FM-2.1 | XXE prevention | Parser | Unit |
| P0 | FM-4.1 | ReDoS protection | Rule Engine | Unit |
| P0 | FM-6.4 | Large payload handling (512KB limit) | Pipeline | Integration |
| P1 | FM-1.4 | Concurrent upload race condition | Upload | E2E |
| P1 | FM-2.3 | Empty target segment handling | Parser | Unit |
| P1 | FM-2.4 | Encoding detection (UTF-16 as UTF-8) | Parser | Unit |
| P1 | FM-3.1 | Merged cells in Excel | Excel Parser | Unit |
| P1 | FM-3.2 | Formula vs value resolution | Excel Parser | Unit |
| P1 | FM-5.4 | Layer status consistency check | Scoring | Unit |
| P1 | FM-6.3 | Cross-project concurrency isolation | Pipeline | Integration |
| P2 | FM-3.5 | Large row count (65K+) | Excel Parser | Unit/Perf |

## Red Team vs Blue Team Analysis (Elicitation)

### Attack Surface Summary (20 attacks tested across 5 categories)

| Category | Attacks | Defended | Gaps | Critical |
|----------|---------|----------|------|----------|
| File Upload | 4 | 2 | 2 | 1 (zip bomb xlsx) |
| Parser Injection | 4 | 1 | 3 | 2 (XXE, Billion Laughs) |
| Tenant Isolation | 4 | 2 | 2 | 1 (parity RLS) |
| Data Integrity | 4 | 2 | 2 | 0 |
| Denial of Service | 4 | 0 | 4 | 0 |
| **Total** | **20** | **7** | **13** | **4** |

### Critical Hardening Actions (ordered by severity)

1. **CRITICAL** Audit fast-xml-parser config: processEntities, entity expansion limit (XXE + Billion Laughs)
2. **CRITICAL** Add decompressed size guard for xlsx files (zip bomb prevention)
3. **CRITICAL** Add RLS tests for parity_reports + missing_check_reports tables
4. **MAJOR** Add MIME type / magic bytes validation on upload
5. **MAJOR** Add ReDoS test suite for all tag/placeholder regex patterns
6. **MAJOR** Verify segment immutability (no update action exposed)
7. **MAJOR** Add per-project storage quota + glossary term count limit
8. **MAJOR** Verify glossary query tenant filter before match
9. **MAJOR** Verify pipeline rerun idempotency guard
10. **MINOR** Verify server-side timestamp enforcement on uploaded_at
11. **MINOR** Add rate limit on missing check report submissions

### Security Test Gaps (new, not in FMA)

| Priority | ID | Gap | Category |
|---|---|---|---|
| P0 | RT-1 | fast-xml-parser XXE/Billion Laughs config audit | Parser Injection |
| P0 | RT-2 | xlsx decompressed size guard | File Upload |
| P0 | RT-3 | RLS for parity_reports + missing_check_reports | Tenant Isolation |
| P1 | RT-4 | MIME type / magic bytes validation | File Upload |
| P1 | RT-5 | ReDoS test suite for regex patterns | Parser Injection |
| P1 | RT-6 | Segment immutability verification | Data Integrity |
| P1 | RT-7 | Per-project storage quota | Denial of Service |
| P1 | RT-8 | Glossary term count limit | Denial of Service |
| P1 | RT-9 | Glossary query tenant filter audit | Tenant Isolation |
| P2 | RT-10 | Pipeline rerun idempotency | Data Integrity |
| P3 | RT-11 | Missing check report rate limit | Denial of Service |

## Stakeholder Round Table (Elicitation)

### Perspectives

- **Sally (UX):** Trust via parity, false positive fatigue (Thai/glossary), score visual cues, Excel non-English headers
- **John (PM):** Parity = table stakes, Thai/CJK = differentiator, batch 50-file enterprise readiness, score determinism
- **Amelia (Dev):** Parser malformed input, Inngest step ID uniqueness, transaction rollback, ExcelJS type pinning, Realtime reconnect
- **Murat (TEA):** Trust Pyramid — unit (logic trust) > integration (infra trust) > E2E (user trust)

### Consensus Priority Ranking

| Rank | Test Area | Consensus | Rationale |
|------|-----------|-----------|-----------|
| 1 | Xbench parity golden corpus regression | P0 | All stakeholders agree — table stakes for adoption |
| 2 | Parser malformed input suite (15+ cases) | P0 | Dev: most complex module, fragile to edge cases |
| 3 | Thai/CJK segmenter comprehensive (50+ cases) | P0 | UX + PM: differentiator + trust-critical |
| 4 | Security: XXE + ReDoS prevention | P0 | Dev + TEA: critical vulnerability, silent failure |
| 5 | Score determinism + boundary tests | P0 | UX + PM: score drift = trust loss |
| 6 | Pipeline idempotency + step ID uniqueness | P1 | Dev: silent bug, hard to debug in production |
| 7 | E2E upload-parse-L1-score flow | P1 | UX: end-to-end trust, catches integration gaps |
| 8 | Batch 50-file throughput benchmark | P1 | PM: enterprise readiness (beyond NFR7 10-file) |
| 9 | False positive rate (Thai particle + glossary) | P1 | UX: false positive fatigue = adoption killer |
| 10 | Transaction rollback on partial failure | P1 | Dev: data integrity, hard to catch without test |
| 11 | Realtime disconnect/reconnect | P2 | Dev: edge case but affects UX during processing |
| 12 | Excel non-English header auto-detect | P2 | UX: real-world Thai/Chinese headers |
| 13 | Onboarding tour lifecycle | P2 | PM: churn prevention, but not core QA flow |
| 14 | ScoreBadge visual threshold colors | P2 | UX: visual trust cue, component-level test |

### Key Disagreement Resolution
- **Unit vs E2E debate:** Both needed — unit catches logic bugs faster, E2E catches integration gaps. Unit first, E2E for critical flows only
- **10-file vs 50-file batch:** Test 10 per NFR7 (P1), benchmark 50 as P2 perf test
- **All agreed:** Xbench parity + Thai/CJK + parser security = non-negotiable P0

# Step 3: Risk Assessment

## Risk Matrix (20 risks identified)

### High-Priority Risks (Score >= 6) — 8 risks

| Risk ID | Cat | Description | P | I | Score | Mitigation |
|---------|-----|-------------|---|---|-------|------------|
| R-001 | SEC | XXE/Billion Laughs via fast-xml-parser config | 2 | 3 | 6 | Audit processEntities, entity expansion test |
| R-002 | SEC | ReDoS in tag/placeholder regex | 2 | 3 | 6 | ReDoS test suite, regex review |
| R-003 | DATA | Parser silent data loss (nested tags 5+) | 2 | 3 | 6 | Round-trip integrity test, tag count assertion |
| R-004 | BUS | Xbench parity regression on rule change | 2 | 3 | 6 | Golden corpus regression on every PR |
| R-005 | DATA | Thai/CJK word count drift (ICU version) | 2 | 3 | 6 | Pin Node version, golden corpus segmenter test |
| R-006 | BUS | Placeholder format gap (new formats missed) | 2 | 3 | 6 | Extend to 30+ formats, parity test |
| R-007 | SEC | xlsx zip bomb (unlimited decompressed size) | 2 | 3 | 6 | Decompressed size guard in ExcelJS |
| R-008 | SEC | Parity report tenant leak (RLS not verified) | 1 | 3 | 6* | RLS test for parity_reports table |

### Medium-Priority Risks (Score 3-4) — 8 risks

| Risk ID | Cat | Description | P | I | Score |
|---------|-----|-------------|---|---|-------|
| R-009 | TECH | Pipeline race condition (duplicate findings) | 2 | 2 | 4 |
| R-010 | BUS | Excel column swap (wrong direction) | 2 | 2 | 4 |
| R-011 | TECH | Inngest step ID collision (silent skip) | 2 | 2 | 4 |
| R-012 | TECH | Transaction atomicity (DELETE+INSERT) | 2 | 2 | 4 |
| R-013 | PERF | Inngest payload > 512KB rejected | 2 | 2 | 4 |
| R-014 | SEC | MIME type bypass (extension-only) | 2 | 2 | 4 |
| R-015 | BUS | Score determinism failure | 1 | 3 | 3 |
| R-016 | BUS | False positive fatigue (Thai/glossary) | 2 | 2 | 4 |

### Low-Priority Risks (Score 1-2) — 4 risks

R-017 (OPS, 2), R-018 (OPS, 2), R-019 (BUS, 1), R-020 (OPS, 1)

## Risk Summary
- High (>=6): 8 — SEC (4), DATA (2), BUS (2)
- Medium (3-4): 8 — TECH (4), BUS (2), PERF (1), SEC (1)
- Low (1-2): 4 — OPS (3), BUS (1)
- Gate status: CONCERNS (8 risks >= 6 need mitigation before PASS)

# Step 4: Coverage Plan & Execution Strategy

## Coverage Matrix Summary

### P0 (Critical) — 10 test areas, ~64 tests
- Xbench parity golden corpus regression (3)
- XXE/Billion Laughs prevention (4)
- ReDoS protection for all regex (8)
- Parser inline tag integrity — nested 1/3/5/10 + round-trip (6)
- Thai/CJK Intl.Segmenter accuracy — 50+ edge cases (12)
- MQM score correctness — determinism, boundary, clamp (8)
- Placeholder format coverage — 30+ formats (10)
- xlsx decompressed size guard (3)
- RLS tenant isolation — existing 6 + parity + missing_check (8)
- E2E upload-parse-L1-score flow (2)

### P1 (High) — 15 test areas, ~69 tests
- Parser malformed input suite (15)
- Pipeline idempotency (4), step ID uniqueness (3)
- Transaction rollback on re-parse (4)
- Excel merged cells + formulas + multi-sheet (6)
- MIME type / magic bytes validation (5)
- Thai particle negative tests (6)
- Batch throughput NFR7 10 files (2)
- Score recalculation on status change (4)
- File size guard 15MB boundary (4)
- Duplicate detection SHA-256 (3)
- Number check locale awareness (6)
- Cross-file consistency (4)
- E2E review + accept/reject (2), E2E parity comparison (1)

### P2 (Medium) — 10 test areas, ~26 tests
- Excel large row count, batch 50-file, Realtime disconnect, non-English headers
- Onboarding tour lifecycle, ScoreBadge thresholds, batch sort determinism
- Pipeline rerun idempotency, Inngest payload boundary, file history filter

### P3 (Low) — 5 test areas, ~9 tests
- Segment immutability, timestamp enforcement, rate limit, storage quota, glossary limit

## Execution Strategy

| Trigger | Suite | Time Budget |
|---------|-------|-------------|
| Every PR | P0 + P1 unit/component | < 5 min |
| PR to main | P0 + P1 full (incl. E2E + RLS) | < 15 min |
| Nightly | P0 + P1 + P2 | < 30 min |
| Weekly | Full regression P0-P3 | < 45 min |
| On rule engine change | Golden corpus parity | < 10 min |

## Resource Estimates

| Priority | Tests | Total Hours |
|----------|-------|-------------|
| P0 | ~64 | 96-128 hrs |
| P1 | ~69 | 52-69 hrs |
| P2 | ~26 | 13-20 hrs |
| P3 | ~9 | 2-5 hrs |
| **Total** | **~168** | **163-222 hrs (~20-28 days)** |

## Quality Gates

- P0 pass rate: 100% (merge blocked)
- P1 pass rate: >= 95% (waivers require owner + deadline)
- P2/P3 pass rate: >= 90% (informational)
- High-risk mitigations R-001 to R-008: 100% complete
- Security tests (SEC): 100% pass
- Parity regression: 100% match (0 Xbench-only gaps)
- Critical path coverage: >= 80%
- Business logic coverage: >= 70%
