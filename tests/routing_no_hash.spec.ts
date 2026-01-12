import { test, expect } from '@playwright/test';

/**
 * Verifies that clicking the login/portal link on the landing page
 * navigates to the `/login` path without introducing a hash (`#`) in the
 * URL.  All API calls are intercepted with empty fixtures so the test
 * does not depend on a running backend.
 */
test('navigation to login does not pollute URL with hash', async ({ page }) => {
  // Stub all API endpoints with empty JSON responses
  await page.route('**/api/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  // Open the landing page
  await page.goto('/');
  // Find the login link (portal CTA). It is the only <a> pointing at /login.
  const loginLink = page.locator('a[href="/login"]');
  await expect(loginLink).toBeVisible();
  // Click the link and wait for navigation
  await loginLink.click();
  await page.waitForLoadState('domcontentloaded');
  // Ensure the resulting URL does not contain a hash fragment
  const url = page.url();
  expect(url.includes('#')).toBeFalsy();
  // Also verify we are on the /login route
  expect(url.endsWith('/login')).toBeTruthy();
});