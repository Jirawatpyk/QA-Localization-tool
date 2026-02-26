# Epic 3 Gap Analysis — Codebase Cross-Reference

**Date:** 2026-02-26
**Author:** Explore Agent (commissioned by Mona)
**Purpose:** Cross-reference Epic 3 story ACs against actual codebase state to identify gaps before story creation

---

## Summary

| Status | Count | Description |
|--------|-------|-------------|
| ✅ EXISTS | 14 | Ready to use — no work needed |
| ⚠️ PARTIAL | 7 | Exists but needs enhancement during story implementation |
| ❌ MISSING | 12 | Must be created during the appropriate story |

**Key Finding:** All 12 missing items map to the correct stories — no orphan gaps, no new stories needed.

---

## ✅ EXISTS — Ready to Use (14 items)

| Item | Source | Used By |
|------|--------|---------|
| `src/lib/ai/types.ts` | P1 | Story 3.1, 3.2a, 3.3, 3.4 |
| `src/lib/ai/costs.ts` | P1 | Story 3.1, 3.2a |
| `src/lib/ai/errors.ts` | P1 | Story 3.4 |
| `src/lib/ai/client.ts` (basic provider) | P1 | Story 3.2a |
| `src/db/schema/aiUsageLogs.ts` | Epic 2 | Story 3.1 |
| `src/db/schema/languagePairConfigs.ts` | Epic 2 | Story 3.2b, 3.3, 3.5 |
| `src/db/schema/scores.ts` (layer_completed, status, auto_pass_rationale) | Epic 2 | Story 3.2b, 3.3, 3.5 |
| `src/features/pipeline/prompts/build-l2-prompt.ts` | P5 | Story 3.2a |
| `src/features/pipeline/prompts/build-l3-prompt.ts` (basic) | P5 | Story 3.3 |
| `src/features/pipeline/helpers/runL2ForFile.ts` | P4 | Story 3.2b |
| `src/features/pipeline/helpers/runL3ForFile.ts` | P4 | Story 3.3 |
| `src/features/pipeline/helpers/chunkSegments.ts` | P4 | Story 3.2b, 3.3 |
| `src/test/mocks/ai-providers.ts` + `src/test/fixtures/ai-responses.ts` | P2 | Story 3.2a-3.5 |
| `src/features/pipeline/prompts/evaluation/` | P5.1 | Story 3.4 |

---

## ⚠️ PARTIAL — Needs Enhancement (7 items)

| Item | Story | Gap Description |
|------|-------|----------------|
| `src/lib/ai/budget.ts` | 3.1 | `checkTenantBudget()` is a **stub** returning hardcoded `hasQuota=true`. Must implement: query `ai_usage_logs` for monthly usage, compare against `projects.ai_budget_monthly_usd` |
| `src/db/schema/scores.ts` | 3.5 | Columns exist but UI doesn't use layer badges yet ("Rule-based" blue, "AI Screened" purple, "Deep Analyzed" gold) |
| `src/db/schema/findings.ts` | 3.2b | Uses `aiConfidence` in DB but AC samples refer to `confidence` — verify naming consistency in UI layer |
| `src/db/schema/projects.ts` | 3.1 | Has `ai_budget_monthly_usd` but **missing** pinned model version columns (`l2_model_version`, `l3_model_version` or config JSONB). **Needs migration** |
| `L3PromptInput` type + `buildL3Prompt()` | 3.3 | **Missing** surrounding context (±2 segments). AC requires: `{ previous: [{…}], current: {…}, next: [{…}] }`. Must extend type + prompt formatting |
| `runL3ForFile.ts` | 3.3 | No surrounding context assembly — must fetch ±2 segments from DB before calling `buildL3Prompt()` |
| L3 dedup/confirm logic | 3.3 | Prompt has dedup instructions but post-processing (boost confidence on confirm, "L3 disagrees" badge on contradiction) not implemented |

---

## ❌ MISSING — Must Create (12 items)

### Tier 1: Before Story 3.0 Kickoff

