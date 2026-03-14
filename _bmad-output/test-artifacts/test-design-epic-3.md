---
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
lastSaved: '2026-03-14'
riskReviewDate: '2026-03-14'
---

# Test Design: Epic 3 - AI-Powered Quality Analysis

**Date:** 2026-03-14
**Author:** Mona (with Murat, TEA)
**Status:** Reviewed — 3 BLOCK risks mitigated (18 tests written 2026-03-14)
**Elicitation Methods:** Stakeholder Round Table, Chaos Monkey Scenarios, Failure Mode Analysis

---

## Executive Summary

**Scope:** Full test design for Epic 3 (Stories 3.0-3.5, sub-stories 3.2a/3.2b/3.2c)

**Risk Summary:**

- Total risks identified: 40
- BLOCK risks (=9): 3 — **ALL MITIGATED** (18 tests written 2026-03-14)
- High-priority risks (6-8): 13
- Critical categories: SEC, DATA, BUS, TECH

**Coverage Summary:**

- P0 scenarios: 11 areas (~44 tests, ~70-130 hours)
- P1 scenarios: 16 areas (~44 tests, ~40-65 hours)
- P2 scenarios: 13 areas (~30 tests, ~15-30 hours)
- P3 scenarios: 7 areas (~6 tests, ~2-3 hours)
- **Total new tests**: ~124 (~127-228 hours, ~16-29 days)
- **Existing tests**: 610 (82 files, 31K LOC) → **After: ~734 tests**

**Gate Status:** CONCERNS — 3 BLOCK risks mitigated (18 tests, 2026-03-14). 13 High risks remain with mitigation plans.

---

## Not in Scope

| Item | Reasoning | Mitigation |
|------|-----------|------------|
| **Review UX keyboard nav** | Epic 4 scope — currently in-progress | Covered by Epic 4 test design |
| **Undo/redo stack** | Epic 4 Story 4.3+ — not yet implemented | Guardrail #35 defines pattern |
| **Mobile gesture navigation** | Desktop-first tool, mobile is P2 epic | Keyboard hotkeys cover primary flow |
| **Load testing 100+ concurrent users** | NFR load testing deferred to Epic 6 | Basic NFR3/NFR4 thresholds tested |
| **Self-healing translation (FR81)** | Growth architecture, future epic | Architecture foundation exists |

---

## Risk Assessment

### BLOCK Risks (Score = 9) — 3 risks

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
|---------|----------|-------------|-------------|--------|-------|------------|-------|----------|
| R3-003 | SEC | AI prompt injection via segment text — craft SDLXLIFF with malicious target text manipulates L2/L3 output, could pass auto-pass | 3 | 3 | 9 | Adversarial segment fixture tests (6) + output sanitization verification | QA + Dev | Before Epic 4 gate |
| R3-005 | BUS | Auto-pass false approval — new lang pair uncalibrated threshold + stale score → bad file auto-approved | 3 | 3 | 9 | Boundary tests: threshold=score, file #49 vs #50, uncalibrated pair, score=0 | QA | Before Epic 4 gate |
| R3-006 | TECH | Multi-provider fallback x Inngest retry — primary rate-limited, exponential API calls (retries x fallbacks) → cost explosion | 3 | 3 | 9 | Integration test: verify total calls <= retries x chain length; no duplicate AI calls | Dev | Before Epic 4 gate |

### High-Priority Risks (Score 6-8) — 13 risks

