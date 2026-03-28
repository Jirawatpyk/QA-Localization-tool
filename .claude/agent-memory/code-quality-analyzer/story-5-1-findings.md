# Story 5.1 Language Bridge Back-Translation CR R1 (Comprehensive)

**Date:** 2026-03-27
**Result:** 3H / 5M / 4L

## HIGH Findings

1. **H1: Cache lookup missing targetTextHash** (btCache.ts:33-53)
   - getCachedBackTranslation() doesn't filter by targetTextHash
   - Guardrail #57 requires targetTextHash in cache key
   - Stale cache served after text change if segment ID reused

2. **H2: LanguageNote type duplicated** (types.ts vs backTranslationCache.ts)
   - Identical type defined in two files -- drift risk
   - DB schema should import from bridge/types.ts SSOT

3. **H3: Segment-project ownership not verified** (getBackTranslation.action.ts:66-79)
   - Segment query filters by id + tenantId but NOT projectId
   - Budget manipulation: charge project A for segment from project B
   - Guardrail #14: asymmetric query filters

## MEDIUM Findings

1. **M1: process.env direct access** in bt-pipeline.integration.test.ts:24
2. **M2: Fallback caches with BT_FALLBACK_MODEL_VERSION** but lookup uses BT_MODEL_VERSION only
3. **M3: contextSegments always empty** -- feature built but not wired, no TODO ref
4. **M4: BT layer gets l3PinnedModel** instead of l2 in providers.ts:80
5. **M5: AbortController not sent to Server Action** -- abort is client-side only

## LOW Findings

1. **L1:** ContextualExplanation languageNotes.map key uses array index
2. **L2:** cleanBTCache step type manually defined instead of Inngest types
3. **L3:** fileId: segmentId semantic mismatch in AI usage logging
4. **L4:** JSONB $type<LanguageNote[]> no runtime validation on cache read

## Positive

- withTenant correct on all queries (cron exception documented)
- generateText + Output.object + result.output pattern correct
- logAIUsage on every AI call (primary + fallback)
- Inngest function pattern correct (retries, onFailure, Object.assign, route.ts)
- Accessibility: aria-live, lang, icon+text+color, reduced-motion
- rows[0] guard correct everywhere
- .nullable() only in Zod schema
- Cache design: SHA-256, TTL dual enforcement, onConflictDoUpdate, CASCADE
- Low-confidence fallback budget-gated with dual logging
- Test boundary values for confidence and compound recognition
