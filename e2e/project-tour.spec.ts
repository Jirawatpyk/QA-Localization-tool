// ATDD GREEN PHASE — Story 2.8: Project-level Onboarding Tour (E2E)
// All tests activated — ProjectTour.tsx + layout integration implemented.
//
// AC Coverage:
//   AC#1 — First-time project tour shows on project page
//   AC#2 — Returning user resumes at dismissed step
//   AC#3 — Mobile suppression (viewport < 768px)
//   Task 5 — "Restart Project Tour" in Help menu on project routes
//
// KEY FACTS:
//   - driver.js overlay selector: .driver-popover
//   - Tour resume is 0-indexed: dismissed_at_step (1-based) -> drive(step - 1) (0-based)
//   - Tour targets ProjectSubNav tabs: data-tour="project-glossary" and data-tour="project-files"
//   - ProjectTour renders inside project layout (not dashboard)

import { test, expect, type Page } from '@playwright/test'

import {
  createTestProject,
  getUserInfo,
  setUserMetadata,
  signupOrLogin,
} from './helpers/supabase-admin'

const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!'
const PROJECT_TOUR_EMAIL = process.env.E2E_PROJECT_TOUR_EMAIL || 'e2e-projtour28@test.local'
const PROJECT_TOUR_RETURNING_EMAIL =
  process.env.E2E_PROJECT_TOUR_RETURNING_EMAIL || 'e2e-projtour-return28@test.local'

// Module-level project IDs set by [setup] tests, shared across serial describe blocks
let ac1ProjectId: string
let ac2ProjectId: string

// Helper: login and navigate directly to a project page by ID
async function loginAndGoToProject(page: Page, email: string, password: string, projectId: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })

  // Navigate directly to the project URL — avoids dashboard link flakiness
  await page.goto(`/projects/${projectId}/upload`)
  await page.waitForURL(`**/projects/${projectId}/**`, { timeout: 10000 })
}

// AC#1 — First-time project tour activation
test.describe.serial('Project Tour — AC#1: First-time user', () => {
  test('[setup] create project tour user, project, and reset metadata', async ({ page }) => {
    test.setTimeout(60000)
    await signupOrLogin(page, PROJECT_TOUR_EMAIL, TEST_PASSWORD, 'Project Tour User')

    // Create a project and store its ID for direct navigation
    const userInfo = await getUserInfo(PROJECT_TOUR_EMAIL)
    if (!userInfo)
      throw new Error(
        `getUserInfo returned null for ${PROJECT_TOUR_EMAIL} — user not found in public.users`,
      )
    ac1ProjectId = await createTestProject(userInfo.tenantId, 'E2E Project Tour Test')

    // Set setup_tour_completed so the setup tour doesn't interfere
    // but leave project_tour_completed as null (first time)
    await setUserMetadata(PROJECT_TOUR_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
    })
  })

  test('[P1] should show driver.js overlay when entering a project for the first time', async ({
    page,
  }) => {
    await loginAndGoToProject(page, PROJECT_TOUR_EMAIL, TEST_PASSWORD, ac1ProjectId)
    await page.waitForLoadState('networkidle')

    // driver.js overlay must appear
    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).toBeVisible({ timeout: 10000 })
  })

  test('[P1] should show "Import Glossary" as the first tour step title', async ({ page }) => {
    await loginAndGoToProject(page, PROJECT_TOUR_EMAIL, TEST_PASSWORD, ac1ProjectId)
    await page.waitForLoadState('networkidle')

    const popoverTitle = page.locator('.driver-popover-title')
    await expect(popoverTitle).toBeVisible({ timeout: 10000 })
    await expect(popoverTitle).toContainText('Import Glossary')
  })

  test('[P2] should advance to step 2 ("Upload Files") when Next button is clicked', async ({
    page,
  }) => {
    await loginAndGoToProject(page, PROJECT_TOUR_EMAIL, TEST_PASSWORD, ac1ProjectId)
    await page.waitForLoadState('networkidle')

    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).toBeVisible({ timeout: 10000 })

    // Click Next button
    await page.locator('.driver-popover-next-btn').click()

    // Step 2 should show "Upload Files"
    const popoverTitle = page.locator('.driver-popover-title')
    await expect(popoverTitle).toContainText('Upload Files', { timeout: 5000 })
  })

  test('[P1] should NOT show project tour after completion', async ({ page }) => {
    // Set metadata as tour completed
    await setUserMetadata(PROJECT_TOUR_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })

    await loginAndGoToProject(page, PROJECT_TOUR_EMAIL, TEST_PASSWORD, ac1ProjectId)
    await page.waitForLoadState('networkidle')

    // Give tour time to appear if it's broken
    await page.waitForTimeout(2000)
    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).not.toBeVisible()
  })

  test('[P1] should close overlay when close/skip button is clicked', async ({ page }) => {
    // Reset metadata to trigger tour
    await setUserMetadata(PROJECT_TOUR_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
    })

    await loginAndGoToProject(page, PROJECT_TOUR_EMAIL, TEST_PASSWORD, ac1ProjectId)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.driver-popover')).toBeVisible({ timeout: 10000 })

    // Click the close/skip button
    await page.locator('.driver-popover-close-btn').click()

    // Overlay must disappear
    await expect(page.locator('.driver-popover')).not.toBeVisible({ timeout: 5000 })
  })
})

