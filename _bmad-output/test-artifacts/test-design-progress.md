---
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
lastSaved: '2026-03-14'
---

# Step 1: Mode Detection

- **Mode**: Epic-Level
- **Epic**: 3 — AI-Powered Quality Analysis
- **Stories in scope**: 3.0, 3.1, 3.2a, 3.2b, 3.2c, 3.3, 3.4, 3.5
- **FRs covered**: FR9, FR10, FR16-18, FR20, FR22-23, FR36, FR63, FR71-72
- **NFRs addressed**: NFR3, NFR4, NFR16, NFR18, NFR36
- **Prerequisites**: All met (Epic 3 doc + ACs + Architecture context)

# Step 2: Loaded Context

## Configuration
- tea_use_playwright_utils: true
- tea_browser_automation: auto
- test_framework: playwright
- test_artifacts: _bmad-output/test-artifacts

## Existing Test Coverage
| Area | Files | Key Components |
|------|-------|----------------|
| Pipeline | 56 | L1/L2/L3 helpers, prompts, schemas, Inngest functions, engine checks |
| Scoring | 8 | MQM calculator, auto-pass, score lifecycle |
| Review | 21 | Store, actions (accept/reject/flag), hooks, utils, subscriptions |
| AI lib | 8 | Budget, providers, costs, client, errors, models, fallback |
| E2E | 27 | Review, pipeline, score lifecycle, budget, parity, resilience |

## Knowledge Fragments
- risk-governance.md, probability-impact.md, test-levels-framework.md, test-priorities-matrix.md

# Step 3: Risk Assessment (post-elicitation)

## Elicitation: Stakeholder Round Table
- Sally (UX), John (PM), Amelia (Dev), Murat (TEA)
- Added 6 new risks, adjusted 4 scores
- Gate status changed: CONCERNS → FAIL (3 BLOCK risks)

## BLOCK Risks (Score = 9) — 3 risks

| Risk ID | Cat | Description | P | I | Score | Mitigation |
|---------|-----|-------------|---|---|-------|------------|
| R3-003 | SEC | AI prompt injection via segment text — craft SDLXLIFF with malicious target text manipulates L2/L3 output, could pass auto-pass | 3 | 3 | 9 | Adversarial segment fixture test + output sanitization verification |
| R3-005 | BUS | Auto-pass false approval — new lang pair uncalibrated threshold + stale score → bad file auto-approved | 3 | 3 | 9 | Boundary tests: threshold=score, file #49 vs #50, uncalibrated pair, score=0 |
| R3-006 | TECH | Multi-provider fallback × Inngest retry — primary rate-limited, exponential API calls (retries × fallbacks) → cost explosion | 3 | 3 | 9 | Integration test: Inngest retry count + fallback chain; verify no duplicate AI calls |

## High-Priority Risks (Score 6-8) — 13 risks

| Risk ID | Cat | Description | P | I | Score | Mitigation |
|---------|-----|-------------|---|---|-------|------------|
| R3-001 | DATA | Token budget bypass under concurrent batch — 10 files queued, all call AI before budget exhausts | 2 | 3 | 6 | Integration test: 5 files, exhaust after 2nd, verify 3rd-5th blocked |
| R3-002 | DATA | Score recalc race during rapid actions — Accept+Reject rapid fire → double calculation | 2 | 3 | 6 | Test 3 finding.changed events within 100ms, verify Inngest serial queue |
| R3-004 | PERF | L2 NFR3 violation (>30s/100 segments) — API latency spike | 2 | 3 | 6 | Performance benchmark (existing perf test) + CI gate |
| R3-013 | BUS | Cost estimation variance >20% visible to customer — erodes trust | 2 | 3 | 6 | Budget estimation accuracy test with known token counts |
| R3-019 | BUS | Score "jump scare" — L1→L2 score drops without transition warning | 2 | 3 | 6 | Test score transition animation + "recalculating" state visibility |
| R3-020 | BUS | No pre-flight budget check for batch — 50-file batch exhausts at file 30 | 2 | 3 | 6 | Pre-flight estimation test: total batch cost vs remaining budget |
| R3-021 | TECH | Inngest step ID collision on retry-after-crash — step skip = silent finding loss | 2 | 3 | 6 | Test retry scenario: verify step IDs unique across retries |
| R3-025 | DATA | Garbage JSON = entire chunk lost — 1 bad finding rejects all valid findings in same chunk | 2 | 3 | 6 | Per-finding safeParse: skip invalid, keep valid findings in chunk |
| R3-029 | DATA | Chunk split breaks multi-byte char — Thai sara am / CJK at 30K boundary corrupts prompt | 2 | 3 | 6 | Test chunkSegments with Thai/CJK at exact boundary |
| R3-030 | DATA | Duplicate findings on re-run — retry without DELETE old L2 → double penalty | 2 | 3 | 6 | Test retryFailedLayers: verify DELETE old L2 findings before re-run |
| R3-031 | BUS | Penalty weight = 0 bypasses scoring — Major=0 → auto-pass with Major findings | 2 | 3 | 6 | Boundary test: weight=0 for each severity, verify score reflects findings |
| R3-032 | OPS | Rate limiter service down — Upstash unavailable, fail-open allows unlimited AI calls | 2 | 3 | 6 | Test rate limiter unavailable → graceful degradation (fail-closed) |
| R3-033 | TECH | Batch payload > 512KB — 50 files + metadata exceeds Inngest limit, silently rejected | 2 | 3 | 6 | Boundary test: 50 files payload size vs 512KB limit |

