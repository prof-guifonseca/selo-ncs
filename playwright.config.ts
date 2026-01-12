import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for the NCS front‑end.  This configuration
 * defines a static web server pointed at the compiled `dist` directory and
 * sets sensible defaults for running our E2E suite both locally and in CI.
 *
 * The server command runs `npm run build` to generate the latest assets and
 * then starts the zero‑dependency static server defined in `scripts/serve.mjs`.
 * Tests are written in TypeScript/JS under the `tests/` directory and rely
 * on the `baseURL` below for relative navigation.  The `reuseExistingServer`
 * option speeds up local runs by reusing a running server when present.
 */
export default defineConfig({
  testDir: './tests',
  /* Maximum time one test can run for. */
  timeout: 30 * 1000,
  /* Expect no assertions to take longer than this. */
  expect: { timeout: 5 * 1000 },
  /* Global test settings. */
  use: {
    /* Base URL used in navigate calls; matches the static server port. */
    baseURL: 'http://127.0.0.1:4173',
    /* Run in headless mode on CI to avoid the need for a display. */
    headless: !!process.env.CI,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },
  /* Static web server configuration. */
  webServer: {
    command: 'npm run build && node scripts/serve.mjs',
    port: 4173,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    env: { PORT: '4173' },
  },
});