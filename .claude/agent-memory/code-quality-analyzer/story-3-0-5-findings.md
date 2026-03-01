# Story 3.0.5 UX Foundation Gap Fix -- CR R1

**Date:** 2026-03-01
**Files:** ScoreBadge.tsx, app-breadcrumb.tsx, getBreadcrumbEntities.action.ts, TaxonomyMappingTable.tsx, RecentFilesTable.tsx
**Result:** 0C / 1H / 5M / 8L

## Key Findings

### H1: `<a href>` instead of Next.js `<Link>` in breadcrumb

- app-breadcrumb.tsx line 153 — raw anchor tag causes full page reload
- Must use `import Link from 'next/link'` for client-side navigation

### M1: bare `string` for severity in TaxonomyMappingTable

- UpdateFields.severity and EditDraft.severity use `string` not `Severity` type
- SEVERITY_CLASSES uses `Record<string, string>` not `Record<Severity, string>`

### M2: truncateSegments keeps only first+last, wireframe shows first+...+secondToLast+last

- Current: `[first, ellipsis, last]`
- Expected: `[first, ellipsis, secondToLast, last]`

### M3: No AbortController/cancelled flag on entity fetch — race condition on rapid navigation

### Positive

- ScoreBadge architecture is excellent — clean separation of concerns
- DOM-ref animation avoids React Compiler lint issue
- 32 tests with boundary values
- ScoreBadgeState vs ScoreStatus properly separated
