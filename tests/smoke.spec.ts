import { test, expect } from '@playwright/test';

test('has title and dashboard cards', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Gravel/);

  // Check if main dashboard header is present
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // Check for main cards
  await expect(page.getByText('Ritmo de Gastos')).toBeVisible();
  await expect(page.getByText('Patrimônio Líquido')).toBeVisible();
  await expect(page.getByText('Resultado Mensal')).toBeVisible();
});
