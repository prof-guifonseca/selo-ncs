import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Utility to load a JSON fixture located in the tests/fixtures directory.
 * Using `path.resolve` here ensures the fixtures can be loaded regardless
 * of the current working directory when the tests are executed.
 *
 * @param name Fixture file name within tests/fixtures
 */
function loadFixture(name: string): any {
  const fullPath = path.resolve(__dirname, 'fixtures', name);
  const text = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(text);
}

/**
 * End‑to‑end test for the auditor dashboard tab navigation.  It simulates
 * an authenticated auditor user with a single assigned process, clicks
 * the “Carregar” button to load the first process and verifies that
 * switching between detail tabs updates aria attributes and active
 * classes correctly.  This prevents regressions where the UI would
 * remain stuck on the summary tab.
 */
test('auditor detail tabs can be switched without regression', async ({ page }) => {
  // Preload fixtures
  const meAuditor = loadFixture('me_auditor.json');
  const processes = loadFixture('processes_list.json');
  const processDetail = loadFixture('process_detail.json');

  // Intercept all API requests and serve fixtures based on the endpoint
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.match(/\/api\/auth\/me$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(meAuditor) });
    }
    if (url.match(/\/api\/processes(\?.*)?$/)) {
      // list processes
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(processes) });
    }
    if (url.match(/\/api\/processes\/[A-Za-z0-9-]+$/)) {
      // get process detail by id
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(processDetail) });
    }
    // fallback stub
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // Navigate directly to the auditor dashboard
  await page.goto('/dashboard/auditor');
  // Wait for the load first button to appear (Carregar)
  const loadButton = page.locator('button[data-action="auditor-load-first"]');
  await expect(loadButton).toBeVisible();
  // Click to load the first process (calls /api/processes and /api/processes/:id)
  await loadButton.click();
  // The detail view should now be visible
  const detailSection = page.locator('#auditor-process-detail');
  await expect(detailSection).toBeVisible();

  // Define the mapping of tabs to panels we want to verify
  const tabPanels = [
    { tab: '#auditor-tab-evidence', panel: '#auditor-panel-evidence' },
    { tab: '#auditor-tab-indicators', panel: '#auditor-panel-indicators' },
    { tab: '#auditor-tab-feedback', panel: '#auditor-panel-feedback' },
    { tab: '#auditor-tab-status', panel: '#auditor-panel-status' },
  ];
  // All tab ids we care about for aria assertions
  const allTabIds = [
    '#auditor-tab-summary',
    '#auditor-tab-evidence',
    '#auditor-tab-indicators',
    '#auditor-tab-feedback',
    '#auditor-tab-status',
  ];
  // All panel ids for class assertions
  const allPanelIds = [
    '#auditor-panel-summary',
    '#auditor-panel-evidence',
    '#auditor-panel-indicators',
    '#auditor-panel-feedback',
    '#auditor-panel-status',
  ];

  for (const { tab, panel } of tabPanels) {
    const tabLocator = page.locator(tab);
    await expect(tabLocator).toBeVisible();
    // Click the tab button
    await tabLocator.click();
    // After clicking, the clicked tab should be selected and tabbable
    await expect(tabLocator).toHaveAttribute('aria-selected', 'true');
    await expect(tabLocator).toHaveAttribute('tabindex', '0');
    // Other tabs should not be selected and should have tabindex -1
    for (const otherId of allTabIds) {
      if (otherId === tab) continue;
      const otherLocator = page.locator(otherId);
      await expect(otherLocator).toHaveAttribute('aria-selected', 'false');
      await expect(otherLocator).toHaveAttribute('tabindex', '-1');
    }
    // Verify that the corresponding panel is active and visible
    const panelLocator = page.locator(panel);
    await expect(panelLocator).toBeVisible();
    await expect(panelLocator).toHaveClass(/\bactive\b/);
    // Other panels should not have the active class
    for (const otherPanel of allPanelIds) {
      if (otherPanel === panel) continue;
      const otherPanelLocator = page.locator(otherPanel);
      await expect(otherPanelLocator).not.toHaveClass(/\bactive\b/);
    }
  }
});