---
title: 'Fix 7 UI bugs from project tour'
type: 'bugfix'
created: '2026-04-03'
status: 'done'
baseline_commit: '0aaa9f4'
context:
  - '_bmad-output/PROJECT-TOUR-REPORT.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** UI tour เจอ 7 bugs: project card ไม่ clickable (non-admin ติด), file name ไม่เป็น link, sidebar แสดง Admin ให้ทุก role, breadcrumb แสดง UUID/kebab-case, date แสดง -1 days, onboarding tooltip ซ้ำทุกหน้า

**Approach:** Patch 6 files ตรงจุด — ทุกตัวมี root cause ชัดจาก investigation แล้ว ไม่ต้องเปลี่ยน architecture

## Boundaries & Constraints

**Always:**
- Named exports only, `@/` alias, no `export default`
- ห้าม `"use client"` บน page.tsx — sidebar เป็น client component อยู่แล้ว ใช้ prop จาก server layout
- Breadcrumb fix ต้อง backwards-compatible กับ route ที่ใช้งานอยู่

**Ask First:**
- ถ้า BUG-6 (onboarding) fix ต้องเปลี่ยน DB schema หรือ server action signature

**Never:**
- อย่าเพิ่ม feature ใหม่ — fix only
- อย่าแก้ component ที่ไม่เกี่ยว
- อย่าเปลี่ยน ProjectTour step content หรือ driver.js config

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| BUG-1: non-admin clicks project card | role=qa_reviewer, project exists | Navigate to `/projects/{id}/upload` | N/A |
| BUG-1: admin clicks project card | role=admin, project exists | Navigate to `/projects/{id}/upload` (Settings button still separate) | N/A |
| BUG-2: project created just now | createdAt = 2 seconds ago, timezone +7 | Display "Today" | N/A |
| BUG-2: project created yesterday | diffDays = 1 | Display "Yesterday" | N/A |
| BUG-3: navigate to /projects/{id}/files | Valid projectId | Breadcrumb: "Dashboard > Demo Project > History" | N/A |
| BUG-3: navigate to /projects/{id}/batches | Valid projectId | Breadcrumb: "Dashboard > Demo Project > Batches" | N/A |
| BUG-4: navigate to /admin/suppression-rules | Admin role | Breadcrumb: "Dashboard > Admin > Suppression Rules" | N/A |
| BUG-5: click file name in history table | File row visible | Navigate to `/projects/{projectId}/review/{fileId}` | N/A |
| BUG-6: dismiss onboarding, navigate to another tab | Tour dismissed via X | Tour does NOT reappear | N/A |
| BUG-6: fresh user first visit | No dismissed_at_step | Tour appears normally | N/A |
| BUG-9: qa_reviewer views sidebar | role=qa_reviewer | Admin link NOT visible | N/A |
| BUG-9: native_reviewer views sidebar | role=native_reviewer | Admin link NOT visible | N/A |
| BUG-9: admin views sidebar | role=admin | Admin link visible | N/A |

</frozen-after-approval>

## Code Map

- `src/features/project/components/ProjectCard.tsx` -- BUG-1 (card link) + BUG-2 (date)
- `src/components/layout/app-breadcrumb.tsx` -- BUG-3 (STATIC_SEGMENTS) + BUG-4 (capitalize)
- `src/features/batch/components/FileHistoryTable.tsx` -- BUG-5 (file name link)
- `src/features/onboarding/components/ProjectTour.tsx` -- BUG-6 (dismissed state)
- `src/components/layout/app-sidebar.tsx` -- BUG-9 (role filter)
- `src/app/(app)/layout.tsx` -- BUG-9 (pass role prop to sidebar)

## Tasks & Acceptance

**Execution:**

