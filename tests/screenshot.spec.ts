import { test } from '@playwright/test';

test('take screenshots of main pages', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/dashboard.png', fullPage: true });

  await page.goto('/recurring');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/recurring.png', fullPage: true });

  await page.goto('/recurring/income');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/income.png', fullPage: true });

  await page.goto('/recurring/expenses');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/expenses.png', fullPage: true });
});
