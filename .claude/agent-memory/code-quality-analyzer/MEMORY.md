# Code Quality Analyzer Memory

## Recurring Patterns Found

### withTenant() Usage Inconsistency

- Story 1.7 dashboard/notification actions use raw `eq(table.tenantId, tenantId)` instead of `withTenant()` helper
- All glossary + project actions correctly use `withTenant()` from `@/db/helpers/withTenant`
- This is a recurring standards violation to flag in every review

### Supabase Realtime Payload Mismatch

- Realtime INSERT payload uses snake_case DB columns (e.g., `user_id`, `tenant_id`, `is_read`, `created_at`)
- Code casts directly to camelCase TypeScript interface `AppNotification` without mapping
- This causes runtime field mismatch — `isRead` will be undefined, `createdAt` will be undefined, etc.

### Inline Colors in Tailwind

- Project rule: no inline Tailwind colors, use tokens.css
- Violations found: `text-white`, `amber-200`, `amber-50`, `amber-900`, hardcoded `#1e293b` in driver.js config, `white` in onboarding.css
- Design tokens provide `--primary-foreground`, `--destructive` etc. for theming consistency

### Test Pattern: Chainable Drizzle Mock

- Proxy-based chainable mock pattern used across Story 1.7 tests
- Pattern: `createChainMock(resolvedValue)` with Proxy that makes any method call return itself, and `.then` resolves
- Works well but is duplicated across test files — could be extracted to shared test utility

### Type Safety in Types

- `RecentFileRow.status` typed as `string` with comment — should be a union type for compile-time safety
- `AppNotification.type` also typed as bare `string`
- `UploadFileResult.status` and `fileType` also bare `string` — recurring pattern across features

### Path Traversal in Storage Paths

- `buildStoragePath()` now has `sanitizeFileName()` — strips null bytes, `..`, `/`, `\`
- CR Round 2 found: empty fileName (e.g., `".."`) results in empty string after sanitize → trailing slash in path
- Edge case: `"..."` → `"."` after regex → valid but ambiguous filename
- Needs fallback: `if (!safe || safe === '.') return 'unnamed_file'`

### Cross-Tenant FK Injection

- Route handler `POST /api/upload` has proper cross-tenant guard for projectId + batchId (FIXED in Round 1)
- Server Action `createBatch` now also has cross-tenant guard (FIXED in Round 1)
- Always check: does every write action verify FK references belong to the same tenant?

### Batch Linkage — FIXED in Round 1

- `batchId` is now passed from UploadPageClient → startUpload → XHR FormData → route handler
- Pattern works correctly for multi-file uploads

### Storage Orphan Pattern — FIXED in Round 2

- Route handler now cleans up Storage on DB insert failure (route.ts L207-208)

### Partial Batch Failure (Round 2 — still open Round 3)

- Route handler processes files sequentially in a for loop
- If any step fails mid-batch, files already uploaded are committed
- Client receives 500 and may retry entire batch → duplicate DB entries (no unique constraint on tenant_id+project_id+file_hash)
- Need either: unique constraint + ON CONFLICT DO NOTHING, or idempotency key pattern

### Route Handler vs Server Action Validation Gap — FIXED in Round 2

- Route Handler now validates projectId/batchId as UUID via Zod schema (route.ts L64-70)

### Audit Log Inconsistency Across Actions (NEW — Round 3)

- route.ts: writeAuditLog wrapped in try-catch (non-fatal) — CORRECT
- createBatch.action.ts: writeAuditLog NOT wrapped — will throw unhandled if audit DB fails
- Pattern: EVERY writeAuditLog call in Server Actions MUST be non-fatal (try-catch + logger.error)
- This is a recurring oversight — check in every future action review

### Unhandled Promise Patterns in Hooks (NEW — Round 3)

- `void promise.then()` without `.catch()` → unhandled rejection if promise rejects
- Found in: useFileUpload.ts confirmRerun (L280)
- `onFilesSelected(files)` called without await in sync function → floating promise
- Found in: FileUploadZone.tsx handleFiles (L37)
- Pattern: always add `.catch()` to `void` promises, or `await` in async functions

### FormData Type Safety (NEW — Round 3)

- `formData.getAll('files') as File[]` is unsafe — entries can be strings
- Need `instanceof File` type guard to reject non-File entries
- This is a general pattern for all route handlers that accept file uploads

### Missing DB Indexes

- `files` table has no composite indexes despite frequent `(tenant_id, project_id)` and `(tenant_id, project_id, file_hash)` queries
- `00005_performance_indexes.sql` covers audit_logs, findings, segments, scores, user_roles but NOT files

## File Structure Notes

- Dashboard feature: `src/features/dashboard/{actions,components,hooks,types}.ts`
- Onboarding feature: `src/features/onboarding/{actions,components,types,validation}`
- Upload feature: `src/features/upload/{actions,components,hooks,types,constants,validation,utils}`
- Test colocation: some tests in `__tests__/` subfolder, some colocated — inconsistent
