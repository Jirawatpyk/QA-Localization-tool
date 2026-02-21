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

## File Structure Notes

- Dashboard feature: `src/features/dashboard/{actions,components,hooks,types}.ts`
- Onboarding feature: `src/features/onboarding/{actions,components,types,validation}`
- Test colocation: some tests in `__tests__/` subfolder, some colocated — inconsistent
