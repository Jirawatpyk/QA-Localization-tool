# Story 3.5 — Score Lifecycle & Confidence Display CR R1

**Date:** 2026-03-08
**Result:** 0C / 3H / 7M / 5L

## HIGH Findings

### H-1: useThresholdSubscription created but NOT wired into any component

- Hook exists at `src/features/review/hooks/use-threshold-subscription.ts`
- Grep confirms: only imported in test file, ZERO component usage
- AC10 (threshold change reactivity) does NOT work at runtime
- Blocker: ReviewPageClient doesn't receive sourceLang/targetLang/tenantId props
- Pattern: Memory #26 "Feature Infrastructure Created But Not Wired"

### H-2: l3ConfidenceMin not passed from ReviewPageClient to FindingListItem

- `ReviewPageClient.tsx:280` — only passes `l2ConfidenceMin`, missing `l3ConfidenceMin`
- FindingListItem has the prop + logic to use it (line 77-78)
- L3 findings never show "Below threshold" warning

### H-3: approveFile audit log writes "file.approve" but NO DB mutation happens

- Design decision (Epic 4 scope) but audit trail is misleading
- Should use `file.approve_gate_passed` or add TODO ref

## MEDIUM Findings

- M-1: `ApproveFileData.status: string` — Guardrail #3 bare string violation
- M-2: `APPROVABLE_STATUSES` duplicated in approveFile.action.ts + ReviewPageClient.tsx
- M-3: `effectiveScoreStatus as ScoreStatus | null` unsafe cast unnecessary
- M-4: AutoPassRationale JSON.parse + unsafe `as` — should validate with Zod
- M-5: getFileReviewData missing Zod input validation (unlike approveFile)
- M-6: use-threshold-subscription Realtime channel has NO row-level filter
- M-7: margin badge shows `+-2.5` for negative values

## Key Patterns Confirmed

- withTenant() correct on all 5 DB queries across 2 server actions
- Audit log non-fatal pattern correct in approveFile
- Review store slice pattern well-designed (4 slices + resetForFile)
- ActionResult<T> used consistently
- No `export default`, `console.log`, `process.env`, `any` violations
