import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryForClient,
  InputError,
  normalizeCategory,
  normalizeExpense,
  parseBody,
  userPartitionKey,
} from '../src/domain.mjs';

test('uses the Cognito subject as the user partition key', () => {
  assert.equal(userPartitionKey('abc-123'), 'USER#abc-123');
});

test('converts decimal expense amounts to integer cents', () => {
  const expense = normalizeExpense({
    amount: '12.34',
    categoryId: 'food',
    date: '2026-09-14',
    notes: 'Lunch',
  }, 'expense-1');
  assert.equal(expense.amountCents, 1234);
  assert.equal(expense.id, 'expense-1');
});

test('rejects invalid expense input', () => {
  assert.throws(
    () => normalizeExpense({ amount: 0, categoryId: '', date: '14/09/2026' }),
    InputError,
  );
});

test('normalizes category budgets and returns the frontend shape', () => {
  const stored = normalizeCategory({ name: ' Rent ', budget: '800.25' }, 'rent');
  assert.deepEqual(categoryForClient(stored), {
    id: 'rent',
    name: 'Rent',
    budget: 800.25,
  });
});

test('rejects malformed JSON', () => {
  assert.throws(() => parseBody('{bad json'), InputError);
});
