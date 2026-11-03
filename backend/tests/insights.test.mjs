import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEvidence, modelPayload, parseExplanation, createInsights } from '../src/insights.mjs';
import { createHandler } from '../src/app.mjs';
import { memoryClient } from './support/local-api.mjs';

const now = () => new Date('2026-11-10T09:00:00Z');
const categories = [{ id: 'private-category', name: 'Private health details', budget: 20 }];
const expenses = ['08', '09', '10'].flatMap(month => [1, 2].map(n => ({ id: `${month}-${n}`, categoryId: categories[0].id, amount: 20, date: `2026-${month}-0${n}`, notes: 'Secret note' })))
  .concat([{ id: 'private-expense', categoryId: categories[0].id, amount: 120, date: '2026-11-02', notes: 'Secret current note' }, { id: 'future', categoryId: categories[0].id, amount: 999, date: '2026-11-30' }]);
const facts = calculateEvidence(expenses, categories, '2026-11-10');
const reply = { findings: [{ evidenceId: 'C1-unusual', explanation: 'This entry is larger than typical recorded entries and may be worth reviewing; its cause is unknown.' }], suggestions: [{ evidenceId: 'C1-suggestion', explanation: 'Historical spending may justify reviewing the category limit, provided the adjustment fits your circumstances.' }] };
const response = text => ({ output: { message: { content: [{ text }] } } });
function harness(options = {}) {
  const db = memoryClient(), calls = [];
  const modelClient = { async send(command) { calls.push(command); return response(JSON.stringify(reply)); } };
  return { db, calls, run: createInsights({ documentClient: db, tableName: 'test', modelClient, modelId: 'test-model', now, ...options }) };
}
test('calculations use cents, same elapsed days, complete-month history and median thresholds', () => {
  assert.equal(facts.evidence.length, 4);
  const anomaly = facts.evidence.find(row => row.kind === 'unusual');
  assert.equal(anomaly.spentCents, 12000); assert.equal(anomaly.medianCents, 2000); assert.equal(anomaly.sampleCount, 6);
  assert.equal(anomaly.previousCents, 4000); assert.equal(anomaly.averageCents, 4000);
  assert.equal(facts.evidence.find(row => row.kind === 'suggestion').proposedBudgetCents, 4000);
  assert.equal(calculateEvidence([], categories, '2026-01-02').comparisonMonth, '2025-12');
  assert.deepEqual(calculateEvidence([], categories, '2026-11-10').evidence, []);
  const late = [...expenses, { ...expenses[0], date: '2026-10-25', amount: 50 }];
  assert.equal(calculateEvidence(late, categories, '2026-11-10').evidence[0].previousCents, 4000);
  const noHistory = calculateEvidence(expenses.filter(row => row.date.startsWith('2026-11')), categories, '2026-11-10');
  assert.equal(noHistory.evidence.some(row => row.kind === 'unusual' || row.kind === 'suggestion'), false);
  assert.deepEqual(calculateEvidence(expenses, [], '2026-11-10').evidence, []);
});
test('model payload excludes private names, notes, raw IDs, dates and raw transactions', () => {
  const payload = JSON.stringify(modelPayload(facts));
  for (const value of ['Private health', 'private-category', 'private-expense', 'Secret', '2026-11-02']) assert.equal(payload.includes(value), false);
});
test('model output validates evidence references and bounded explanations with no invented numbers', () => {
  assert.deepEqual(parseExplanation('```json\n' + JSON.stringify(reply) + '\n```', facts), reply);
  for (const value of [{}, { findings: Array(4).fill(reply.findings[0]), suggestions: [] }, { ...reply, suggestions: Array(4).fill(reply.suggestions[0]) },
    { findings: [], suggestions: [] }, { findings: [reply.findings[0], reply.findings[0]], suggestions: [] },
    ...['Unknown', 'C1-suggestion'].map(evidenceId => ({ findings: [{ ...reply.findings[0], evidenceId }], suggestions: [] })),
    ...['Spend €20', 'Short', '<script>bad</script>', 'x'.repeat(401), 10].map(explanation => ({ findings: [{ evidenceId: 'C1-unusual', explanation }], suggestions: [] }))]) {
    assert.throws(() => parseExplanation(JSON.stringify(value), facts));
  }
});
test('successful analysis is cached per user and changes invalidate it', async () => {
  const { db, calls, run } = harness();
  const first = await run('USER#a', expenses, categories); assert.equal(first.mode, 'ai'); assert.equal(first.cached, false);
  assert.equal((await run('USER#a', expenses, categories)).cached, true); assert.equal(calls.length, 1);
  assert.equal((await run('USER#b', expenses, categories)).cached, false); assert.equal(calls.length, 2);
  assert.equal((await run('USER#a', [...expenses, { ...expenses[6], id: 'new' }], categories)).cached, false);
  assert.ok([...db.items.values()].every(row => row.expiresAt > 0));
});
test('empty evidence and disabled model never invoke AI; pending requests are deduplicated', async () => {
  assert.equal((await createInsights({ documentClient: memoryClient(), tableName: 'test' })('USER#clock', [], [])).mode, 'insufficient');
  const { calls, run } = harness();
  assert.equal((await run('USER#a', [], categories)).mode, 'insufficient'); assert.equal(calls.length, 0);
  const disabled = harness({ modelId: '' }); assert.equal((await disabled.run('USER#a', expenses, categories)).mode, 'unavailable');
  const failed = harness({ modelClient: { send: async () => { throw Error('Provider secret'); } } });
  assert.equal((await failed.run('USER#a', expenses, categories)).mode, 'unavailable');
  assert.equal((await failed.run('USER#a', expenses, categories)).mode, 'pending');
});
test('daily quota bounds calls for changed data and resets on the next UTC day', async () => {
  const { run, db, calls } = harness();
  for (let i = 0; i < 3; i++) assert.equal((await run('USER#a', expenses, [{ ...categories[0], name: `Name${i}` }])).mode, 'ai');
  assert.equal((await run('USER#a', expenses, [{ ...categories[0], name: 'Fourth' }])).mode, 'limited'); assert.equal(calls.length, 3);
  const next = createInsights({ documentClient: db, tableName: 'test', modelId: 'test-model', now: () => new Date('2026-11-11T00:00:00Z'), modelClient: { send: async () => response(JSON.stringify(reply)) } });
  assert.equal((await next('USER#a', expenses, categories)).mode, 'ai');
});
test('provider, schema and cache-write failures never masquerade as AI success', async () => {
  for (const modelClient of [{ send: async () => { throw Error('Denied'); } }, { send: async () => response('Not JSON') }, { send: async () => ({}) }]) {
    const { run } = harness({ modelClient }); assert.equal((await run('USER#a', expenses, categories)).mode, 'unavailable');
  }
  const { db, run } = harness(); const send = db.send.bind(db);
  db.send = async command => { if (command.input.Item?.result) throw Error('Storage failed'); return send(command); };
  assert.equal((await run('USER#a', expenses, categories)).mode, 'unavailable');
});
test('database outages propagate before model calls', async () => {
  for (const target of ['GetCommand', 'lease', 'quota']) {
    const { db, run, calls } = harness(); const send = db.send.bind(db);
    db.send = async command => {
      if (command.constructor.name === target || (target === 'lease' && command.input.Item?.SK.startsWith('INSIGHT#')) || (target === 'quota' && command.input.Item?.SK.startsWith('AIUSAGE#'))) throw Error('Outage');
      return send(command);
    };
    await assert.rejects(run('USER#a', expenses, categories), /Outage/); assert.equal(calls.length, 0);
  }
});
test('handler uses owned records and ignores caller-supplied financial facts', async () => {
  const db = memoryClient(); const handler = createHandler({ documentClient: db, tableName: 'test', now, modelId: 'test-model', modelClient: { send: async () => response(JSON.stringify(reply)) } });
  const event = (routeKey, body, sub = 'a') => ({ routeKey, body: JSON.stringify(body), requestContext: { authorizer: { jwt: { claims: { sub } } } } });
  const category = JSON.parse((await handler(event('POST /categories', { name: 'Food', budget: 20 }))).body);
  for (const expense of expenses) await handler(event('POST /expenses', { ...expense, categoryId: category.id }));
  assert.equal(JSON.parse((await handler(event('POST /insights', { expenses: [{ amount: 999999 }] }))).body).mode, 'ai');
  assert.equal(JSON.parse((await handler(event('POST /insights', {}, 'b'))).body).mode, 'insufficient');
});