// AC#2 — Resume after dismiss
test.describe.serial('Project Tour — AC#2: Returning user resume', () => {
  test('[setup] create returning user with dismissed_at_step.project metadata', async ({
    page,
  }) => {
    test.setTimeout(60000)
    await signupOrLogin(page, PROJECT_TOUR_RETURNING_EMAIL, TEST_PASSWORD, 'Project Tour Returning')

    // Create a project and store its ID for direct navigation
    const userInfo = await getUserInfo(PROJECT_TOUR_RETURNING_EMAIL)
    if (!userInfo)
      throw new Error(
        `getUserInfo returned null for ${PROJECT_TOUR_RETURNING_EMAIL} — user not found in public.users`,
      )
    ac2ProjectId = await createTestProject(userInfo.tenantId, 'E2E Project Tour Return Test')

    // Set setup tour as completed + project tour dismissed at step 2
    await setUserMetadata(PROJECT_TOUR_RETURNING_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      dismissed_at_step: { project: 2 },
    })
  })

  test('[P1] should resume tour at step 2 for user who dismissed at step 2', async ({ page }) => {
    await loginAndGoToProject(page, PROJECT_TOUR_RETURNING_EMAIL, TEST_PASSWORD, ac2ProjectId)
    await page.waitForLoadState('networkidle')

    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).toBeVisible({ timeout: 10000 })

    // Tour must show step 2 title (NOT "Import Glossary" which is step 1)
    const popoverTitle = page.locator('.driver-popover-title')
    await expect(popoverTitle).toBeVisible()
    const title = await popoverTitle.textContent()
    expect(title).not.toBe('Import Glossary') // Step 1 — must NOT be shown
    // Step 2 should be "Upload Files"
    expect(title).toContain('Upload Files')
  })
})

// AC#3 — Mobile suppression
// serial: depends on PROJECT_TOUR_EMAIL user and ac1ProjectId created in AC#1 [setup]
test.describe.serial('Project Tour — AC#3: Mobile suppression', () => {
  test('[P1] should NOT show project tour on mobile viewport (< 768px)', async ({ page }) => {
    // Set viewport to mobile
    await page.setViewportSize({ width: 375, height: 667 })

    // Reset metadata to trigger tour if not suppressed
    await setUserMetadata(PROJECT_TOUR_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
    })

    // Navigate directly to the project — avoids dashboard link flakiness on mobile
    await loginAndGoToProject(page, PROJECT_TOUR_EMAIL, TEST_PASSWORD, ac1ProjectId)
    await page.waitForLoadState('networkidle')

    // Give tour time to appear if suppression is broken
    await page.waitForTimeout(2000)
    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).not.toBeVisible()
  })
})

// Task 5 — HelpMenu "Restart Project Tour" on project routes
test.describe('Project Tour — Task 5: Restart from Help menu', () => {
  test('[P2] should show "Restart Project Tour" in Help menu when on project page', async ({
    page,
  }) => {
    // User with completed project tour
    await setUserMetadata(PROJECT_TOUR_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })

    await loginAndGoToProject(page, PROJECT_TOUR_EMAIL, TEST_PASSWORD, ac1ProjectId)
    await page.waitForLoadState('networkidle')

    // Open help menu
    const helpMenuTrigger = page.getByTestId('help-menu-trigger')
    await expect(helpMenuTrigger).toBeVisible({ timeout: 10000 })
    await helpMenuTrigger.click()

    // "Restart Project Tour" option must be visible
    const restartProjectBtn = page.getByTestId('restart-project-tour-btn')
    await expect(restartProjectBtn).toBeVisible({ timeout: 5000 })
    await expect(restartProjectBtn).toContainText('Restart Project Tour')
  })

  test('[P2] should restart project tour from step 1 when "Restart Project Tour" is clicked', async ({
    page,
  }) => {
    await setUserMetadata(PROJECT_TOUR_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })

    await loginAndGoToProject(page, PROJECT_TOUR_EMAIL, TEST_PASSWORD, ac1ProjectId)
    await page.waitForLoadState('networkidle')

    // Open help menu and click Restart Project Tour
    await page.getByTestId('help-menu-trigger').click()
    await page.getByTestId('restart-project-tour-btn').click()

    // Wait for page refresh (router.refresh()) and tour to appear
    await page.waitForLoadState('networkidle')

    // Tour must restart from step 1 ("Import Glossary")
    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).toBeVisible({ timeout: 10000 })

    const popoverTitle = page.locator('.driver-popover-title')
    await expect(popoverTitle).toContainText('Import Glossary')
  })
})
