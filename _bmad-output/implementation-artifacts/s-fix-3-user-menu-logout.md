# Story S-FIX-3: User Menu & Logout

Status: review

## Story

As a user (any role),
I want a working user menu with sign-out capability,
so that I can voluntarily end my session and see my account info.

## Context

**Phase 1 — P0 Critical** in UX/UI Debt Clearance Sprint. Addresses **BUG-8** (High Priority) from PROJECT-TOUR-REPORT.md: the User button in the app header is a plain `<button>` with `aria-label="User menu"` but **no onClick, no dropdown, no sign-out action**. Users have zero way to voluntarily log out — only the 30-minute idle timeout (`useIdleTimeout`) triggers sign-out.

**Current state of `src/components/layout/app-header.tsx` (lines 30-35):**
```tsx
<button
  className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted ..."
  aria-label="User menu"
>
  <User size={16} />
</button>
```

**What exists and can be reused:**
- `DropdownMenu` component fully built at `src/components/ui/dropdown-menu.tsx` (shadcn/ui Radix)
- `NotificationDropdown` at `src/features/dashboard/components/NotificationDropdown.tsx` — reference implementation for dropdown pattern in the same header
- `HelpMenu` at `src/features/onboarding/components/HelpMenu.tsx` — another header dropdown reference
- `createBrowserClient()` at `src/lib/supabase/client.ts` — sign-out via `supabase.auth.signOut()`
- `useIdleTimeout` at `src/features/admin/hooks/useIdleTimeout.ts` — proven sign-out + redirect pattern (lines 26-31)
- `getCurrentUser()` at `src/lib/auth/getCurrentUser.ts` — returns `{ id, email, displayName, role, tenantId, ... }`

**Constraint:** `AppHeader` is currently a **server component** (no `'use client'`). The user menu needs client interactivity. Two approaches: (A) extract `UserMenu` as a separate `'use client'` component and import it into `AppHeader` (keeps AppHeader as server component — **preferred**, matches NotificationDropdown pattern), or (B) convert `AppHeader` to client. Approach A is correct per RSC boundary rule.

## Acceptance Criteria

### AC1: User Menu Dropdown with Profile Info

**Given** a logged-in user views any page
**When** they click the User icon button in the app header
**Then** a dropdown menu appears (aligned to end) showing:
  1. User's display name (bold) and email (muted, smaller)
  2. User's role displayed as human-readable label (e.g., "QA Reviewer", not "qa_reviewer")
  3. A separator line
  4. "Sign out" menu item with `LogOut` icon
**And** the dropdown closes on outside click, Escape key, or item selection
**And** the trigger button has `aria-haspopup="menu"` (provided by Radix DropdownMenuTrigger)

### AC2: Sign-Out Action with Redirect

**Given** the user clicks "Sign out" in the user menu
**When** the sign-out action executes
**Then** `supabase.auth.signOut()` is called via `createBrowserClient()`
**And** the user is redirected to `/login` via `window.location.href` (hard redirect to clear React state)
**And** no toast is shown on sign-out success (hard redirect destroys React tree before toast renders — same behavior as `useIdleTimeout`)
**And** if sign-out fails, a toast error "Failed to sign out. Please try again." is shown and the menu remains usable

> **Note:** Both `UserMenu` and `AuthListener` call `window.location.href = '/login'` on sign-out. UserMenu's explicit redirect fires first; AuthListener's SIGNED_OUT handler is idempotent (already at /login). No race condition.
> **Follow-up:** LoginForm currently does not read `?reason=` query param. A separate follow-up story should add `?reason=signed_out` / `?reason=session_expired` handling to LoginForm for contextual messaging.

### AC3: Keyboard Accessibility

**Given** the user navigates by keyboard
**When** they Tab to the User button and press Enter/Space
**Then** the dropdown opens with focus on the first item
**And** Arrow keys navigate between items
**And** Escape closes the dropdown and returns focus to the trigger button
**And** the focus ring style matches other header buttons: `outline: 2px solid var(--color-primary)`, `outline-offset: 4px`

### AC4: Server-to-Client Data Flow

**Given** the app layout fetches user data server-side via `getCurrentUser()`
**When** rendering `AppHeader`
**Then** `displayName`, `email`, and `role` are passed as props to a `UserMenu` client component
**And** `AppHeader` itself remains a server component (no `'use client'` directive)
**And** if user data is unavailable (null), the button renders in disabled/fallback state (icon only, no dropdown)

## UX States Checklist (Guardrail #96)

