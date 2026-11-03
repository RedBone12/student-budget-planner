import { InputError, normalizeExpense } from './domain.mjs';

export const utcDay = (date = new Date()) => date.toISOString().slice(0, 10);
export function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function money(value, field = 'amount', allowZero = false) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value)) || !Number.isFinite(Number(value)) ||
      Number(value) > 999999999.99 || (allowZero ? Number(value) < 0 : Number(value) <= 0)) {
    throw new InputError(`${field} must have up to two decimals and be ${allowZero ? 'zero or ' : ''}greater than zero`);
  }
  return Math.round(Number(value) * 100);
}
export function filterExpenses(expenses, filters = {}) {
  const { fromDate = '', toDate = '', categoryId = '', minAmount = '', maxAmount = '' } = filters;
  if ((fromDate && !validDay(fromDate)) || (toDate && !validDay(toDate)) || (fromDate && toDate && fromDate > toDate)) {
    throw new InputError('Enter a valid date range');
  }
  const min = minAmount === '' ? 0 : money(minAmount, 'Minimum amount', true);
  const max = maxAmount === '' ? Infinity : money(maxAmount, 'Maximum amount', true);
  if (min > max) throw new InputError('Minimum amount must not exceed maximum amount');
  return expenses.filter(expense => (!fromDate || expense.date >= fromDate) && (!toDate || expense.date <= toDate) &&
    (!categoryId || expense.categoryId === categoryId) && Math.round(expense.amount * 100) >= min && Math.round(expense.amount * 100) <= max);
}
export function normalizeRecurring(input, id = crypto.randomUUID()) {
  if (!validDay(input.startDate) || (input.endDate && (!validDay(input.endDate) || input.endDate < input.startDate))) {
    throw new InputError('Enter a valid recurring date range');
  }
  if (!['monthly', 'weekly'].includes(input.frequency)) throw new InputError('Frequency must be monthly or weekly');
  const expense = normalizeExpense({ ...input, date: input.startDate }, id);
  money(input.amount);
  return { ...expense, startDate: input.startDate, endDate: input.endDate || '',
    frequency: input.frequency, active: input.active !== false, nextDate: input.startDate,
    anchorDay: Number(input.startDate.slice(8)), revision: crypto.randomUUID() };
}
export function nextOccurrence(rule) {
  const date = new Date(`${rule.nextDate}T00:00:00Z`);
  if (rule.frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  else {
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(rule.anchorDay, last));
  }
  return utcDay(date);
}
export function previousMonth(today) {
  const date = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}
export function settlement(month, expenses, categories, today = utcDay()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month >= today.slice(0, 7)) {
    throw new InputError('Only completed calendar months can be settled');
  }
  const selected = expenses.filter(item => item.date.startsWith(`${month}-`));
  const rows = categories.map(category => {
    const spentCents = selected.filter(item => item.categoryId === category.id).reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
    const budgetCents = Math.round(category.budget * 100);
    return { categoryId: category.id, name: category.name, budgetCents, spentCents, remainingCents: budgetCents - spentCents };
  });
  const known = new Set(categories.map(item => item.id));
  for (const item of selected.filter(item => !known.has(item.categoryId))) {
    let row = rows.find(row => row.categoryId === item.categoryId);
    if (!row) { row = { categoryId: item.categoryId, name: 'Deleted category', budgetCents: 0, spentCents: 0, remainingCents: 0 }; rows.push(row); }
    row.spentCents += Math.round(item.amount * 100); row.remainingCents = -row.spentCents;
  }
  return { month, closedAt: new Date().toISOString(), budgetBasis: 'Category limits at settlement time', rows,
    budgetCents: rows.reduce((sum, row) => sum + row.budgetCents, 0),
    spentCents: rows.reduce((sum, row) => sum + row.spentCents, 0), transactionCount: selected.length };
}
export function expenseKey(expense) {
  return JSON.stringify([expense.date, expense.categoryId, Math.round(expense.amount * 100), (expense.notes || '').trim()]);
}
