import { test, expect } from '@playwright/test';

test('request insights, reopen cached analysis and follow evidence to filtered expenses', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('dana@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Password1');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze this month' }).click();
  await expect(page.getByText(/No significant patterns/)).toBeVisible();
  await page.getByRole('link', { name: 'Expenses', exact: true }).click();
  await page.getByLabel(/Amount/).fill('9999');
  await page.getByLabel(/Category/).fill('Groceries');
  await page.getByLabel(/Date/).fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel('Notes', { exact: true }).fill('Synthetic AI fixture');
  await page.getByRole('button', { name: 'Add Expense', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Synthetic AI fixture' })).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze this month' }).click();
  await expect(page.getByText(/AI analysis generated/)).toBeVisible();
  await page.getByRole('button', { name: 'Analyze this month' }).click();
  await expect(page.getByText(/Saved AI analysis/)).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Budget usage' }).click();
  await page.getByRole('link', { name: 'View matching expenses' }).click();
  await expect(page.getByLabel('Filter category')).not.toHaveValue('');
  await expect(page.getByLabel('From date', { exact: true })).toHaveValue(`${new Date().toISOString().slice(0, 7)}-01`);
  await expect(page.getByRole('cell', { name: 'Synthetic AI fixture' })).toBeVisible();
});