## Medium-Priority Risks (Score 3-4) — 10 risks

| Risk ID | Cat | Description | P | I | Score |
|---------|-----|-------------|---|---|-------|
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
| R3-035 | TECH | 500+ L1 findings → prompt context overflow, L2 prompt truncated silently | 2 | 2 | 4 |
| R3-036 | BUS | L3 anchoring bias — always confirms L2, adds no value | 1 | 2 | 2 |
| R3-037 | BUS | Filter not reset on file switch → empty finding list shown | 2 | 2 | 4 |
| R3-038 | TECH | Concurrency key mismatch (score vs process functions) → race condition | 2 | 2 | 4 |
| R3-039 | BUS | ScoreBadge shows NaN for null score before first calculation | 2 | 2 | 4 |

## Low-Priority Risks (Score 1-2) — 5 risks

R3-015 (OPS, 2), R3-016 (OPS, 1), R3-017 (BUS, 1), R3-018 (BUS, 1), R3-028 (TECH, 2)

## Elicitation: Chaos Monkey Scenarios
- 6 scenarios tested: Kill AI mid-batch, Realtime dies, Budget exhausted L2→L3, Garbage JSON, Inngest crash, Concurrent reviewers
- 9 new gaps found → 4 new risks added (R3-025 to R3-028)
- Key insight: per-finding validation missing (1 bad finding = whole chunk lost)

## Chaos Monkey Gap Inventory (9 gaps)
1. Chunk N fails but N+1 continues — UNTESTED (runL2ForFile)
2. Realtime reconnect + stop polling — UNTESTED (use-findings-subscription)
3. Poll/Realtime overlap dedup — UNTESTED (use-findings-subscription)
4. E2E budget exhausted mid-pipeline UX — UNTESTED (e2e)
5. Per-finding safeParse (skip bad, keep good) — UNTESTED (l2/l3 output handling)
6. File status during Inngest recovery window — UNTESTED (processFile)
7. Orphan "processing" file cleanup — UNTESTED (no cleanup job exists)
8. Optimistic vs Realtime state conflict — UNTESTED (use-review-actions)
9. previous_state mismatch → conflict dialog — UNTESTED (state-transitions)

## Elicitation: Failure Mode Analysis
- 8 components analyzed: AI Provider, L2 Pipeline, L3 Pipeline, Inngest, Scoring, Review Store, Budget, UI
- 30+ failure modes identified across all components
- 5 new HIGH risks (R3-029 to R3-033), 6 new MEDIUM risks (R3-034 to R3-039), 1 new LOW (R3-036)
- Key insights: chunk split multi-byte, duplicate findings on re-run, penalty weight=0 bypass, rate limiter down

## FMA Gap Inventory (12 new gaps from FMA)
1. Chunk split at multi-byte boundary (Thai sara am, CJK) — UNTESTED
2. Retry without DELETE old L2 findings → duplicates — UNTESTED
3. Custom penalty weight = 0 → score bypass — UNTESTED
4. Upstash rate limiter unavailable → fail-open? — UNTESTED
5. Batch payload > 512KB → Inngest rejects — UNTESTED
6. Provider returns empty findings (lazy response) — no suspicious-zero alert
7. Health check OK but inference broken — UNTESTED
8. 500+ L1 findings in prompt context → overflow — UNTESTED
9. L3 anchoring bias (always agrees with L2) — no validation
10. Filter state not reset on file switch — UNTESTED
11. Concurrency key mismatch (score vs process) — no integration test
12. ScoreBadge null score → NaN display — UNTESTED

## Risk Summary (Final — post Round Table + Chaos Monkey + FMA)
- BLOCK (=9): 3 — SEC (1), BUS (1), TECH (1)
- High (6-8): 13 — DATA (5), PERF (1), BUS (4), TECH (2), OPS (1)
- Medium (3-4): 18 — TECH (6), DATA (3), BUS (5), OPS (3), PERF (1)
- Low (1-2): 6 — OPS (2), BUS (3), TECH (1)
- **Total: 40 risks**
- **Gate status: CONCERNS — 3 BLOCK risks mitigated (18 tests, 2026-03-14). 13 High risks remain.**

