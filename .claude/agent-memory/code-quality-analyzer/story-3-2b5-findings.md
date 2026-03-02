# Story 3.2b5 — Upload-to-Pipeline Wiring CR R1-R2

## Date: 2026-03-02

## R1 Result: 0C / 3H / 5M / 4L

## R2 Result: 0C / 0H / 3M / 4L — CR EXIT (0C+0H)

## Files Reviewed

- `src/features/upload/components/UploadPageClient.tsx`
- `src/features/upload/components/UploadProgressList.tsx`
- `src/features/upload/components/FileUploadZone.tsx`
- `src/features/upload/components/UploadPageClient.test.tsx`
- `e2e/upload-segments.spec.ts`
- `e2e/pipeline-findings.spec.ts`
- `e2e/helpers/fileUpload.ts`
- `e2e/helpers/pipeline-admin.ts`

## HIGH Findings

- H1: `parsingStartedRef` not cleared on duplicate re-run fileId reuse (low real risk — new fileId per re-run)
- H2: E2E test [P2] uploads same fixture → duplicate detection dialog blocks test flow
- H3: E2E pipeline-findings dependent tests lack fileId guard — undefined access if setup fails

## MEDIUM Findings

- M1: `new Set([...prev, fileId])` spread pattern — use `.add()` idiom
- M2: E2E pipeline-admin.ts uses `process.env` directly (acceptable for Playwright context but needs comment)
- M3: Double toast — handleStartProcessing + ProcessingModeDialog both show toast.success
- M4: `upload-status-success` testid used for both "Uploaded" and "Parsed" states
- M5: Raw `<button>` instead of shadcn `<Button>` component for "Start Processing"

## LOW Findings

- L1: `makeUploadedFile` uses VALID_PROJECT_ID as default fileId — misleading
- L2: `/parsing/i` regex matches both "Parsing..." and "Parsed" — not specific enough
- L3: E2E pipeline-findings 300s timeout is long for CI
- L4: Error messages use if-chain without exhaustive fallback for new UploadErrorCode values

## Good Patterns Found

- Render-time derivation pattern (no setState-in-effect)
- Strict Mode double-invocation guard via ref
- Sequential parsing with stable string useEffect dependency
- ReadonlySet/ReadonlyMap types in child component props
- Comprehensive test coverage: 26 tests across 4 ACs + boundaries

## R2 Findings (2026-03-02)

- All R1 H/M fixes verified correct — no regressions
- M1: `upload-status-success` testid shared between "Uploaded" and "Parsed" states (tech debt)
- M2: E2E `.catch(() => false)` swallows all errors (low risk)
- M3: Error display blank for unknown UploadErrorCode (R1-L4 upgraded)
- L1: Two separate afterEach blocks in setup.ts (cosmetic)
- L2: jest-dom/vitest import added (GOOD)
- L3: Redundant dynamic `await import('sonner')` in 2 test cases
- L4: Score status 'na' added to allowlist (GOOD)
