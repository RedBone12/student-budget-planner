import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/app.mjs';
import { memoryClient } from './support/local-api.mjs';

const expense = { amount: 12.34, categoryId: 'food', date: '2026-01-02', notes: 'Lunch' };
const event = (routeKey, body, id, subject = 'alice') => ({
  routeKey, body: body === undefined ? undefined : JSON.stringify(body),
  pathParameters: { id }, requestContext: { authorizer: { jwt: { claims: { sub: subject } } } },
});
const setup = () => {
  const client = memoryClient();
  return { client, handler: createHandler({ documentClient: client, tableName: 'test-table' }) };
};
const body = result => JSON.parse(result.body);

test('missing Cognito subject is rejected before DynamoDB, including body identity', async t => {
  t.mock.method(console, 'error', () => {});
  const { handler, client } = setup();
  for (const request of [
    { routeKey: 'GET /expenses' },
    { ...event('POST /expenses', { ...expense, sub: 'alice' }), requestContext: { authorizer: { jwt: { claims: { email: 'alice@example.com' } } } } },
    event('GET /expenses', undefined, undefined, ''),
    event('GET /expenses', undefined, undefined, '   '),
    event('GET /expenses', undefined, undefined, { sub: 'alice' }),
    event('GET /expenses', undefined, undefined, 123),
  ]) {
    const result = await handler(request);
    assert.equal(result.statusCode, 400);
    assert.match(body(result).message, /Authenticated user is missing/);
  }
  assert.equal(client.commands.length, 0);
});

test('expense lifecycle uses claim sub, integer cents and conditional writes', async () => {
  const { handler, client } = setup();
  const created = await handler(event('POST /expenses', { ...expense, PK: 'USER#bob', id: 'forged' }));
  assert.equal(created.statusCode, 201);
  assert.equal(created.headers['Content-Type'], 'application/json');
  const saved = body(created);
  assert.notEqual(saved.id, 'forged');
  assert.equal(saved.amount, 12.34);
  assert.equal(client.commands[0].input.Item.PK, 'USER#alice');
  assert.equal(client.commands[0].input.TableName, 'test-table');
  assert.equal(client.commands[0].input.Item.amountCents, 1234);
  assert.match(client.commands[0].input.ConditionExpression, /attribute_not_exists/);
  const updated = await handler(event('PUT /expenses/{id}', { ...expense, amount: 21 }, saved.id));
  assert.equal(body(updated).amount, 21);
  assert.match(client.commands.at(-1).input.ConditionExpression, /attribute_exists/);
  const deleted = await handler(event('DELETE /expenses/{id}', undefined, saved.id));
  assert.equal(deleted.statusCode, 204);
  assert.equal(deleted.body, '');
  assert.deepEqual(body(await handler(event('GET /expenses'))), []);
});

test('list responses are sorted and do not leak storage keys', async () => {
  const { handler } = setup();
  await handler(event('POST /expenses', expense));
  await handler(event('POST /expenses', { ...expense, date: '2026-01-03' }));
  const rows = body(await handler(event('GET /expenses')));
  assert.deepEqual(rows.map(row => row.date), ['2026-01-03', '2026-01-02']);
  assert.equal(rows[0].PK, undefined);
  assert.equal(rows[0].amountCents, undefined);
});

test('claim sub isolates reads, updates and deletes between users', async t => {
  t.mock.method(console, 'error', () => {});
  const { handler } = setup();
  const saved = body(await handler(event('POST /expenses', expense)));
  assert.deepEqual(body(await handler(event('GET /expenses', undefined, undefined, 'bob'))), []);
  assert.equal((await handler(event('PUT /expenses/{id}', expense, saved.id, 'bob'))).statusCode, 404);
  assert.equal((await handler(event('DELETE /expenses/{id}', undefined, saved.id, 'bob'))).statusCode, 404);
  assert.equal(body(await handler(event('GET /expenses'))).length, 1);
});

test('category lifecycle prevents deleting an expense-linked category', async t => {
  t.mock.method(console, 'error', () => {});
  const { handler } = setup();
  const category = body(await handler(event('POST /categories', { name: 'Food', budget: 100 })));
  const updated = await handler(event('PUT /categories/{id}', { name: 'Meals', budget: 120 }, category.id));
  assert.equal(body(updated).budget, 120);
  assert.equal(body(await handler(event('GET /categories')))[0].name, 'Meals');
  const saved = body(await handler(event('POST /expenses', { ...expense, categoryId: category.id })));
  assert.equal((await handler(event('DELETE /categories/{id}', undefined, category.id))).statusCode, 400);
  await handler(event('DELETE /expenses/{id}', undefined, saved.id));
  assert.equal((await handler(event('DELETE /categories/{id}', undefined, category.id))).statusCode, 204);
});

test('settings have defaults and are persisted per subject', async () => {
  const { handler } = setup();
  const defaults = body(await handler(event('GET /settings')));
  assert.equal(defaults.budgetAlerts, true);
  const settings = { monthlySummary: true, budgetAlerts: false, dailyReminder: true, transactionNotifications: false };
  assert.deepEqual(body(await handler(event('PATCH /settings', settings))), settings);
  assert.deepEqual(body(await handler(event('GET /settings'))), settings);
  assert.deepEqual(body(await handler(event('GET /settings', undefined, undefined, 'bob'))), defaults);
});

test('bad JSON, invalid inputs, missing IDs and unknown routes return client errors', async t => {
  t.mock.method(console, 'error', () => {});
  const { handler, client } = setup();
  assert.equal((await handler({ ...event('POST /expenses'), body: '{bad json' })).statusCode, 400);
  for (const value of [null, [], 'text', 123, true]) {
    assert.equal((await handler(event('POST /expenses', value))).statusCode, 400);
    assert.equal((await handler(event('PATCH /settings', value))).statusCode, 400);
  }
  for (const request of [event('POST /expenses', { ...expense, amount: -1 }),
    event('POST /categories', { name: 'Food', budget: -1 }), event('PUT /expenses/{id}', expense),
    event('DELETE /expenses/{id}', undefined, 'x'.repeat(101))]) {
    assert.equal((await handler(request)).statusCode, 400);
  }
  assert.equal((await handler(event('GET /unknown'))).statusCode, 404);
  assert.equal(client.commands.length, 0);
});

test('conditional failures become 404 and DynamoDB failures become redacted 500 responses', async t => {
  const log = t.mock.method(console, 'error', () => {});
  for (const [name, expected] of [['ConditionalCheckFailedException', 404], ['ProvisionedThroughputExceededException', 500], ['AccessDeniedException', 500]]) {
    const handler = createHandler({ tableName: 'test-table', documentClient: {
      async send() { throw Object.assign(new Error('private table credentials'), { name }); },
    } });
    const result = await handler(event('POST /expenses', expense));
    assert.equal(result.statusCode, expected);
    assert.doesNotMatch(result.body, /credentials|test-table/);
  }
  assert.equal(log.mock.calls.length, 3);
});

test('empty DynamoDB query results return an empty array', async () => {
  const handler = createHandler({ tableName: 'test-table', documentClient: { send: async () => ({}) } });
  assert.deepEqual(body(await handler(event('GET /expenses'))), []);
});
