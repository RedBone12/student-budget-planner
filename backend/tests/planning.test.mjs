import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/app.mjs';
import { createMaintenance } from '../src/maintenance.mjs';
import { filterExpenses, nextOccurrence, normalizeRecurring, settlement, validDay, money } from '../src/planning.mjs';
import { memoryClient, startLocalApi } from './support/local-api.mjs';

const now = () => new Date('2026-11-01T09:00:00Z');
const expense = { amount: 12.5, categoryId: 'food', date: '2026-10-02', notes: 'Lunch' };
const event = (routeKey, body, id, sub = 'alice', claims = {}) => ({ routeKey, body: body === undefined ? undefined : JSON.stringify(body),
  pathParameters: { id }, requestContext: { authorizer: { jwt: { claims: { sub, email: `${sub}@example.com`, email_verified: 'true', ...claims } } } } });
const parse = response => JSON.parse(response.body);
async function setup(options = {}) {
  const client = memoryClient();
  const mail = [];
  const mailClient = { async send(command) { mail.push(command); return { MessageId: 'accepted-1', VerifiedForSendingStatus: true }; } };
  const handler = createHandler({ documentClient: client, tableName: 'test', sender: 'sender@example.com', now, mailClient, ...options });
  const category = parse(await handler(event('POST /categories', { name: 'Food', budget: 100 })));
  return { client, mail, mailClient, handler, category, row: { ...expense, categoryId: category.id } };
}
test('scheduled events reach maintenance, while an API body cannot impersonate the scheduler', async () => {
  const { handler, mail } = await setup();
  const result = await handler({ source: 'aws.events', 'detail-type': 'Scheduled Event', time: now().toISOString() });
  assert.deepEqual(result, { accounts: 1, date: '2026-11-01' });
  const snapshots = parse(await handler(event('GET /settlements')));
  assert.equal(snapshots[0].month, '2026-10');
  assert.equal(mail.length, 0);
  const forged = await handler({ routeKey: 'POST /settlements', body: JSON.stringify({ source: 'aws.events', 'detail-type': 'Scheduled Event' }) });
  assert.equal(forged.statusCode, 400);
  assert.equal(parse(forged).message, 'Authenticated user is missing');
});

