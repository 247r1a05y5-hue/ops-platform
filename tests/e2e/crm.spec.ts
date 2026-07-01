import { test, expect } from '@playwright/test';

test.describe('CRM Pipeline E2E Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Log in
    await page.goto('/login');
    await page.waitForTimeout(1000); // Allow login page hydration to finish
    await page.click('button[aria-label="Select role: Admin"]');
    await page.waitForTimeout(300); // Wait for role select component state change to stabilize
    await page.fill('input[type="email"]', 'admin@ops.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard|.*crm/);
  });

  test('should load the CRM pipeline columns', async ({ page }) => {
    // Navigate directly to CRM
    await page.goto('/crm');
    await page.waitForTimeout(1000); // Allow React hydration to complete

    // Confirm that pipeline stage boards exist (e.g. Discovery, Proposal, Closing)
    // or the "No Leads Found" empty state card is displayed.
    const noLeadsText = page.locator('text=No Leads Found').first();
    const discoveryHeader = page.locator('text=Discovery').first();
    
    const isEmpty = await noLeadsText.isVisible();
    if (isEmpty) {
      await expect(noLeadsText).toBeVisible();
    } else {
      await expect(discoveryHeader).toBeVisible();
      const closingHeader = page.locator('text=Closing').first();
      await expect(closingHeader).toBeVisible();
    }
  });

  test('should open add lead modal and create a new lead', async ({ page }) => {
    await page.goto('/crm');
    await page.waitForTimeout(1000); // Allow React hydration to complete

    // Click "Add Lead" button
    const addLeadBtn = page.locator('button:has-text("Add Lead"), span:has-text("Add Lead")').first();
    await addLeadBtn.click();

    // Fill in Lead details in modal inputs using exact placeholders
    await page.fill('input[placeholder="e.g. Sarah Jenkins"]', 'E2E Automated Lead');
    await page.fill('input[placeholder="sarah@company.com"]', 'e2e-lead@test.com');
    await page.fill('input[placeholder="Acme Inc"]', 'Playwright Automated Corp');
    await page.fill('input[placeholder="5000"]', '10000');

    // Submit Lead Modal
    const submitBtn = page.locator('button:has-text("Create Lead")').first();
    await submitBtn.click();

    // Verify lead name appears on the board page
    const newLeadName = page.locator('text=E2E Automated Lead').first();
    await expect(newLeadName).toBeVisible();
  });
});
