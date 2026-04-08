import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'blob' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/visual/**',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Visual regression — fixed viewport, screenshot comparison
      // Run: npx playwright test --project=visual
      // Update baselines: npx playwright test --project=visual --update-snapshots
      name: 'visual',
      testMatch: '**/visual/**/*.visual.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        // Disable animations for stable screenshots
        launchOptions: {
          args: ['--force-prefers-reduced-motion'],
        },
      },
      expect: {
        toHaveScreenshot: {
          // Allow tiny rendering differences (font hinting, anti-aliasing)
          maxDiffPixelRatio: 0.01,
          // CSS-level mask for dynamic content (timestamps, randomized IDs)
          stylePath: './e2e/visual/screenshot.css',
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
})
