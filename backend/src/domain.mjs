const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new InputError('Request body must be valid JSON');
  }
}

export function userPartitionKey(subject) {
  if (!subject) throw new InputError('Authenticated user is missing');
  return `USER#${subject}`;
}

export function normalizeExpense(input, existingId) {
  const amount = Number(input.amount);
  const categoryId = cleanRequired(input.categoryId, 'categoryId', 80);
  const date = cleanRequired(input.date, 'date', 10);
  const notes = cleanOptional(input.notes, 500);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new InputError('amount must be greater than zero');
  }
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new InputError('date must use YYYY-MM-DD');
  }

  return {
    id: existingId || crypto.randomUUID(),
    categoryId,
    amountCents: Math.round((amount + Number.EPSILON) * 100),
    date,
    notes,
  };
}

export function normalizeCategory(input, existingId) {
  const name = cleanRequired(input.name, 'name', 80);
  const budget = Number(input.budget);
  if (!Number.isFinite(budget) || budget < 0) {
    throw new InputError('budget must be zero or greater');
  }
  return {
    id: existingId || crypto.randomUUID(),
    name,
    budgetCents: Math.round((budget + Number.EPSILON) * 100),
  };
}

export function normalizeSettings(input) {
  return {
    monthlySummary: Boolean(input.monthlySummary),
    budgetAlerts: Boolean(input.budgetAlerts),
    dailyReminder: Boolean(input.dailyReminder),
    transactionNotifications: Boolean(input.transactionNotifications),
  };
}

export function expenseForClient(item) {
  return {
    id: item.id,
    categoryId: item.categoryId,
    amount: item.amountCents / 100,
    date: item.date,
    notes: item.notes || '',
  };
}

export function categoryForClient(item) {
  return {
    id: item.id,
    name: item.name,
    budget: item.budgetCents / 100,
  };
}

function cleanRequired(value, field, maxLength) {
  const result = String(value ?? '').trim();
  if (!result) throw new InputError(`${field} is required`);
  if (result.length > maxLength) throw new InputError(`${field} is too long`);
  return result;
}

function cleanOptional(value, maxLength) {
  const result = String(value ?? '').trim();
  if (result.length > maxLength) throw new InputError('notes is too long');
  return result;
}

export class InputError extends Error {}
