import { test, expect } from '@playwright/test';

test('login, add/edit, reload, switch accounts, delete and logout through the local API', async ({ page }) => {
  // Fail if this fixture-backed journey attempts to contact a non-local service.
  await page.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    return host === '127.0.0.1' ? route.continue() : route.abort();
  });
  const login = async email => {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Password1');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/home$/);
    await page.getByRole('link', { name: 'Expenses', exact: true }).click();
  };
  await page.goto('/app/expenses');
  await expect(page).toHaveURL(/\/login$/);
  await login('alice@example.com');
  await expect(page.getByText('No expenses recorded yet.')).toBeVisible();
  await page.getByLabel(/Amount/).fill('12.50');
  await page.getByLabel(/Category/).fill('Groceries');
  await page.getByLabel(/Date/).fill('2026-01-02');
  await page.getByLabel('Notes', { exact: true }).fill('E2E lunch');
  await page.getByRole('button', { name: 'Add Expense', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'E2E lunch' });
  await expect(row).toContainText('12.50');
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel(/Amount/).fill('18.75');
  await page.getByRole('button', { name: 'Save Expense', exact: true }).click();
  await expect(row).toContainText('18.75');
  await page.reload();
  await expect(row).toContainText('18.75');
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await login('bob@example.com');
  await expect(page.getByText('No expenses recorded yet.')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'E2E lunch' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await login('alice@example.com');
  await expect(row).toContainText('18.75');
  page.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('No expenses recorded yet.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('No expenses recorded yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await page.goto('/app/expenses');
  await expect(page).toHaveURL(/\/login$/);
});