- [x] `src/features/project/components/ProjectCard.tsx` -- Make entire card clickable via `onClick` + `useRouter().push(/projects/${project.id}/upload)` with `cursor-pointer` on Card. Do NOT wrap Card in `<Link>` — Settings button inside is already a `<Link>`, nesting `<a>` inside `<a>` is invalid HTML (R1 review finding). Settings button: add `e.stopPropagation()` to prevent card navigation. Fix `formatRelativeDate`: add `if (diffDays <= 0) return 'Today'` before existing checks.
- [x] `src/components/layout/app-breadcrumb.tsx` -- Add `'files'`, `'batches'`, `'parity'` to `STATIC_SEGMENTS` set. Add `SEGMENT_LABELS` mapping for route-to-display-name overrides: `'files'` → `'History'`, `'suppression-rules'` → `'Suppression Rules'`, `'ai-usage'` → `'AI Usage'` (R2 review finding: `/files` route displays as "History" tab, not "Files"). Update `capitalize()` to: (1) check `SEGMENT_LABELS` first, (2) fallback to kebab-case split → capitalize each word → join with space.
- [x] `src/features/batch/components/FileHistoryTable.tsx` -- Wrap file name cell content in `<Link href={/projects/${projectId}/review/${file.fileId}}>` with hover underline style.
- [x] `src/components/layout/app-sidebar.tsx` -- Accept optional `userRole` prop typed `AppRole | null`. Filter `navItems`: exclude Admin item when `userRole !== 'admin'`.
- [x] `src/app/(app)/layout.tsx` -- Pass `userRole={user?.role ?? null}` to `<AppSidebar>`.
- [x] `src/features/onboarding/components/ProjectTour.tsx` -- Fix dismissed state sync on remount (R3 review finding: existing checks at lines 47-54 are correct but `dismissedRef` resets to `false` on unmount/remount, and `userMetadata` doesn't refetch on client-side nav). Add init-time check at line 46: `if (userMetadata?.dismissed_at_step?.project) { dismissedRef.current = true; return }` — this sets the ref from server-persisted state BEFORE the existing logic runs, preventing tour from re-showing after tab navigation.

**Acceptance Criteria:**

- Given a qa_reviewer on the projects page, when they click a project card, then they navigate to `/projects/{id}/upload`
- Given a project created moments ago, when the card renders, then it shows "Today" (not "-1 days ago")
- Given navigation to `/projects/{id}/files`, when breadcrumb renders, then it shows "History" (not UUID)
- Given navigation to `/admin/suppression-rules`, when breadcrumb renders, then it shows "Suppression Rules" (not "suppression-rules")
- Given a file in the history table, when the user clicks the file name, then they navigate to the review page
- Given a user dismisses the onboarding tooltip, when they navigate to another project tab, then the tooltip does NOT reappear
- Given a qa_reviewer or native_reviewer, when they view the sidebar, then the Admin link is NOT visible

## Verification

**Commands:**

- `npm run type-check` -- expected: 0 errors
- `npm run lint` -- expected: 0 errors
- `npm run test:unit` -- expected: all pass

**Manual checks (if no CLI):**

- Open browser as admin: verify card clickable, Settings button still works, Admin in sidebar
- Open browser as qa_reviewer: verify card clickable, NO Admin in sidebar, NO Settings button
- Navigate to /projects/{id}/files: breadcrumb shows project name + "History"
- Navigate to /admin/suppression-rules: breadcrumb shows "Suppression Rules"
- Dismiss onboarding tooltip → navigate tabs → tooltip stays dismissed

## Spec Change Log

- **R1 (Winston):** BUG-1 changed from "wrap Card in Link" to "onClick + router.push" — avoids nested `<a>` tags (Settings Link inside Card Link = invalid HTML). Added `e.stopPropagation()` on Settings button.
- **R2 (Amelia):** BUG-3 added `SEGMENT_LABELS` mapping — route `/files` must display as "History" (matches ProjectSubNav tab label), not "Files" from naive capitalize.
- **R3 (Amelia):** BUG-6 corrected root cause — existing checks at lines 47-54 are correct but `dismissedRef` resets on remount. Fix is init-time sync from `userMetadata.dismissed_at_step.project`, not a new early return.
- **KEEP:** I/O Matrix and AC validated correct by all reviewers.

## Suggested Review Order

**Navigation & Clickability (BUG-1, BUG-5)**

- Card click via onClick + keyboard a11y with target guard to prevent double-nav on Settings
  [`ProjectCard.tsx:41`](../../src/features/project/components/ProjectCard.tsx#L41)

- File name wrapped in Link to review page
  [`FileHistoryTable.tsx:131`](../../src/features/batch/components/FileHistoryTable.tsx#L131)

**Role-Based Access (BUG-9)**

- Server layout passes userRole to client sidebar
  [`layout.tsx:24`](../../src/app/(app)/layout.tsx#L24)

- Sidebar filters admin link based on role prop
  [`app-sidebar.tsx:12`](../../src/components/layout/app-sidebar.tsx#L12)

**Breadcrumb Fixes (BUG-3, BUG-4)**

- STATIC_SEGMENTS + SEGMENT_LABELS mapping for route-to-display-name
  [`app-breadcrumb.tsx:21`](../../src/components/layout/app-breadcrumb.tsx#L21)

- capitalize() handles kebab-case + label overrides
  [`app-breadcrumb.tsx:48`](../../src/components/layout/app-breadcrumb.tsx#L48)

**Onboarding State (BUG-6)**

- Sync dismissedRef from server state on remount with typeof number guard
  [`ProjectTour.tsx:49`](../../src/features/onboarding/components/ProjectTour.tsx#L49)

**Date Display (BUG-2)**

- diffDays <= 0 returns "Today" for same-day/future timestamps
  [`ProjectCard.tsx:23`](../../src/features/project/components/ProjectCard.tsx#L23)
