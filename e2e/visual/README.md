# Visual Regression Tests

Pixel-level screenshot comparison via Playwright. Catches unintended UI changes that escape unit/E2E tests.

## Purpose

- **Prevent UX regressions** like the 71 gaps found in audit 2026-04-03
- **Enforce Guardrail #97** (UX audit per epic) at PR-time, not retro-time
- **Make UI changes intentional** — any pixel diff triggers a review

## Run

```bash
# Run all visual tests
npx playwright test --project=visual

# Run specific test
npx playwright test --project=visual login.visual

# Update baselines (after intentional UI change)
npx playwright test --project=visual --update-snapshots

# Open HTML report (shows side-by-side diff for failures)
npx playwright show-report
```

## Add a New Test

1. Pick a stable, user-facing page (avoid pages mid-development)
2. Create `e2e/visual/<feature>.visual.spec.ts`
3. Use the pattern from `login.visual.spec.ts`:
   - Navigate to page
   - Wait for content to be ready (not skeleton)
   - `await expect(page).toHaveScreenshot('<descriptive-name>.png', { fullPage: true })`
4. Run once locally to generate baseline → commit the `__snapshots__/` files
5. Run again to verify baseline matches

## Mask Dynamic Content

Anything that changes between runs (timestamps, random IDs, charts) MUST be masked or it will cause false positives.

**Option 1: data attribute**

```tsx
<span data-visual-mask>{lastUpdated}</span>
```

The `screenshot.css` hides any `[data-visual-mask]` element during capture.

**Option 2: data-testid pattern**
Elements with `data-testid` containing `timestamp`, `last-updated`, or `created-at` are auto-masked.

**Option 3: per-test mask**

```ts
await expect(page).toHaveScreenshot('foo.png', {
  mask: [page.getByTestId('user-avatar')],
})
```

## Update Workflow

When you intentionally change a UI:

1. Make the code change
2. Run `npx playwright test --project=visual --update-snapshots`
3. **Review the diff in `__snapshots__/` git diff** — verify the change is what you intended
4. Commit the new baselines together with the code change

**Never** blindly run `--update-snapshots` to "fix" a failing test. The whole point of this is to make UI changes deliberate.

## CI Considerations

- Baselines are OS-specific (font rendering differs Mac/Linux/Windows)
- This config uses Chromium 1280×800 viewport for consistency
- CI should run on the same OS as where baselines were generated (Linux in GitHub Actions)
- First-time setup: generate baselines on Linux via `act` or a CI dry-run

## Tolerance Settings

Configured in `playwright.config.ts`:

- `maxDiffPixelRatio: 0.01` — allows up to 1% pixel difference (font hinting, anti-aliasing)
- All animations disabled via `screenshot.css`
- Caret blink disabled

If a test is flaky despite masking, increase tolerance for that test only:

```ts
await expect(page).toHaveScreenshot('foo.png', {
  maxDiffPixelRatio: 0.05, // 5% for this test
})
```

## What NOT to Visual-Test

- Pages mid-development (will break constantly)
- Pages with unmaskable dynamic content (real-time charts)
- Highly responsive layouts that vary by viewport (visual tests use FIXED viewport)
- Component-level UI (use Storybook/Chromatic for that)

Visual tests are for **page-level user-facing flows** that should be stable.
