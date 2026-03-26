# Epic 5 Draft Guardrails — Language Intelligence & Non-Native Support

**Date:** 2026-03-26
**Status:** DRAFT — Pending team review before adding to CLAUDE.md
**Source Research:**
- Back-Translation Spike: `_bmad-output/planning-artifacts/research/back-translation-spike-2026-03-26.md`
- RLS Scoped Access Design: `_bmad-output/planning-artifacts/research/rls-scoped-access-design-2026-03-26.md`
- AI SDK Spike Guide: `_bmad-output/planning-artifacts/research/ai-sdk-spike-guide-2026-02-26.md`

---

## AI Back-Translation

51. **BT model alias: distinct from L2** — Register back-translation as a separate model alias (`'back-translation'`) in `qaProvider` even if it points to the same underlying model as L2 (`gpt-4o-mini`). This allows swapping BT model independently without affecting pipeline screening. NEVER reuse `getModelForLayer('L2')` directly for back-translation calls — always use `getModelForLayer('BT')`. (Source: back-translation spike S2.1)

52. **BT cost tracking: layer = `'BT'`** — Extend `AILayer` type to `'L2' | 'L3' | 'BT'`. Every `generateText` call for back-translation MUST use `logAIUsage({ layer: 'BT', ... })`. The `ai_usage_logs.layer` column is `varchar(10)` so no migration needed, but the TypeScript union MUST be updated first. Budget dashboards that filter by layer will silently exclude BT costs if this is missed. (Source: back-translation spike S2.2)

53. **BT is per-segment, not per-file — debounce mandatory** — Back-translation triggers on segment focus (high frequency during J/K navigation). MUST debounce >= 300ms before calling Server Action. Without debounce, rapid J/K navigation fires 5-10 AI calls/second, burning budget on segments the reviewer skips past. Client-side: `useEffect` with `setTimeout` + cleanup. Server-side: no additional throttle needed (cache absorbs repeated calls). Cancel in-flight request when segment changes (AbortController). If `segmentId !== currentSegmentId`, discard result. (Source: back-translation spike S6.1)

54. **BT structured output: same Zod rules as L2/L3** — Back-translation Zod schema MUST follow Guardrail #17 (`.nullable()` only, no `.optional()`). The `translationApproach` field is nullable; all other fields are required. `languageNotes` is a required array (empty array `[]` when no notes, NOT `null`). Test: verify schema passes `Output.object({ schema })` validation with OpenAI before merging. (Source: back-translation spike S3.1, AI SDK spike S3)

55. **BT prompt: "translate what IS written, not what SHOULD be"** — The back-translation prompt MUST instruct the AI to translate the target text literally back to the source language, preserving errors. If the target contains a mistranslation, the back-translation must expose it (not "fix" it). This is the core value proposition — without this instruction, AI will produce a clean back-translation that hides the very errors reviewers need to see. Review every prompt change against this principle. (Source: back-translation spike S4.1)

