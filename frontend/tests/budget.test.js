import test from 'node:test';
import assert from 'node:assert/strict';
import { readExpenseCsv, filteredExpenses, emptyFilters, filterError } from '../src/utils/budget.js';
const categories = [{ id: 'food', name: 'Food' }];
test('CSV parser handles BOM, CRLF, quoted commas, quotes and multiline notes', () => {
  const rows = readExpenseCsv('\uFEFFdate,category,amount,notes\r\n2026-01-02,Food,1.25,"Cafe, ""nice""\nLunch"\r\n', categories);
  assert.equal(rows[0].notes, 'Cafe, "nice"\nLunch');
  for (const csv of ['date,category,amount,notes\n2026-02-30,Food,1,X', 'date,category,amount,notes\n2026-01-02,Unknown,1,X',
    'date,category,amount,notes\n2026-01-02,Food,-1,X', 'date,category,amount,notes\n2026-01-02,Food,1.111,X',
    'date,category,amount,notes\n2026-01-02,Food,1,"unclosed', 'wrong', 'date,category,amount,notes',
    'date,category,amount,notes\n2026-01-02,Food,1', 'date,category,amount,notes\n2026-01-02,Food,1,"x"bad']) {
    assert.throws(() => readExpenseCsv(csv, categories));
  }
  assert.throws(() => readExpenseCsv('date,category,amount,notes\n' + '2026-01-02,Food,1,X\n'.repeat(51), categories));
});
test('amount/date/category filters combine inclusively without mutating input', () => {
  const rows = [{ date: '2026-01-02', categoryId: 'food', amount: 12.5 }];
  assert.equal(filteredExpenses(rows, { ...emptyFilters, categoryId: 'food', fromDate: '2026-01-02', toDate: '2026-01-02', minAmount: '12.50', maxAmount: '12.50' }).length, 1);
  assert.ok(filterError({ ...emptyFilters, minAmount: '1.111' }));
  assert.ok(filterError({ ...emptyFilters, fromDate: '2026-02-01', toDate: '2026-01-01' }));
  assert.equal(filteredExpenses(rows, { ...emptyFilters, minAmount: '20', maxAmount: '10' }).length, 0);
  assert.equal(rows.length, 1);
});