test('filters combine category, inclusive date and amount boundaries; invalid ranges are rejected', () => {
  const rows = [expense, { ...expense, amount: 20 }, { ...expense, categoryId: 'rent' }, { ...expense, date: '2026-09-30' }];
  assert.equal(filterExpenses(rows, { categoryId: 'food', fromDate: '2026-10-02', toDate: '2026-10-02', minAmount: '12.50', maxAmount: '12.50' }).length, 1);
  assert.throws(() => filterExpenses(rows, { fromDate: '2026-02-30' }));
  assert.throws(() => filterExpenses(rows, { fromDate: '2026-02-02', toDate: '2026-01-01' }));
  assert.throws(() => filterExpenses(rows, { minAmount: 20, maxAmount: 10 }));
  assert.throws(() => money('1.234'));
  assert.throws(() => money(-1));
  assert.equal(validDay('2024-02-29'), true);
  assert.equal(validDay('2026-02-29'), false);
});
test('monthly schedules keep the original day through leap years and short months', () => {
  const rule = normalizeRecurring({ ...expense, startDate: '2024-01-31', frequency: 'monthly' });
  assert.equal(nextOccurrence(rule), '2024-02-29');
  assert.equal(nextOccurrence({ ...rule, nextDate: '2024-02-29' }), '2024-03-31');
  assert.equal(nextOccurrence({ ...rule, frequency: 'weekly', nextDate: '2024-12-30' }), '2025-01-06');
  assert.throws(() => normalizeRecurring({ ...expense, startDate: '2026-02-30', frequency: 'monthly' }));
  assert.throws(() => normalizeRecurring({ ...expense, startDate: '2026-01-01', endDate: '2025-01-01', frequency: 'monthly' }));
  assert.throws(() => normalizeRecurring({ ...expense, startDate: '2026-01-01', frequency: 'daily' }));
});
test('settlements use integer cents, include deleted categories and reject uncompleted months', () => {
  const result = settlement('2026-10', [expense, { ...expense, categoryId: 'deleted', amount: 2.35 }], [{ id: 'food', name: 'Food', budget: 100 }], '2026-11-01');
  assert.equal(result.spentCents, 1485);
  assert.equal(result.rows[1].remainingCents, -235);
  assert.throws(() => settlement('2026-11', [], [], '2026-11-01'));
});
test('CSV import is atomic, deduplicated, idempotent and isolated by user', async () => {
  const { handler, row, client } = await setup();
  const input = { importId: 'file-1', rows: [row, row], skipDuplicates: true };
  const first = await handler(event('POST /expenses/import', input));
  assert.equal(first.statusCode, 200);
  assert.equal(parse(first).imported, 1); assert.equal(parse(first).skipped, 1);
  assert.deepEqual(parse(await handler(event('POST /expenses/import', input))), parse(first));
  assert.equal(parse(await handler(event('POST /expenses/import', { ...input, importId: 'file-2' }))).imported, 0);
  assert.equal((await handler(event('POST /expenses/import', { ...input, rows: [{ ...row, amount: 2 }] }))).statusCode, 400);
  assert.equal((await handler(event('POST /expenses/import', { ...input, importId: 'other', rows: [row, { ...row, categoryId: 'foreign' }] }))).statusCode, 400);
  assert.equal((await handler(event('POST /expenses/import', input, undefined, 'bob'))).statusCode, 400);
  assert.equal((await handler(event('POST /expenses/import', { importId: 'empty', rows: [] }))).statusCode, 400);
  assert.equal((await handler(event('POST /expenses/import', { ...input, importId: 'future', rows: [{ ...row, date: '2099-01-01' }] }))).statusCode, 400);
  assert.equal(parse(await handler(event('GET /expenses'))).length, 1);
  assert.equal([...client.items.values()].filter(item => item.entityType === 'EXPENSE').length, 1);
  const duplicate = await handler(event('POST /expenses/import', { ...input, importId: 'allow-duplicates', skipDuplicates: false }));
  assert.equal(parse(duplicate).imported, 2);
});
test('import transaction errors never publish a partially imported batch', async t => {
  t.mock.method(console, 'error', () => {});
  const { handler, row, client } = await setup();
  const send = client.send.bind(client);
  client.send = async command => { if (command.constructor.name === 'TransactWriteCommand') throw Error('DynamoDB offline'); return send(command); };
  assert.equal((await handler(event('POST /expenses/import', { importId: 'failure', rows: [row] }))).statusCode, 500);
  assert.deepEqual(parse(await handler(event('GET /expenses'))), []);
});
test('recurring lifecycle generates each occurrence once and preserves owner isolation and pause', async () => {
  const { handler, row, category } = await setup();
  const rule = parse(await handler(event('POST /recurring', { ...row, startDate: '2026-10-01', endDate: '2026-11-01', frequency: 'monthly' })));
  assert.equal((await handler(event('DELETE /categories/{id}', undefined, category.id))).statusCode, 400);
  assert.equal(parse(await handler(event('POST /recurring/apply-due'))).created, 2);
  assert.equal(parse(await handler(event('POST /recurring/apply-due'))).created, 0);
  assert.equal(parse(await handler(event('GET /recurring')))[0].nextDate, '2026-12-01');
  assert.equal((await handler(event('DELETE /categories/{id}', undefined, category.id))).statusCode, 400);
  assert.equal((await handler(event('PUT /recurring/{id}', rule, rule.id, 'bob'))).statusCode, 400);
  assert.deepEqual(parse(await handler(event('GET /recurring', undefined, undefined, 'bob'))), []);
  const paused = parse(await handler(event('PUT /recurring/{id}', { ...rule, active: false }, rule.id)));
  assert.equal(paused.active, false);
  assert.equal(paused.nextDate, '2026-12-01');
  assert.equal((await handler(event('PUT /recurring/{id}', { ...rule, startDate: '2026-09-01' }, rule.id))).statusCode, 400);
  assert.equal((await handler(event('PUT /recurring/{id}', rule, 'missing'))).statusCode, 404);
  assert.equal((await handler(event('DELETE /recurring/{id}', undefined, rule.id))).statusCode, 204);
});
test('monthly snapshots are immutable after transactions or budget limits change', async () => {
  const { handler, row, category } = await setup();
  await handler(event('POST /expenses', row));
  const first = parse(await handler(event('POST /settlements', { month: '2026-10' })));
  await handler(event('PUT /categories/{id}', { name: 'Food', budget: 500 }, category.id));
  await handler(event('POST /expenses', { ...row, amount: 30 }));
  assert.deepEqual(parse(await handler(event('POST /settlements', { month: '2026-10' }))), first);
  assert.equal(parse(await handler(event('GET /settlements')))[0].PK, undefined);
  assert.deepEqual(parse(await handler(event('GET /settlements', undefined, undefined, 'bob'))), []);
});
test('email enrollment requires verified claims and SES identities; ignores arbitrary destination input', async t => {
  t.mock.method(console, 'error', () => {});
  const { handler, client, mail } = await setup();
  const input = { emailDeliveryEnabled: true, dailyReminder: true, emailRecipient: 'attacker@example.com' };
  assert.equal(parse(await handler(event('GET /email-status'))).ready, true);
  assert.equal((await handler(event('PATCH /settings', input, undefined, 'alice', { email_verified: 'false' }))).statusCode, 400);
  assert.equal((await handler(event('PATCH /settings', input))).statusCode, 200);
  assert.equal([...client.items.values()].find(item => item.SK === 'SETTINGS').emailRecipient, 'alice@example.com');
  assert.equal(parse(await handler(event('GET /settings'))).emailRecipient, undefined);
  await handler(event('PATCH /settings', { emailDeliveryEnabled: false }));
  assert.equal([...client.items.values()].find(item => item.SK === 'SETTINGS').emailRecipient, undefined);
  assert.ok(mail.every(command => command.constructor.name === 'GetEmailIdentityCommand'));
  const unverified = createHandler({ documentClient: client, tableName: 'test', sender: 'sender@example.com',
    mailClient: { send: async () => { throw Object.assign(Error(), { name: 'NotFoundException' }); } } });
  assert.equal(parse(await unverified(event('GET /email-status'))).ready, false);
  assert.equal((await unverified(event('PATCH /settings', input))).statusCode, 400);
});
test('scheduled maintenance closes the month, adds due entries and suppresses duplicate mail across retries', async () => {
  const { handler, row, client, mailClient, mail } = await setup();
  await handler(event('POST /recurring', { ...row, startDate: '2026-10-01', frequency: 'monthly', amount: 90 }));
  await handler(event('PATCH /settings', { emailDeliveryEnabled: true, dailyReminder: true, monthlySummary: true, budgetAlerts: true }));
  const worker = createMaintenance({ documentClient: client, tableName: 'test', mailClient, sender: 'sender@example.com', now });
  await worker.scheduled({ time: now().toISOString() });
  await worker.scheduled({ time: now().toISOString() });
  const sent = mail.filter(command => command.constructor.name === 'SendEmailCommand');
  assert.equal(sent.length, 3);
  assert.ok(sent.every(command => command.input.Destination.ToAddresses[0] === 'alice@example.com'));
  assert.equal([...client.items.values()].filter(item => item.entityType === 'EXPENSE').length, 2);
  assert.equal([...client.items.values()].filter(item => item.entityType === 'SETTLEMENT').length, 1);
  assert.equal(parse(await handler(event('GET /email-status'))).history.length, 3);
});
test('legacy mail preference flags without explicit delivery opt-in never send mail', async () => {
  const { handler, client, mailClient, mail } = await setup();
  await handler(event('PATCH /settings', { dailyReminder: true, monthlySummary: true, budgetAlerts: true }));
  const worker = createMaintenance({ documentClient: client, tableName: 'test', mailClient, sender: 'sender@example.com', now });
  await worker.scheduled({ time: now().toISOString() });
  assert.equal(mail.filter(command => command.constructor.name === 'SendEmailCommand').length, 0);
});
test('mail provider failures persist FAILED and retry without falsely reporting delivery', async t => {
  t.mock.method(console, 'error', () => {});
  const { handler, client } = await setup();
  await handler(event('PATCH /settings', { emailDeliveryEnabled: true, dailyReminder: true }));
  let fail = true; let sends = 0;
  const worker = createMaintenance({ documentClient: client, tableName: 'test', sender: 'sender@example.com', now,
    mailClient: { async send() { sends++; if (fail) throw Object.assign(Error('SES unavailable'), { name: 'MessageRejected' }); return { MessageId: 'ok' }; } } });
  await assert.rejects(worker.scheduled(), /Maintenance failed/);
  assert.equal([...client.items.values()].find(item => item.entityType === 'MAIL').status, 'FAILED');
  fail = false; await worker.scheduled(); await worker.scheduled();
  assert.equal(sends, 2);
  assert.equal([...client.items.values()].find(item => item.entityType === 'MAIL').status, 'ACCEPTED');
});
test('HTTP API supports combined filters, recurring and import endpoints', async t => {
  const api = await startLocalApi(); t.after(() => api.close());
  const request = (path, method = 'GET', body) => fetch(api.url + path, { method, headers: { Authorization: 'Bearer test-alice' }, body: body && JSON.stringify(body) });
  const category = await (await request('/categories', 'POST', { name: 'Food', budget: 10 })).json();
  await request('/expenses/import', 'POST', { importId: 'http', rows: [{ ...expense, categoryId: category.id }] });
  const filtered = await request(`/expenses?categoryId=${category.id}&minAmount=12.50&maxAmount=12.50&fromDate=2026-10-02`);
  assert.equal((await filtered.json()).length, 1);
  assert.equal((await (await request('/recurring')).json()).length, 0);
  assert.equal((await request('/recurring/apply-due', 'POST')).status, 200);
});