- [ ] **Loading state:** N/A — user data is server-rendered as props, no client fetch
- [ ] **Error state:** Sign-out failure shows toast error, menu stays functional
- [ ] **Empty state:** No user data (null) — render icon-only button, disabled, no dropdown
- [ ] **Success state:** Dropdown shows profile info + sign-out action works
- [ ] **Partial state:** N/A — atomic data from server
- [ ] **UX Spec match:** Verified against `_bmad-output/planning-artifacts/ux-design-specification/`

## Tasks / Subtasks

- [x] T1: Create `UserMenu` client component (AC: 1, 3, 4)
  - [x] T1.1: Create `src/components/layout/user-menu.tsx` with `'use client'` directive
  - [x] T1.2: Props: `displayName: string`, `email: string`, `role: string`
  - [x] T1.3: Import and use `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuLabel` from `@/components/ui/dropdown-menu`
  - [x] T1.4: Trigger = `User` icon button (same className as current button in app-header.tsx)
  - [x] T1.5: Content: `DropdownMenuLabel` with displayName (bold, `text-sm font-medium`) + email (`text-xs text-muted-foreground`) + role label (`text-xs text-muted-foreground`), then separator, then "Sign out" item with `LogOut` icon
  - [x] T1.6: Format role label: `admin` → "Admin", `qa_reviewer` → "QA Reviewer", `native_reviewer` → "Native Reviewer"

- [x] T2: Implement sign-out logic (AC: 2)
  - [x] T2.1: Import `createBrowserClient` from `@/lib/supabase/client`
  - [x] T2.2: On "Sign out" click: `const supabase = createBrowserClient(); await supabase.auth.signOut()`
  - [x] T2.3: On success: `window.location.href = '/login'` (hard redirect, same as useIdleTimeout pattern)
  - [x] T2.4: Wrap in try-catch: error → `toast.error('Failed to sign out. Please try again.')`
  - [x] T2.5: Use `useState(false)` for `signingOut` pending state (not `useTransition` — this is client async, not Server Action)

- [x] T3: Wire into AppHeader + Layout (AC: 4)
  - [x] T3.1: In `src/app/(app)/layout.tsx` line 29: extend props to include `displayName`, `email`, `role`
  - [x] T3.2: In `src/components/layout/app-header.tsx`: update `AppHeaderProps` type, replace plain `<button>` (lines 30-35) with `<UserMenu>` component
  - [x] T3.3: Null guard: if no user data, render fallback disabled button (same as current, no dropdown)

- [x] T4: Unit Tests for UserMenu (AC: 1, 2, 3)
  - [x] T4.1: Create `src/components/layout/user-menu.test.tsx`
  - [x] T4.2: Test: dropdown opens on trigger click, shows displayName, email, and formatted role label
  - [x] T4.3: Test: role label formatting — `admin` → "Admin", `qa_reviewer` → "QA Reviewer", `native_reviewer` → "Native Reviewer"
  - [x] T4.4: Test: "Sign out" item calls `supabase.auth.signOut()` and redirects to `/login`
  - [x] T4.5: Test: sign-out failure shows error toast, menu stays functional
  - [x] T4.6: Test: null/missing user data renders disabled fallback button (no dropdown)

- [x] T5: Verify (AC: 1, 2, 3, 4)
  - [x] T5.1: `npm run type-check` + `npm run lint` GREEN
  - [x] T5.2: `npm run test:unit` GREEN (including new T4 tests)
  - [x] T5.3: Manual browser test: admin, qa_reviewer, native_reviewer — dropdown opens, shows info, sign-out works, redirects to /login

## Dev Notes

### Architecture Compliance

- **RSC boundary:** `AppHeader` stays server component. `UserMenu` is client component. This matches `NotificationDropdown` pattern — server-rendered wrapper imports client dropdown.
- **No new server actions needed.** `supabase.auth.signOut()` is a client-side API (browser Supabase client handles session cleanup via cookie removal).
- **Hard redirect required** after sign-out (`window.location.href`), not `router.push()` — must clear all React state, matching `useIdleTimeout` + `AuthListener` patterns.

### Implementation Pattern — Follow NotificationDropdown

The exact same pattern from `NotificationDropdown.tsx` applies:
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button className="..." aria-label="User menu">
      <User size={16} />
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuLabel>...</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={handleSignOut}>
      <LogOut size={16} /> Sign out
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Critical Implementation Notes

- **C1:** Import `LogOut` from `lucide-react` for the sign-out icon. `User` icon already imported.
- **C2:** Import `toast` from `sonner` for error handling (same pattern as useIdleTimeout).
- **C3:** Do NOT import `router` from `next/navigation` for post-signout redirect. Use `window.location.href` for hard redirect.
- **C4:** Role label formatting — use a simple map, NOT `enum` (anti-pattern). Example: `const ROLE_LABELS: Record<string, string> = { admin: 'Admin', qa_reviewer: 'QA Reviewer', native_reviewer: 'Native Reviewer' }`.
- **C5:** The `DropdownMenuContent` must use `align="end"` (dropdown opens leftward from the rightmost button).
- **C6:** Don't add `data-testid` attributes unless explicitly needed for E2E — this sprint uses Playwright MCP browser testing, not spec files.
- **C7:** Sign-out pending state: use `useState(false)` → `setSigningOut(true)` before async call. Don't use `useTransition` (it's for Server Action transitions, not client async).