| Item | Story | Description |
|------|-------|-------------|
| `src/features/review/stores/review-store.ts` | 3.0 | Zustand store with 3 slices: finding list (findingsMap, selectedId, filterState), score display (currentScore, scoreStatus, isRecalculating), bulk selection (selectedIds, selectionMode) |
| `src/features/review/hooks/use-score-subscription.ts` | 3.0 | Supabase Realtime subscription for `scores` table changes, reconnection with exponential backoff (5s → 10s → 20s, max 60s) |
| `finding.changed` event schema | 3.0 | Inngest event: `{ findingId, fileId, projectId, previousState, newState, triggeredBy, timestamp }` |
| Inngest score recalculation function | 3.0 | Deterministic ID `recalculate-score-{projectId}`, serial queue `concurrency: { key: projectId, limit: 1 }`, triggered by `finding.changed` after 500ms debounce |

### Tier 2: Before Story 3.2a Kickoff

| Item | Story | Description |
|------|-------|-------------|
| `src/lib/ai/providers.ts` | 3.2a | `LAYER_MODELS` config with fallback chains (pinned → latest → fallback provider), health check functions per provider |
| `src/features/pipeline/schemas/l2-output.ts` | 3.2a | Extract `l2ChunkResponseSchema` from `runL2ForFile.ts` to dedicated file |
| `src/features/pipeline/schemas/l3-output.ts` | 3.3 | Extract `l3ChunkResponseSchema` from `runL3ForFile.ts` to dedicated file |

### Tier 3: During Story Implementation

| Item | Story | Description |
|------|-------|-------------|
| `FindingCard` + `FindingCardCompact` components | 3.5 | Confidence badge (High ≥85% green, Medium 70-84% orange, Low <70% red), fallback model warning, "Below threshold" badge |
| `ReviewProgress` component | 3.2c | Layer completion status: "AI: L2 complete" with checkmark |
| Upstash rate limiter integration | 3.1 | 5 req/60s per user, L2 max 100/hr, L3 max 50/hr per project |
| "Retry AI Analysis" button + action | 3.4 | Retry only failed layers, preserve successful findings |
| Auto-pass rationale display UI | 3.5 | Final score margin, finding counts by severity, riskiest finding summary, criteria checkmarks |

---

## Action Items for SM (Bob)

### Before `create-story` for Story 3.0:
- Verify `useReviewStore` scope and slice structure matches architecture doc
- Confirm `finding.changed` event schema with existing Inngest event patterns

### Before `create-story` for Story 3.1:
- **Add migration task** for pinned model version columns on `projects` table
- Confirm Upstash package is in dependencies

### Before `create-story` for Story 3.3:
- **Flag** to dev: P5 `L3PromptInput` must be extended with surrounding context (±2 segments)
- **Flag** to dev: P4 `runL3ForFile.ts` must assemble context before calling `buildL3Prompt()`

### Before `create-story` for Story 3.5:
- Ensure `FindingCard`/`FindingCardCompact` are in scope (not deferred to Epic 4)

---

## Cross-Reference: Prep Task Coverage

| Prep Task | Stories Served | Coverage |
|-----------|---------------|----------|
| P1 (AI SDK Spike) | 3.0, 3.1, 3.2a, 3.3, 3.4 | 5/8 stories |
| P2 (AI Mocks) | 3.2a-3.5 | 4/8 stories |
| P3 (Guardrails) | All stories | 8/8 stories |
| P4 (Inngest Templates) | 3.2a, 3.2b, 3.3 | 3/8 stories |
| P5 (Prompt Module) | 3.2a, 3.3 | 2/8 stories (core AI stories) |
| P5.1 (Evaluation) | 3.4 | 1/8 stories (testing story) |

**Prep tasks cover 100% of technical foundation needs for Epic 3.**

---

**Generated:** 2026-02-26 by Explore Agent
**Commissioned by:** Mona (Project Lead)
**Next Step:** SM `create-story` for Story 3.0 → `validate-create-story` → TEA ATDD → dev-story
