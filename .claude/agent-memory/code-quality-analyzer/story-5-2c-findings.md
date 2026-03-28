# Story 5.2c Native Reviewer Workflow CR R1-R2

## R1 (2026-03-28)

**Findings:** 1C / 5H / 7M / 5L

### Critical (fixed)

- C1: `flagForNative.action.ts:128` — jsonb containment used `fileId` (UUID) instead of target language

### High (fixed in R2 code)

- H1: 3 actions return hardcoded findingMeta defaults
- H2: getFindingComments no Zod UUID validation
- H3: startNativeReview no Zod UUID validation
- H4: addFindingComment role hierarchy too restrictive
- H5: Q9 missing projectId filter (asymmetric query)

---

## R2 (2026-03-29)

**Findings:** 0C / 4H / 5M / 5L

### HIGH

- **H1:** `ReviewPageClient.tsx:1290-1298` — confirmNativeReview + overrideNativeReview NOT wired (TODO stub with toast.info). AC3 incomplete.
- **H2:** `ReviewPageClient.tsx:1690-1706` — FindingDetailContent + FindingDetailSheet missing assignmentId/flaggerComment props. Comment thread never renders.
- **H3:** `getFindingComments.action.ts:40-64` — unbounded query (no .limit()). DoS risk.
- **H4:** `getFindingComments.action.ts:28-29` — bare string param, no UUID validation.

### MEDIUM

- **M1:** `flagForNative.action.ts:158` — JSON.stringify in raw sql template (minor injection risk). Use sql.param().
- **M2:** `getFileReviewData.action.ts:412` — assignedByName always empty string (no JOIN on assignedBy).
- **M3:** 5 new actions have writeAuditLog without try-catch on happy path. Transaction committed but audit failure crashes response.
- **M4:** `FindingCommentThread.tsx:101,126` — hardcoded `lang="en"` violates Guardrail #39.
- **M5:** `FlagForNativeDialog.tsx:75-88` — setReviewers in useEffect may trigger React Compiler lint.

### LOW

- L1: confirmNativeReview findingDetail undefined → hardcoded defaults
- L2: overrideNativeReview unsafe `as FindingStatus` cast
- L3: FindingCommentThread optimistic append with empty authorId/authorRole
- L4: getNativeReviewers doesn't filter by target language
- L5: startNativeReview bare string param, no Zod

### Positive (R2)

- withTenant() correct on ALL queries (7 new + modified getFileReviewData)
- Atomic transactions correct (flagForNative, confirmNativeReview, overrideNativeReview)
- rows[0]! guard after .returning()
- Notification non-blocking (try-catch + logger.error)
- Dialog state reset (prev-compare pattern)
- Assignment ownership validation in confirm/override
- State transition matrix extended with confirm_native + proper comments

### Patterns Observed

- R1→R2 fix: C1 jsonb containment bug (fileId→targetLang) — FIXED
- Recurring: TODO stubs left in ReviewPageClient when server action is ready
- Recurring: Missing props pass-through to detail components (cross-file wiring gap)
- Cross-file pattern: Feature infrastructure created but not wired (same as Anti-pattern #26)