| Risk ID | Category | Description | P | I | Score | Mitigation |
|---------|----------|-------------|---|---|-------|------------|
| R3-001 | DATA | Token budget bypass under concurrent batch — 10 files queued, all call AI before budget exhausts | 2 | 3 | 6 | Integration test: 5 files, exhaust after 2nd, verify 3rd-5th blocked |
| R3-002 | DATA | Score recalc race during rapid actions — Accept+Reject rapid fire → double calculation | 2 | 3 | 6 | Test 3 finding.changed events within 100ms, verify Inngest serial queue |
| R3-004 | PERF | L2 NFR3 violation (>30s/100 segments) — API latency spike | 2 | 3 | 6 | Performance benchmark (existing perf test) + CI gate |
| R3-013 | BUS | Cost estimation variance >20% visible to customer — erodes trust | 2 | 3 | 6 | Budget estimation accuracy test with known token counts |
| R3-019 | BUS | Score "jump scare" — L1→L2 score drops without transition warning | 2 | 3 | 6 | Test score transition "recalculating" state visibility |
| R3-020 | BUS | No pre-flight budget check for batch — 50-file batch exhausts at file 30 | 2 | 3 | 6 | Pre-flight estimation test: total batch cost vs remaining budget |
| R3-021 | TECH | Inngest step ID collision on retry-after-crash — step skip = silent finding loss | 2 | 3 | 6 | Test retry scenario: verify step IDs unique across retries |
| R3-025 | DATA | Garbage JSON = entire chunk lost — 1 bad finding rejects all valid findings in same chunk | 2 | 3 | 6 | Per-finding safeParse: skip invalid, keep valid |
| R3-029 | DATA | Chunk split breaks multi-byte char — Thai sara am / CJK at 30K boundary | 2 | 3 | 6 | Test chunkSegments with Thai/CJK at exact boundary |
| R3-030 | DATA | Duplicate findings on re-run — retry without DELETE old L2 → double penalty | 2 | 3 | 6 | Test retryFailedLayers: verify DELETE old L2 before re-run |
| R3-031 | BUS | Penalty weight = 0 bypasses scoring — Major=0 → auto-pass with Major findings | 2 | 3 | 6 | Boundary test: weight=0 for each severity |
| R3-032 | OPS | Rate limiter service down — Upstash unavailable, fail-open allows unlimited AI calls | 2 | 3 | 6 | Test rate limiter unavailable → fail-closed |
| R3-033 | TECH | Batch payload > 512KB — 50 files + metadata exceeds Inngest limit | 2 | 3 | 6 | Boundary test: 50 files payload size vs 512KB limit |

### Medium-Priority Risks (Score 3-4) — 18 risks

