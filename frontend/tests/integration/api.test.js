// @vitest-environment node
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { startLocalApi } from '../../../backend/tests/support/local-api.mjs';

vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: vi.fn() }));
vi.mock('../../src/services/auth', () => ({ authService: {} }));
import { fetchAuthSession } from 'aws-amplify/auth';
let server;
let api;
beforeEach(async () => {
  server = await startLocalApi();
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', server.url);
  fetchAuthSession.mockResolvedValue({ tokens: { idToken: 'test-alice' } });
  api = (await import('../../src/services/api')).budgetApi;
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await server.close(); });

it('real frontend API client sends authenticated HTTP requests through the Lambda handler', async () => {
  const category = await api.createCategory({ name: 'Travel', budget: 100 });
  const expense = await api.createExpense({ amount: 2.5, date: '2026-01-02', notes: 'Bus', categoryId: category.id });
  const loaded = await api.loadBudgetData();
  expect(loaded.expenses).toEqual([expense]);
  expect(loaded.categories).toEqual([category]);
  expect(server.client.commands[0].input.Item.PK).toBe('USER#alice');
  expect(await api.updateExpense({ ...expense, amount: 4 })).toMatchObject({ amount: 4 });
  expect(await api.updateCategory({ ...category, budget: 150 })).toMatchObject({ budget: 150 });
  expect(await api.updateSettings({ monthlySummary: true })).toMatchObject({ monthlySummary: true });
  await expect(api.deleteCategory(category.id)).rejects.toThrow('used by an expense');
  expect(await api.deleteExpense(expense.id)).toBeNull();
  expect(await api.deleteCategory(category.id)).toBeNull();
  expect((await api.loadBudgetData()).expenses).toEqual([]);
});

it('never sends a request without a session and propagates an unauthorized response', async () => {
  fetchAuthSession.mockResolvedValue({});
  await expect(api.loadBudgetData()).rejects.toThrow('session has expired');
  expect(server.client.commands).toHaveLength(0);
  fetchAuthSession.mockResolvedValue({ tokens: { idToken: 'forged' } });
  await expect(api.createCategory({ name: 'Food', budget: 1 })).rejects.toThrow('Unauthorized');
  expect(server.client.commands).toHaveLength(0);
});

it('encodes IDs and propagates validation/not-found failures', async () => {
  await expect(api.createExpense({ amount: -1, categoryId: 'food', date: '2026-01-01' })).rejects.toThrow('greater than zero');
  await expect(api.deleteExpense('missing/id')).rejects.toThrow('Item not found');
  expect(server.client.commands.at(-1).input.Key.SK).toBe('EXPENSE#missing/id');
});

it('reports missing configuration before sending requests', async () => {
  vi.resetModules(); vi.stubEnv('VITE_API_BASE_URL', '');
  const missing = (await import('../../src/services/api')).budgetApi;
  await expect(missing.createExpense({})).rejects.toThrow('configuration');
});

it('rejects malformed load shapes and handles network/non-JSON failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({}) }));
  await expect(api.loadBudgetData()).rejects.toThrow('unexpected data format');
  fetch.mockResolvedValue({ status: 503, ok: false, json: async () => { throw Error(); } });
  await expect(api.createExpense({})).rejects.toThrow('503');
  fetch.mockRejectedValue(Error('Network offline'));
  await expect(api.createExpense({})).rejects.toThrow('Network offline');
});

it('supports the locally proxied Lambda envelope response format', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ statusCode: 200, body: '{"id":"1"}' }) }));
  expect(await api.createExpense({})).toEqual({ id: '1' });
  fetch.mockResolvedValue({ status: 200, ok: true, json: async () => ({ statusCode: 204, body: '' }) });
  expect(await api.createExpense({})).toBeNull();
});
