---
title: 'Upload & Storage Adversarial Fixes (Quick + Medium)'
type: 'bugfix'
created: '2026-03-26'
status: 'ready-for-dev'
baseline_commit: '804514f'
context: ['CLAUDE.md']
---

# Upload & Storage Adversarial Fixes (Quick + Medium)

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Adversarial review found 13 issues in Upload & Storage. 5 fixable now: no rate limiter on upload route, fileName length unvalidated, audit log missing fileHash, re-run SELECT/UPDATE TOCTOU race, XHR no abort on unmount.

**Approach:** Fix all 5 directly. Log remaining 8 as tech debt.

## Boundaries & Constraints

**Always:** withTenant() on every query. Existing tests green. CLAUDE.md guardrails.

**Ask First:** Changes to upload API response format.

**Never:** Change storage bucket structure. Add new file types. Modify Supabase Storage config.

</frozen-after-approval>

## Code Map

- `src/app/api/upload/route.ts` -- rate limiter + fileName length + audit fileHash + FOR UPDATE race
- `src/features/upload/hooks/useFileUpload.ts` -- XHR abort on unmount
- `_bmad-output/implementation-artifacts/tech-debt-tracker.md` -- 8 TD entries

## Tasks & Acceptance

**Execution:**
- [ ] `src/app/api/upload/route.ts` -- Add `mutationLimiter.limit(currentUser.id)` after auth, before body parse. On rate limit exceeded → 429.
- [ ] `src/app/api/upload/route.ts` -- Add `file.name.length > 500` check before processing → 400 with filename.
- [ ] `src/app/api/upload/route.ts` -- Add `fileHash` to writeAuditLog metadata.
- [ ] `src/app/api/upload/route.ts` -- Change duplicate SELECT to use Drizzle `for: 'update'` or wrap SELECT+UPDATE in transaction to prevent TOCTOU race.
- [ ] `src/features/upload/hooks/useFileUpload.ts` -- Store XHR instance in ref, abort on unmount via useEffect cleanup.
- [ ] `_bmad-output/implementation-artifacts/tech-debt-tracker.md` -- Log 8 remaining findings as TD entries.

**Acceptance Criteria:**
- Given rapid upload spam (>100 req/min), when rate limit hit, then 429 returned
- Given file with 600-char name, when uploaded, then 400 returned before DB insert
- Given successful upload, when audit log written, then fileHash is in metadata
- Given concurrent re-upload of same file, when both hit SELECT, then only 1 UPDATE succeeds (serialized)
- Given user navigates away during upload, when component unmounts, then XHR is aborted

## Verification

**Commands:**
- `npm run type-check` -- expected: 0 new errors
- `npm run lint` -- expected: 0 new errors