56. **BT low-confidence fallback: budget-gated** — If gpt-4o-mini returns confidence below the configurable threshold (stored in `project_settings.bt_confidence_threshold`, default 0.6), optionally retry with claude-sonnet for better nuance. This fallback MUST be gated by `checkProjectBudget()` — never retry with the expensive model if budget is exhausted. Log both attempts (original + retry) separately in `ai_usage_logs`. If retry confidence is not higher than original, return the original result (don't waste the more expensive result). (Source: back-translation spike S8)

## Per-Segment Caching

57. **BT cache key: include `targetTextHash`** — Cache key = `(segmentId, languagePair, modelVersion, targetTextHash)`. The `targetTextHash` (SHA-256 of target text) is critical: if a file is re-uploaded with changed translations, the same `segment_id` may map to different target text via new segment rows, but if segment IDs are reused in any path, stale cache MUST NOT be served. Without the hash, a re-uploaded file with fixed translations would show back-translations of the OLD (broken) text. (Source: back-translation spike S5.1)

58. **BT cache: `withTenant()` on every query** — The `back_translation_cache` table MUST have `tenant_id` column and all queries MUST use `withTenant()` (Guardrail #1). Cache lookup is a hot path (called on every segment focus) — do NOT skip tenant filtering for "performance". The index `(segmentId, languagePair, modelVersion)` already covers the lookup; adding tenant filter to the WHERE clause uses the existing `tenant_id` FK index. (Source: back-translation spike S5.2, Guardrail #1)

59. **BT cache write: `onConflictDoUpdate` mandatory** — Cache INSERT must use `onConflictDoUpdate` on the unique constraint `(segmentId, languagePair, modelVersion, targetTextHash)`. Without conflict handling, concurrent requests for the same segment (e.g., two reviewers focusing the same finding simultaneously) will throw `23505 unique_violation`. The update should refresh `createdAt` to extend TTL. (Source: back-translation spike S5.4, Guardrail #41)

60. **BT cache invalidation: rely on CASCADE, not manual DELETE** — File re-upload creates new segment rows (DELETE + INSERT in transaction). The `back_translation_cache.segment_id` FK with `ON DELETE CASCADE` automatically removes stale cache entries. Do NOT add manual cache invalidation for re-upload — it is redundant and creates a maintenance burden. Exception: glossary updates require explicit `DELETE FROM back_translation_cache` for affected project+language pair (no segment change, but context changed — CASCADE does not apply). (Source: back-translation spike S5.5)

61. **BT cache TTL: filter in query, clean via cron** — TTL is enforced at query time: `WHERE created_at >= (now - 24h)`. Do NOT rely solely on the cron cleanup job — expired entries may be served between cron runs if the query filter is missing. The cron job (`clean-bt-cache`, daily at 03:00 UTC) is for storage hygiene only, not correctness. Both mechanisms are required. (Source: back-translation spike S5.6)

## RLS Scoped Access

62. **Native reviewer RLS: prefer `EXISTS` subquery on `finding_assignments`** — Native reviewer SELECT policies on `findings`, `segments`, and `review_actions` MUST use `EXISTS (SELECT 1 FROM finding_assignments fa WHERE fa.finding_id = ... AND fa.assigned_to = jwt.sub)`. Prefer EXISTS with correlated subquery. If JOIN unavoidable, ensure `tenant_id` check at each join level. Always include explicit `tenant_id` check inside the subquery. (Source: RLS scoped access design S3.2-3.6)

63. **RLS policy migration: atomic DROP + CREATE** — When replacing existing tenant-only policies with role-scoped policies (e.g., on `findings`, `segments`, `review_actions`), the DROP and CREATE MUST be in the same SQL transaction. A window between DROP and CREATE means all SELECT queries return 0 rows (RLS defaults to deny). Pattern: `BEGIN; DROP POLICY IF EXISTS ...; CREATE POLICY ...; COMMIT;`. Test by running migration against staging with concurrent queries. (Source: RLS scoped access design S7.2)

64. **Native reviewer: app-level check + RLS double defense** — Server Actions for native reviewer operations MUST validate assignment ownership at the app level (`WHERE findingId = ? AND assignedTo = currentUser.id`) in addition to RLS. Drizzle via `@/db/client.ts` bypasses RLS. `createServerClient()` goes through RLS. App-level check is the primary defense, RLS is defense-in-depth. Both layers are required — neither is sufficient alone. (Source: RLS scoped access design S8.2)

65. **`finding_assignments` index: `(finding_id, assigned_to)`** — The composite index is required for RLS `EXISTS` subquery performance. Without it, every native reviewer query on `findings` triggers a sequential scan on `finding_assignments`. With typical assignment counts (< 200 per reviewer), the index-only scan completes in < 1ms. Also add `(assigned_to, tenant_id)` index for the "my assignments" listing page. (Source: RLS scoped access design S4.1)

## Cross-Role Access Patterns

66. **Non-native auto-tag: set once, never clear** — When a `review_action` is created, determine `isNonNative` by comparing `user.native_languages` against `file.targetLang` (BCP-47 prefix match: extract primary language subtag via `lang.split('-')[0]` — e.g., `'zh'` from `'zh-Hans'`; if `native_languages` is empty/null, treat as non-native for ALL languages). Store as `metadata: { non_native: true }` on the `review_actions` row. This flag is write-once: do NOT clear it when a native reviewer later confirms the finding. Instead, add `native_verified: true` alongside. Metadata naming convention: `{ non_native: true, native_verified: true, native_verified_by: userId, native_verified_at: ISO8601 }`. Clearing `non_native` destroys audit trail. (Source: RLS scoped access design S5, S10.1 D3)

67. **Flag-for-native-review: atomic 3-table write** — The "Flag for Native Review" action must atomically: (1) UPDATE `findings.status = 'flagged'`, (2) INSERT `finding_assignments`, (3) INSERT `review_actions` with `action_type = 'flag_for_native'`, (4) INSERT `notifications` to native reviewer. Use `db.transaction()` — partial writes (e.g., finding flagged but no assignment created) leave the system in an inconsistent state where no one can act on the finding. (Source: RLS scoped access design S6.1)

## Thai/CJK Back-Translation Quality

68. **Thai BT prompt: comprehensive language handling** — When `targetLang` starts with `'th'`, the BT prompt MUST include Thai-specific instructions covering all three aspects: (1) **Tone markers:** Thai tone markers (mai ek `\u0E48`, mai tho `\u0E49`, mai tri `\u0E4A`, mai chattawa `\u0E4B`) change word meaning entirely (e.g., `ใกล้` near vs `ไกล` far). Require tone marker annotation as `noteType: 'tone_marker'` in `languageNotes`. Post-call verification: count tone markers in target text vs `tone_marker` notes — rate should be >= 0.5. (2) **Compound words:** Thai compound words (e.g., `โรงพยาบาล` = hospital, NOT "factory-sick") MUST be translated as single concepts. If the back-translation decomposes a compound word into morphemes, reviewers see nonsensical literal translations. Verify with Thai reference corpus (`docs/test-data/back-translation/th-reference.json`). Target: >= 90% compound word accuracy. (3) **Politeness particles:** Thai particles (`ครับ`/`ค่ะ` formal, `นะ`/`คะ` softening) indicate register, not translation content. Annotate as `noteType: 'politeness_particle'` in `languageNotes` but do NOT treat presence/absence as a translation error. (Source: back-translation spike S9.1-9.3)

69. **CJK back-translation: inject language-specific prompt section** — When `targetLang` starts with `'zh'`, `'ja'`, or `'ko'`, inject language-specific prompt instructions via `getLanguageInstructions(targetLang)` (existing infra from L2/L3 pipeline). Key CJK instructions: (1) Chinese: note simplified vs traditional script differences, (2) Japanese: note kanji vs kana choice implications, (3) Korean: note honorific levels (formal/informal/polite). Do NOT hardcode CJK instructions in the BT prompt builder — use the existing modular `getLanguageInstructions()` system for consistency with L2/L3. BT-specific instructions via `getBTLanguageInstructions(targetLang)` — augments (not replaces) `getLanguageInstructions()`. (Source: back-translation spike S4.1, existing pipeline pattern)

70. **`lang` attribute on back-translation text** — The LanguageBridge panel displays back-translation text in the SOURCE language. The HTML element containing back-translation text MUST have `lang="{sourceLang}"` attribute (Guardrail #39). The contextual explanation and language notes are in English (or the UI language) and should have `lang="en"`. Without correct `lang`, screen readers mispronounce back-translated text and browser font fallback may select wrong glyphs for CJK. (Source: Guardrail #39, WCAG SC 3.1.2)

## General Epic 5 Patterns

71. **New tables: enable RLS + add tenant isolation from migration** — `finding_assignments` and `finding_comments` tables MUST have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in the same migration that creates the table. Do NOT create the table in one migration and add RLS in a later one — the window between migrations is a security gap where any authenticated user can access all rows. (Source: RLS scoped access design S3.4-3.5, existing project pattern)

72. **Assignment status: union type, not bare string** — `finding_assignments.status` must use a TypeScript union type: `type AssignmentStatus = 'pending' | 'in_review' | 'confirmed' | 'overridden'`. Do NOT use bare `string` (Guardrail #3). The DB column is `varchar(20)` — add a CHECK constraint in the migration and audit all INSERT/UPDATE paths (Guardrail #41). (Source: RLS scoped access design S2.1, Guardrail #3)

73. **Comment insert: validate `finding_assignment_id` ownership** — When inserting into `finding_comments`, the Server Action MUST verify that the current user is either: (a) the `assigned_to` user on the referenced `finding_assignment_id`, or (b) the `assigned_by` user (original flagger), or (c) an admin. Do NOT rely solely on RLS for this — the Drizzle client bypasses RLS (Guardrail #64 above). A native reviewer should not be able to comment on another native reviewer's assignment by guessing the assignment ID. (Source: RLS scoped access design S3.5)

74. **Notification on native comment: non-blocking** — When a native reviewer adds a comment, a notification is sent to the original flagger. This notification insert MUST be non-blocking: wrap in `try-catch` and log on failure (Guardrail #2 pattern). A failed notification must NOT prevent the comment from being saved. The comment is the primary action; notification is secondary. (Source: RLS scoped access design S6.1 step 8, Guardrail #2)

75. **BT abort on segment change** — When the reviewer navigates to a different segment while a back-translation request is in-flight, the stale request MUST be cancelled or its result discarded. Use `AbortController` to cancel the fetch, and guard the response handler with `if (segmentId !== currentSegmentId) return`. Without this, a slow BT response for segment A may arrive after the reviewer moved to segment B, overwriting segment B's panel with stale data. (Source: back-translation spike S6.1)

76. **RLS test mandatory for every role-scoped policy** — Every RLS policy that references `jwt.role` or `jwt.sub` MUST have a corresponding RLS integration test that verifies every role x operation combination (SELECT/INSERT/UPDATE/DELETE). Test matrix: admin (full access), qa_reviewer (scoped to project), native_reviewer (scoped to assignments), unauthenticated (denied). Each test MUST verify both positive (allowed) and negative (denied) cases. A policy without tests is assumed broken. (Source: RLS scoped access design S7.3, existing RLS test pattern)

77. **BT cached vs fresh indicator in UI** — The LanguageBridge panel MUST visually distinguish cached back-translations from fresh AI responses. Show a "Cached" badge when the result was served from `back_translation_cache`. Provide a "Refresh" button that bypasses cache (passes `skipCache: true` to the Server Action, which deletes the cache entry before calling AI). Without this indicator, reviewers cannot tell if a back-translation reflects the current model or an outdated cached result. (Source: back-translation spike S5.7)

78. **`finding_assignments` audit log mandatory** — Every state change on `finding_assignments` (create, status change, reassign, cancel) MUST write to the immutable audit log via `writeAuditLog()`. Include: `action_type` (e.g., `'assignment_created'`, `'assignment_confirmed'`, `'assignment_overridden'`), `finding_id`, `assigned_to`, `assigned_by`, previous and new status. This is required for the defense-in-depth audit trail (Guardrail #2) and enables PM visibility into native review turnaround time. (Source: RLS scoped access design S6.1, Guardrail #2)

---

## Summary

| Range | Topic | Count |
|-------|-------|-------|
| #51-56 | AI Back-Translation | 6 |
| #57-61 | Per-Segment Caching | 5 |
| #62-65 | RLS Scoped Access | 4 |
| #66-67 | Cross-Role Access Patterns | 2 |
| #68-70 | Thai/CJK Back-Translation Quality | 3 |
| #71-78 | General Epic 5 Patterns | 8 |
| **Total** | | **28** |