test('recurring transaction conflicts stop safely and database outages propagate', async () => {
  const { handler, row, client } = await setup();
  await handler(event('POST /recurring', { ...row, startDate: '2026-11-01', frequency: 'monthly' }));
  const send = client.send.bind(client);
  let conflict = true;
  client.send = async command => {
    if (command.constructor.name === 'TransactWriteCommand') throw Object.assign(Error(), { name: conflict ? 'TransactionCanceledException' : 'ThrottlingException' });
    return send(command);
  };
  const worker = createMaintenance({ documentClient: client, tableName: 'test', now });
  assert.equal((await worker.applyDue('USER#alice')).created, 0);
  assert.equal([...client.items.values()].filter(item => item.entityType === 'EXPENSE').length, 0);
  conflict = false; await assert.rejects(worker.applyDue('USER#alice'));
  const empty = createMaintenance({ documentClient: memoryClient(), tableName: 'test' });
  assert.deepEqual(await empty.applyDue('USER#nobody'), { created: 0 });
});

test('a concurrent month close returns the winning snapshot and other storage errors propagate', async () => {
  const { client } = await setup(); const send = client.send.bind(client);
  const winner = { month: '2026-10', budgetCents: 10000, spentCents: 0, rows: [] };
  let conflict = true;
  client.send = async command => {
    if (command.constructor.name === 'PutCommand' && command.input.Item.entityType === 'SETTLEMENT') {
      if (conflict) {
        client.items.set(JSON.stringify(['USER#alice', 'SETTLEMENT#2026-10']), { ...command.input.Item, ...winner });
        throw Object.assign(Error(), { name: 'ConditionalCheckFailedException' });
      }
      throw Error('Storage unavailable');
    }
    return send(command);
  };
  const worker = createMaintenance({ documentClient: client, tableName: 'test', now });
  assert.equal((await worker.closeMonth('USER#alice', '2026-10')).spentCents, 0);
  client.items.delete(JSON.stringify(['USER#alice', 'SETTLEMENT#2026-10'])); conflict = false;
  await assert.rejects(worker.closeMonth('USER#alice', '2026-10'), /Storage/);
});

test('email reservation failure prevents sending, and ambiguous acceptance is never resent automatically', async t => {
  t.mock.method(console, 'error', () => {});
  const { handler, client } = await setup();
  await handler(event('PATCH /settings', { emailDeliveryEnabled: true, dailyReminder: true }));
  const send = client.send.bind(client); let reservationFails = true; let count = 0;
  client.send = async command => {
    if (command.constructor.name === 'PutCommand' && command.input.Item.entityType === 'MAIL') {
      if (reservationFails || command.input.Item.status === 'ACCEPTED') throw Error('Storage unavailable');
    }
    return send(command);
  };
  const worker = createMaintenance({ documentClient: client, tableName: 'test', sender: 'sender@example.com', now,
    mailClient: { send: async () => { count++; return { MessageId: 'already-accepted' }; } } });
  await assert.rejects(worker.scheduled()); assert.equal(count, 0);
  reservationFails = false;
  await assert.rejects(worker.scheduled()); assert.equal(count, 1);
  assert.equal([...client.items.values()].find(item => item.entityType === 'MAIL').status, 'SENDING');
  await worker.scheduled(); assert.equal(count, 1);
});
