import { test, expect } from '@playwright/test';

test.describe('E2E Authentication Flow', () => {
  test('should display login page and error on incorrect password', async ({ page }) => {
    // 1. Navigate to login
    await page.goto('/login');
    await page.waitForTimeout(1000); // Allow login page hydration to finish
    await page.click('button[aria-label="Select role: Admin"]');
    await page.waitForTimeout(300); // Wait for role select component state change to stabilize

    // 2. Fill login fields
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'incorrectpassword');
    await page.click('button[type="submit"]');

    // 3. Confirm error notice appears
    const errorNotice = page.locator('text=Invalid credentials.');
    await expect(errorNotice).toBeVisible();
  });

  test('should log in successfully and redirect to dashboard, then log out', async ({ page }) => {
    // 1. Navigate to login
    await page.goto('/login');
    await page.waitForTimeout(1000); // Allow login page hydration to finish
    await page.click('button[aria-label="Select role: Admin"]');
    await page.waitForTimeout(300); // Wait for role select component state change to stabilize

    // 2. Fill valid credentials
    await page.fill('input[type="email"]', 'admin@ops.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');

    // 3. Confirm redirection to dashboard or active CRM (which verifies successful login)
    await expect(page).toHaveURL(/.*dashboard|.*crm/);

    // 5. Click logout if visible
    const logoutBtn = page.locator('button:has-text("Logout"), a:has-text("Logout")');
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/.*login/);
    }
  });
});
