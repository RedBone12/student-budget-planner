import test from 'node:test';
import assert from 'node:assert/strict';
import { startLocalApi } from './support/local-api.mjs';

test('HTTP API: CRUD, user isolation, settings and JSON errors through the real handler', async t => {
  const api = await startLocalApi();
  t.after(() => api.close());
  t.mock.method(console, 'error', () => {});
  const request = (path, method = 'GET', body, token = 'test-alice') => fetch(api.url + path, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal((await fetch(api.url + '/expenses')).status, 401);
  assert.equal((await request('/expenses', 'GET', undefined, 'forged')).status, 401);
  const categoryResponse = await request('/categories', 'POST', { name: 'Travel', budget: 50 });
  assert.equal(categoryResponse.status, 201);
  const category = await categoryResponse.json();
  const input = { amount: 3.25, date: '2026-01-02', categoryId: category.id, notes: 'Bus' };
  const createdResponse = await request('/expenses', 'POST', input);
  assert.equal(createdResponse.status, 201);
  const expense = await createdResponse.json();
  assert.equal(expense.amount, 3.25);
  assert.deepEqual(await (await request('/expenses', 'GET', undefined, 'test-bob')).json(), []);
  assert.equal((await request(`/expenses/${expense.id}`, 'DELETE', undefined, 'test-bob')).status, 404);
  const updated = await request(`/expenses/${expense.id}`, 'PUT', { ...input, amount: 4.5 });
  assert.equal((await updated.json()).amount, 4.5);
  assert.equal((await request(`/categories/${category.id}`, 'DELETE')).status, 400);
  assert.equal((await request('/settings', 'PATCH', { budgetAlerts: false, monthlySummary: true })).status, 200);
  assert.equal((await (await request('/settings')).json()).monthlySummary, true);
  const invalid = await fetch(api.url + '/expenses', { method: 'POST', headers: { Authorization: 'Bearer test-alice' }, body: '{oops' });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).message, /valid JSON/);
  const deleted = await request(`/expenses/${expense.id}`, 'DELETE');
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), '');
  assert.deepEqual(await (await request('/expenses')).json(), []);
  assert.equal((await request(`/categories/${category.id}`, 'DELETE')).status, 204);
  assert.equal((await request('/unknown')).status, 404);
});

test('HTTP API returns safe JSON on a DynamoDB outage', async t => {
  const api = await startLocalApi({ client: { send: async () => { throw new Error('internal storage secret'); } } });
  t.after(() => api.close());
  t.mock.method(console, 'error', () => {});
  const response = await fetch(api.url + '/expenses', { headers: { Authorization: 'Bearer test-alice' } });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: 'Unexpected server error' });
});
