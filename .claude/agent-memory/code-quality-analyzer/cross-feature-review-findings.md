# Cross-Feature Review: parity / dashboard / project (2026-03-03)

## Summary: 0C / 7H / 9M / 8L

## Key Findings

### HIGH

- H1-H3: writeAuditLog without try-catch in happy-path (createProject, updateLanguagePairConfig, markNotificationRead) -- audit failure kills entire action even though primary DB operation succeeded
- H4: 5 AI dashboard actions (getAiUsageSummary, getAiSpendByModel, getAiSpendTrend, getAiUsageByProject, exportAiUsage) use inline result type instead of ActionResult<T>
- H5: useNotifications Realtime payload uses bare `as RawNotificationPayload` without Zod validation
- H6: updateLanguagePairConfig SELECT doesn't filter by projectId (language_pair_configs has no projectId column -- by design, but needs comment)
- H7: getDashboardData.action.ts `row.status as DbFileStatus` unsafe cast

### MEDIUM

- M3: findingsCount hardcoded to 0 in getDashboardData (stale TODO from Epic 2)
- M4: pendingResult LEFT JOIN scores missing withTenant on scores table (defense-in-depth gap)
- M5: ProjectCreateDialog no form reset on dialog close (Anti-pattern #12)
- M6: ProjectSettings doesn't sync state when project prop changes (Anti-pattern #12 variant)
- M7: ProjectWithFileCount uses bare `string` for processingMode and status

### Confirmed Good Patterns

- withTenant() present on all queries (except M4 defense-in-depth gap)
- All .returning() have length guard before access
- No `export default`, `any`, `console.log`, `process.env`
- ReportMissingCheckDialog has proper form reset on close + Escape key handler
- AI dashboard UTC date calculations are correct (setUTCDate/setUTCHours)
- CSV export has formula injection guard (sanitizeCsvString)
