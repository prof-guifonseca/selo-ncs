import { test, expect } from '@playwright/test';

/**
 * Basic smoke test for the public landing page.  This test ensures the
 * application bootstraps without throwing any runtime errors in the
 * browser and that no console.error messages are emitted during load.
 *
 * All network requests to `/api/*` are stubbed with empty JSON
 * responses so the test does not depend on a live backend.
 */
test('landing page loads without severe console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  // Capture uncaught errors and console.error calls
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  // Stub backend API calls
  await page.route('**/api/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  // Navigate to root and wait for the navbar to appear
  await page.goto('/');
  await expect(page.locator('nav')).toBeVisible();
  // Assert no errors captured
  expect(consoleErrors).toEqual([]);
});