# Step 4: Coverage Plan & Execution Strategy

## Coverage Matrix Summary

### P0 (Critical) — 11 areas, ~44 tests
- P0-01: Prompt injection adversarial segments (6) — R3-003 ✅ DONE (2026-03-14)
- P0-02: Auto-pass boundary threshold=score ±0.01 (4) — R3-005 ✅ DONE (2026-03-14)
- P0-03: Auto-pass new lang pair file #49 vs #50 (3) — R3-005 ✅ DONE (2026-03-14)
- P0-04: Fallback × Inngest retry: total calls ≤ retries × chain (5) — R3-006 ✅ DONE (2026-03-14)
- P0-05: Budget per-file in concurrent batch (4) — R3-001 ❌ NEW
- P0-06: Chunk split multi-byte: Thai sara am, CJK at 30K (5) — R3-029 ❌ NEW
- P0-07: Duplicate findings on retry: DELETE before re-run (4) — R3-030 ❌ NEW
- P0-08: Penalty weight=0 for each severity (4) — R3-031 ❌ NEW
- P0-09: Per-finding safeParse: skip bad, keep valid (4) — R3-025 ❌ NEW
- P0-10: Score recalc race: 3 events/100ms → 1 final score (3) — R3-002 ❌ NEW
- P0-11: E2E pipeline→score→UI with real L2 (2) — R3-019 ⚠️ ENHANCE

### P1 (High) — 16 areas, ~44 tests
- P1-01: L2 NFR3 100 segments < 30s (2) ✅ EXISTS
- P1-02: Cost estimation accuracy ≤ 20% variance (4) ❌ NEW
- P1-03: Pre-flight batch budget check (3) ❌ NEW
- P1-04: Inngest step ID unique across retries (3) ❌ NEW
- P1-05: Batch payload 50 files < 512KB (3) ❌ NEW
- P1-06: Rate limiter unavailable → fail-closed (3) ❌ NEW
- P1-07: Score transition "recalculating" badge (3) ⚠️ ENHANCE
- P1-08: 500+ L1 findings → prompt truncation (3) ❌ NEW
- P1-09: Filter reset on file switch (3) ❌ NEW
- P1-10: Chunk N fails, N+1 continues (3) ❌ NEW
- P1-11: Realtime reconnect stops polling (3) ❌ NEW
- P1-12: Concurrency key consistency (2) ❌ NEW
- P1-13: ScoreBadge null → spinner not NaN (2) ❌ NEW
- P1-14: Empty findings suspicious-zero telemetry (2) ❌ NEW
- P1-15: E2E L3 failure → partial score + warning (2) ❌ NEW
- P1-16: previous_state mismatch → conflict error (3) ❌ NEW

### P2 (Medium) — 13 areas, ~30 tests
- Cross-layer dedup, glossary timeout, AI mock contract, a11y badge icons
- Zod schema drift, orphan file detection, optimistic vs RT conflict
- Poll/RT overlap dedup, E2E budget exhausted UX, 1000+ segment perf
- Partial score consistency, L3 anchoring bias, model pinning deprecation

### P3 (Low) — 7 areas, ~6 tests
- Provider total outage, budget alert edges, multi-tab sync
- Budget config mid-pipeline, token overflow, health check false positive, tooltip truncation

## Execution Strategy

| Trigger | Suite | Time Budget |
|---------|-------|-------------|
| Every PR | P0 + P1 unit/component | < 5 min |
| PR to main | P0 + P1 full (+ E2E) | < 15 min |
| Nightly | P0 + P1 + P2 | < 30 min |
| Weekly | Full regression P0-P3 | < 45 min |
| On AI schema change | P0-01 to P0-09 + P2-03 | < 10 min |

## Resource Estimates

| Priority | New Tests | Total Hours |
|----------|-----------|-------------|
| P0 | ~34 new + 10 enhance | 70-130 hrs |
| P1 | ~38 new + 6 enhance | 40-65 hrs |
| P2 | ~24 new + 6 enhance | 15-30 hrs |
| P3 | ~6 new | 2-3 hrs |
| **Total** | **~124 new tests** | **~127-228 hrs (~16-29 days)** |

Existing: 610 tests → After: ~734 tests

## Quality Gates

- P0 pass rate: 100% (merge blocked)
- P1 pass rate: ≥ 95% (waivers require owner + deadline)
- P2/P3 pass rate: ≥ 90% (informational)
- BLOCK risks (R3-003, R3-005, R3-006): 100% mitigated
- High risks (13 items): 100% mitigation plan + owner
- Security (prompt injection): 100% pass
- Performance NFR3/NFR4: benchmarks met
- Critical path coverage: ≥ 80%
- Business logic coverage: ≥ 80%