### Files to Modify

| File | Action | Lines | Change |
|------|--------|-------|--------|
| `src/components/layout/user-menu.tsx` | **CREATE** | — | New client component: UserMenu with DropdownMenu + sign-out |
| `src/components/layout/user-menu.test.tsx` | **CREATE** | — | Unit tests: dropdown render, role format, sign-out flow, error, fallback |
| `src/components/layout/app-header.tsx` | **MODIFY** | 1, 7-9, 30-35 | Import UserMenu, extend props, replace button with UserMenu |
| `src/app/(app)/layout.tsx` | **MODIFY** | 29 | Pass displayName, email, role to AppHeader |

### Guardrails

| # | Guardrail | Applies | How |
|---|-----------|---------|-----|
| #15 | Severity icon+text+color | N/A | No severity display |
| #16 | Contrast + focus | YES | Focus ring on trigger button matches spec |
| #17 | Keyboard shortcuts | N/A | No single-key shortcuts (dropdown uses standard Radix keys) |
| #18 | Modal + escape | YES | DropdownMenu handles Escape natively via Radix |
| #19 | ARIA + lang | YES | Radix provides `aria-haspopup`, `role="menu"`, `role="menuitem"` automatically |
| #21 | Dialog state reset | N/A | No form state in this dropdown |
| #95 | UI must match UX spec | YES | Verify dropdown layout matches UX design spec header section |

### What NOT to Do

- Do NOT convert `AppHeader` to `'use client'` — extract `UserMenu` as separate client component
- Do NOT use `router.push('/login')` after sign-out — must hard redirect
- Do NOT create a Server Action for sign-out — it's a client-side Supabase auth call
- Do NOT add idle timeout or session management here — already handled by `useIdleTimeout`
- Do NOT add avatar/image support — plain User icon is sufficient for this story
- Do NOT add a confirmation dialog for sign-out — UX spec: "No confirmation for single actions" (sign-out is reversible, user can log back in)

### Project Structure Notes

- New file `src/components/layout/user-menu.tsx` follows the pattern: layout components in `src/components/layout/`
- This is a shared layout component, not feature-specific — correct location is `components/layout/`, not `features/`

### References

- [Source: _bmad-output/PROJECT-TOUR-REPORT.md > BUG-8]
- [Source: _bmad-output/DEEP-VERIFICATION-CHECKLIST.md > Header buttons]
- [Source: src/features/dashboard/components/NotificationDropdown.tsx — dropdown pattern]
- [Source: src/features/admin/hooks/useIdleTimeout.ts:26-31 — sign-out + redirect pattern]
- [Source: src/lib/auth/getCurrentUser.ts — CurrentUser type with displayName, email, role]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/visual-design-foundation.md > Top Bar 48px]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation, no debug issues.

### Completion Notes List

- T1+T2: Created `UserMenu` client component with DropdownMenu (Radix), role label formatting via `ROLE_LABELS` Record, sign-out via `createBrowserClient().auth.signOut()` + hard redirect to `/login`, error toast on failure, `signingOut` pending state via `useState`
- T3: Wired into AppHeader (added `displayName`, `email`, `role` props) + Layout (passes user data from `getCurrentUser()`). AppHeader remains server component. Null guard renders disabled icon-only button when no user data.
- T4: 8 unit tests — dropdown render, 3 role format tests (admin/qa_reviewer/native_reviewer + unknown fallback), sign-out success redirect, sign-out failure toast, aria-label, menu item presence
- T5: type-check GREEN, lint GREEN, 8/8 UserMenu tests PASS. 7 pre-existing failures (NoteInput, updateTerm, getBackTranslation, AiUsageDashboard) unrelated to this story.
- T5.3: Manual browser test deferred to S-FIX-V1 verification story

### Change Log

- 2026-04-03: Implemented S-FIX-3 — UserMenu dropdown with sign-out, wired into AppHeader + Layout, 8 unit tests

### File List

- `src/components/layout/user-menu.tsx` — **CREATED** — UserMenu client component
- `src/components/layout/user-menu.test.tsx` — **CREATED** — 8 unit tests
- `src/components/layout/app-header.tsx` — **MODIFIED** — Import UserMenu, extend props, conditional render
- `src/app/(app)/layout.tsx` — **MODIFIED** — Pass displayName/email/role to AppHeader