| Risk ID | Category | Description | P | I | Score |
|---------|----------|-------------|---|---|-------|
| R3-007 | BUS | False positive fatigue from low-confidence AI findings | 2 | 2 | 4 |
| R3-008 | DATA | Cross-layer dedup miss (L2+L3 same issue = 2 findings) | 2 | 2 | 4 |
| R3-009 | TECH | Glossary context loading timeout → prompt without glossary | 2 | 2 | 4 |
| R3-010 | OPS | Model pinning version deprecation without admin notice | 2 | 2 | 4 |
| R3-011 | TECH | L3 failure recovery untested E2E | 2 | 2 | 4 |
| R3-012 | PERF | Very large file (1000+ segments) resilience | 1 | 3 | 3 |
| R3-014 | DATA | Partial results score status inconsistency | 2 | 2 | 4 |
| R3-022 | TECH | AI mock drift from real API → green test + prod bug | 2 | 2 | 4 |
| R3-023 | BUS | Confidence badge lacks distinct icon shape (a11y Guardrail #25) | 2 | 2 | 4 |
| R3-024 | TECH | Zod schema drift if provider changes null/undefined behavior | 2 | 2 | 4 |
| R3-026 | OPS | Orphan "processing" files — Inngest never resumes, no cleanup job | 2 | 2 | 4 |
| R3-027 | DATA | Optimistic vs Realtime conflict — concurrent reviewers see stale state | 2 | 2 | 4 |
| R3-034 | BUS | Provider returns empty findings (lazy response) — file looks clean but isn't | 2 | 2 | 4 |
| R3-035 | TECH | 500+ L1 findings → prompt context overflow, truncated silently | 2 | 2 | 4 |
| R3-037 | BUS | Filter not reset on file switch → empty finding list shown | 2 | 2 | 4 |
| R3-038 | TECH | Concurrency key mismatch (score vs process functions) | 2 | 2 | 4 |
| R3-039 | BUS | ScoreBadge shows NaN for null score before first calculation | 2 | 2 | 4 |

### Low-Priority Risks (Score 1-2) — 6 risks

| Risk ID | Category | Description | P | I | Score | Action |
|---------|----------|-------------|---|---|-------|--------|
| R3-015 | OPS | AI provider total outage (all fallbacks fail) | 1 | 2 | 2 | Monitor |
| R3-016 | OPS | Budget alert threshold 0%/100% edge cases | 1 | 1 | 1 | Monitor |
| R3-017 | BUS | Multi-tab review sync (undo/history not synced) | 1 | 1 | 1 | Document |
| R3-018 | BUS | Mobile gesture navigation missing | 1 | 1 | 1 | Document |
| R3-028 | TECH | Realtime reconnect + polling overlap → brief duplicate findings | 1 | 2 | 2 | Monitor |
| R3-036 | BUS | L3 anchoring bias — always confirms L2 | 1 | 2 | 2 | Monitor |

### Risk Category Legend

- **TECH**: Technical/Architecture (integration, infrastructure, race conditions)
- **SEC**: Security (prompt injection, data exposure)
- **PERF**: Performance (SLA violations, latency)
- **DATA**: Data Integrity (loss, corruption, inconsistency, score drift)
- **BUS**: Business Impact (UX harm, trust loss, false approvals)
- **OPS**: Operations (deployment, monitoring, service availability)

---

## Entry Criteria

- [ ] Epic 3 stories (3.0-3.5) fully implemented and merged
- [ ] AI provider API keys configured in test environment
- [ ] Inngest Dev Server accessible
- [ ] Supabase local instance running with migrations applied
- [ ] Test data factories updated for AI-specific fixtures (adversarial segments)
- [ ] `language_pair_configs` seeded with test thresholds

## Exit Criteria

- [ ] All P0 tests passing (100%)
- [ ] All P1 tests passing (>=95%)
- [ ] No open BLOCK risks (R3-003, R3-005, R3-006)
- [ ] All 13 high-priority risks have mitigation plan + owner
- [ ] Prompt injection adversarial tests passing
- [ ] NFR3 (L2 <30s/100 segments) benchmark met
- [ ] NFR4 (L3 <2min/flagged segments) benchmark met

---

## Test Coverage Plan

> **Note:** P0/P1/P2/P3 = priority classification based on risk, NOT execution timing. See Execution Strategy for when tests run.

### P0 (Critical)

**Criteria**: Blocks core AI pipeline + High risk (>=6) + No workaround

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---------|-------------|-----------|-----------|-------|
| P0-01 | Prompt injection adversarial segments — jailbreak, SQL injection, system prompt override in target text | Unit | R3-003 | 6 tests, adversarial fixture file |
| P0-02 | Auto-pass boundary: threshold=score, threshold-0.01, threshold+0.01 | Unit | R3-005 | 4 tests, enhance existing autoPassChecker |
| P0-03 | Auto-pass new lang pair: file #49 (blocked) vs #50 (first eligible) | Unit | R3-005 | 3 tests, enhance story35 tests |
| P0-04 | Fallback chain x Inngest retry: total AI calls <= retries x chain length | Integration | R3-006 | 5 tests, new integration file |
| P0-05 | Budget per-file concurrent batch: exhaust after file 2, files 3-5 blocked | Integration | R3-001 | 4 tests, new integration file |
| P0-06 | Chunk split multi-byte: Thai sara am (U+0E33), CJK surrogate at 30K | Unit | R3-029 | 5 tests, enhance chunkSegments |
| P0-07 | Duplicate findings on retry: DELETE old L2 before re-run | Unit | R3-030 | 4 tests, enhance retryFailedLayers |
| P0-08 | Penalty weight=0 for each severity: score reflects finding count | Unit | R3-031 | 4 tests, enhance mqmCalculator |
| P0-09 | Per-finding safeParse: 1 bad finding in chunk, valid preserved | Unit | R3-025 | 4 tests, new in runL2ForFile |
| P0-10 | Score recalc race: 3 finding.changed events/100ms → 1 final score | Integration | R3-002 | 3 tests, new integration file |
| P0-11 | E2E pipeline→score→UI: real L2 → score badge updates on review | E2E | R3-019 | 2 tests, enhance score-lifecycle.spec |

**Total P0**: 11 areas, ~44 tests

### P1 (High)

**Criteria**: Important AI features + Medium/high risk + Common workflows

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---------|-------------|-----------|-----------|-------|
| P1-01 | L2 NFR3: 100 segments < 30s perf benchmark | Perf | R3-004 | 2 tests, EXISTS |
| P1-02 | Cost estimation accuracy: known tokens → variance <= 20% | Unit | R3-013 | 4 tests |
| P1-03 | Pre-flight batch budget: 50 files estimated cost vs budget | Unit | R3-020 | 3 tests |
| P1-04 | Inngest step ID unique across retries (crash→resume) | Unit | R3-021 | 3 tests |
| P1-05 | Batch payload 50 files < 512KB Inngest limit | Unit | R3-033 | 3 tests |
| P1-06 | Rate limiter unavailable → fail-closed (not fail-open) | Unit | R3-032 | 3 tests |
| P1-07 | Score L1→L2 transition shows "recalculating" badge | Component | R3-019 | 3 tests, ENHANCE |
| P1-08 | 500+ L1 findings → prompt context truncated gracefully | Unit | R3-035 | 3 tests |
| P1-09 | Filter reset on file navigation (severity filter clears) | Component | R3-037 | 3 tests |
| P1-10 | Chunk N fails, chunks N+1...M continue processing | Unit | Chaos #1 | 3 tests |
| P1-11 | Realtime reconnect: stop polling after channel recovers | Unit | Chaos #2 | 3 tests |
| P1-12 | Concurrency key consistency: score + process functions | Unit | R3-038 | 2 tests |
| P1-13 | ScoreBadge null score → spinner (not NaN) | Component | R3-039 | 2 tests |
| P1-14 | Empty findings suspicious-zero telemetry alert | Unit | R3-034 | 2 tests |
| P1-15 | E2E L3 failure → partial score + warning badge | E2E | R3-011 | 2 tests |
| P1-16 | previous_state mismatch → conflict error returned | Unit | Chaos #9 | 3 tests |

**Total P1**: 16 areas, ~44 tests

### P2 (Medium)

**Criteria**: Secondary flows + Low/medium risk + Edge cases

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---------|-------------|-----------|-----------|-------|
| P2-01 | Cross-layer dedup: L2+L3 same segment same category | Unit | R3-008 | 4 tests |
| P2-02 | Glossary context loading timeout → prompt without glossary | Unit | R3-009 | 2 tests |
| P2-03 | AI mock vs real API contract snapshot validation | Unit | R3-022 | 3 tests |
| P2-04 | Confidence badge distinct icon shape per a11y | Component | R3-023 | 3 tests |
| P2-05 | Zod schema null vs undefined per provider behavior | Unit | R3-024 | 3 tests |
| P2-06 | Orphan "processing" file detection query | Unit | R3-026 | 2 tests |
| P2-07 | Optimistic vs Realtime conflict on concurrent action | Component | R3-027 | 3 tests |
| P2-08 | Poll/Realtime overlap dedup (no duplicate findings) | Unit | Chaos #3 | 2 tests |
| P2-09 | E2E budget exhausted mid-pipeline UX toast | E2E | Chaos #4 | 1 test |
| P2-10 | Model pinning deprecation → fallback notification | Unit | R3-010 | 2 tests, EXISTS |
| P2-11 | 1000+ segment file through pipeline (perf) | Perf | R3-012 | 1 test |
| P2-12 | Partial results score status consistency | Unit | R3-014 | 2 tests, ENHANCE |
| P2-13 | L3 anchoring bias: verify disagrees on >=1 golden segment | Unit | R3-036 | 2 tests |

**Total P2**: 13 areas, ~30 tests

### P3 (Low)

**Criteria**: Nice-to-have + Exploratory + Benchmarks

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---------|-------------|-----------|-----------|-------|
| P3-01 | Provider total outage: all fallbacks → partial | Unit | R3-015 | EXISTS |
| P3-02 | Budget alert 0%/100% edge cases | Unit | R3-016 | EXISTS |
| P3-03 | Budget config change during active pipeline | Unit | FMA | 1 test |
| P3-04 | Token count MAX_SAFE_INTEGER boundary | Unit | FM-AI-2 | 1 test |
| P3-05 | Health check false positive (OK but broken) | Unit | FM-AI-3 | 1 test |
| P3-06 | Confidence tooltip long language pair name | Component | FM-UI-2 | 1 test |
| P3-07 | Multi-tab review sync | — | R3-017 | Document only |

**Total P3**: 7 areas, ~6 tests

---

## Execution Strategy

| Trigger | Suite | Time Budget |
|---------|-------|-------------|
| **Every PR** | P0 + P1 unit/component (mocked AI) | < 5 min |
| **PR to main** | P0 + P1 full including E2E | < 15 min |
| **Nightly** | P0 + P1 + P2 (perf benchmarks, contract snapshots) | < 30 min |
| **Weekly** | Full regression P0-P3 | < 45 min |
| **On AI schema change** | P0-01 to P0-09 + P2-03 (adversarial + contract) | < 10 min |

Philosophy: Run everything in PRs if < 15 min with Vitest parallelization. Defer only expensive perf/chaos tests to nightly/weekly.

---

## Resource Estimates

| Priority | New Tests | Total Hours | Notes |
|----------|-----------|-------------|-------|
| P0 | ~34 new + 10 enhance | ~70-130 hrs | Complex: adversarial fixtures, integration tests, E2E |
| P1 | ~38 new + 6 enhance | ~40-65 hrs | Standard: unit + component, some perf |
| P2 | ~24 new + 6 enhance | ~15-30 hrs | Simple: unit, snapshot, a11y checks |
| P3 | ~6 new | ~2-3 hrs | Quick: boundary, edge cases |
| **Total** | **~124 new tests** | **~127-228 hrs (~16-29 days)** | Existing: 610 → After: ~734 |

### Prerequisites

**Test Data:**
- Adversarial segment fixtures (prompt injection, jailbreak, SQL injection payloads)
- Large segment files (1000+ segments, Thai/CJK heavy)
- Language pair config fixtures (calibrated + uncalibrated pairs)
- Budget scenario fixtures (near-limit, zero, unlimited)

**Tooling:**
- Vitest (unit/component, workspace: jsdom + node)
- Playwright (E2E, 27+ existing specs)
- Inngest Dev Server (pipeline integration)
- Supabase local (Realtime, RLS)

**Environment:**
- Node.js 18+ with full ICU (Thai/CJK segmentation)
- Docker Desktop (Supabase local)
- AI API keys (OpenAI, Anthropic) for E2E smoke

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate**: 100% (no exceptions)
- **P1 pass rate**: >= 95% (waivers required for failures)
- **P2/P3 pass rate**: >= 90% (informational)
- **BLOCK risk mitigations**: 100% complete (R3-003, R3-005, R3-006)
- **High-risk mitigations**: 100% with plan + owner assigned

### Coverage Targets

- **Critical paths** (AI pipeline end-to-end): >= 80%
- **Security scenarios** (prompt injection, tenant isolation): 100%
- **Business logic** (scoring, auto-pass, confidence): >= 80%
- **Resilience** (fallback, retry, partial results): >= 70%

### Non-Negotiable Requirements

- [ ] All P0 tests pass
- [ ] No BLOCK risk (score=9) unmitigated
- [ ] Prompt injection adversarial tests pass (R3-003)
- [ ] Auto-pass boundary tests pass (R3-005)
- [ ] Fallback chain integration test pass (R3-006)
- [ ] Performance NFR3/NFR4 benchmarks met

---

## Mitigation Plans

### R3-003: AI Prompt Injection (Score: 9)

**Mitigation Strategy:**
1. Create adversarial segment fixture file with 6+ attack vectors (jailbreak, system prompt override, SQL injection, ignore-instructions)
2. Add unit tests verifying L2/L3 structured output is NOT manipulated by malicious segment text
3. Verify Zod schema rejects any output that doesn't match expected structure
4. Test auto-pass criteria with adversarial findings (should NOT auto-pass)

**Owner:** QA + Dev
**Timeline:** Before Epic 4 gate
**Status:** Planned
**Verification:** All 6 adversarial tests pass, no output manipulation detected

### R3-005: Auto-pass False Approval (Score: 9)

**Mitigation Strategy:**
1. Add boundary tests: score exactly at threshold, score=threshold-0.01, score=threshold+0.01
2. Test file #49 (blocked) vs file #50 (first eligible) for new language pairs
3. Test uncalibrated pair uses conservative default (not permissive)
4. Test score=0 edge case

**Owner:** QA
**Timeline:** Before Epic 4 gate
**Status:** Planned
**Verification:** All boundary tests pass, no false auto-pass possible

### R3-006: Fallback x Retry Cost Explosion (Score: 9)

**Mitigation Strategy:**
1. Integration test: simulate primary rate-limited, count total API calls across Inngest retries
2. Verify total calls <= (max_retries x fallback_chain_length)
3. Verify no duplicate AI calls for same chunk across retries
4. Test cost tracking accurately reflects fallback usage

**Owner:** Dev
**Timeline:** Before Epic 4 gate
**Status:** Planned
**Verification:** Integration test passes, total API calls within expected bounds

---

## Assumptions and Dependencies

### Assumptions

1. AI provider APIs (OpenAI, Anthropic) remain available with current pricing model
2. Inngest durable functions resume correctly after server restart (per Inngest documentation)
3. Supabase Realtime subscription reconnects within 30 seconds of channel error
4. gpt-4o-mini structured output behavior remains consistent with current Zod schema

### Dependencies

1. Epic 3 stories fully merged — Required: now (done)
2. Adversarial segment fixture file — Required: before P0 test writing
3. AI API keys in test environment — Required: for E2E smoke tests
4. Inngest Dev Server v3+ — Required: for pipeline integration tests

### Risks to Plan

- **Risk**: AI provider changes structured output format
  - **Impact**: All L2/L3 schema tests fail, pipeline breaks
  - **Contingency**: AI mock contract snapshot (P2-03) catches drift early; Zod schema versioning

- **Risk**: Inngest pricing changes affect test budget
  - **Impact**: Integration tests become expensive to run frequently
  - **Contingency**: Mock Inngest in unit tests, real Inngest only in nightly E2E

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
|-------------------|--------|-----------------|
| **Inngest pipeline (Epic 2)** | L2/L3 extends existing L1 pipeline | processFile, processBatch tests must still pass |
| **MQM Calculator (Epic 2)** | AI findings feed into score calculation | mqmCalculator, scoreFile tests must still pass |
| **Review UI (Epic 4)** | Score subscription, finding display | ReviewPageClient, FindingList tests must still pass |
| **Supabase Realtime** | Finding + score push notifications | use-findings-subscription, use-score-subscription must still pass |
| **Upstash Rate Limiting** | AI call throttling | Budget + rate limit tests in lib/ai/ |

---

## Follow-on Workflows (Manual)

- Run `*atdd` to generate failing P0 tests (separate workflow; not auto-run).
- Run `*automate` for broader coverage once implementation exists.

---

## Appendix

### Knowledge Base References

- `risk-governance.md` - Risk classification framework (P x I scoring, gate decisions)
- `probability-impact.md` - Risk scoring methodology (1-9 scale, DOCUMENT/MONITOR/MITIGATE/BLOCK)
- `test-levels-framework.md` - Test level selection (unit > integration > E2E)
- `test-priorities-matrix.md` - P0-P3 prioritization (risk-score driven)

### Elicitation History

| Round | Method | New Risks | Score Adjustments |
|-------|--------|-----------|-------------------|
| 1 | Stakeholder Round Table (Sally, John, Amelia, Murat) | +6 (R3-019 to R3-024) | 4 scores increased |
| 2 | Chaos Monkey Scenarios (6 scenarios) | +4 (R3-025 to R3-028) | — |
| 3 | Failure Mode Analysis (8 components, 30+ modes) | +12 (R3-029 to R3-039, R3-036) | — |

### Related Documents

- PRD: `_bmad-output/planning-artifacts/prd.md`
- Epic 3: `_bmad-output/planning-artifacts/epics/epic-3-ai-powered-quality-analysis.md`
- Architecture: `_bmad-output/planning-artifacts/architecture/index.md`
- Epic 2 Test Design: `_bmad-output/test-artifacts/test-design-epic-2.md`
- AI SDK Spike Guide: `_bmad-output/planning-artifacts/research/ai-sdk-spike-guide-2026-02-26.md`

---

**Generated by**: BMad TEA Agent - Test Architect Module
**Workflow**: `_bmad/tea/testarch/test-design`
**Version**: 5.0 (Step-File Architecture)
