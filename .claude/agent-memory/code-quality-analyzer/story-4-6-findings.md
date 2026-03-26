# Story 4.6 — Suppress False Positive Patterns CR Findings

## Pre-CR R1 (agent scan): 1C / 4H / 5M / 5L

- C1 sendBeacon Content-Type — FIXED (Blob with application/json)
- H1 auto-reject scope — code now uses currentFileId (AC3 compliant)
- H2 isAlreadySuppressed dead code — FIXED (called in use-review-actions.ts)
- H3 visibilitychange premature — FIXED (beforeunload only)
- H4 Zod cross-field — still open as M1 below (bounded validation)
- M2 SCOPE_LABELS type-safe — FIXED (uses Record<SuppressionScope, string>)
- L4 triggerRef focus restore — FIXED (requestAnimationFrame in handleOpenChange)

## CR R1 Summary: 0C / 3H / 5M / 5L

### HIGH

- **H1**: `deactivateSuppressionRule` missing UUID validation on `ruleId` param — FIXED R2
- **H2**: `createSuppressionRule` unsafe `findingFileId!` — FIXED R2 (fallback to currentFileId)
- **H3**: `handleSuppressConfirm` useCallback missing `fileId` in dep array — FIXED R2

### MEDIUM

- **M1**: `suppressionRuleSchema` bare `z.string()` for category/pattern — category FIXED (.max(100)), pattern still no .max()
- **M2**: `getSuppressionRules` no UUID validation — FIXED R2
- **M3**: `getActiveSuppressions` no UUID validation — FIXED R2
- **M4**: `SuppressionRulesPageClient` unused tenantId prop — FIXED R2 (removed)
- **M5**: `isAlreadySuppressed` re-parses rule.pattern on every call — DEFERRED (perf, not blocking)

### LOW

- **L1**: SuppressPatternDialog `pattern!` — still present but guarded by `if (!pattern) return null` above
- **L2**: SuppressionRulesList — FIXED (role="table")
- **L3**: ReviewPageClient manual SuppressionRule construction — still present (DRY risk)
- **L4**: Test IDs — FIXED (valid v4 UUIDs)
- **L5**: deactivate-session-rules audit log — FIXED R2

## CR R2 Summary: 0C / 0H / 5M / 4L — CR EXIT OK

### MEDIUM

- **M1**: `pattern` in Zod schema missing `.max()` — unbounded input to hot loop
- **M2**: Stale session cleanup in getActiveSuppressions not scoped to projectId
- **M3**: Client-side rule createdAt uses `new Date()` instead of server timestamp
- **M4**: `as` cast on `scope`/`duration` from DB without runtime validation (anti-pattern #3)
- **M5**: SuppressionRulesPageClient no error UI when getSuppressionRules fails

### LOW

- **L1**: handleSuppressCancel doesn't clear pendingPatternRef.current
- **L2**: Test assertion for feedback_events could be more specific
- **L3**: SuppressionRulesList missing `scope="col"` on th elements
- **L4**: Intl.Segmenter created per call — no caching

### Key Patterns Observed

- Pattern detection: connected component (BFS) — well-designed
- Session cleanup: sendBeacon + beforeunload + 24h stale fallback (defense-in-depth)
- CF-H2/CF-C1: ref pattern for race condition between toast overwrites
- All withTenant, audit, Guardrail #11 reset — compliant
- 75 tests passing — comprehensive coverage
