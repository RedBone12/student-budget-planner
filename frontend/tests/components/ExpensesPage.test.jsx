import React, { useReducer } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createInitialState, reducer } from '../../src/context/appState';

const mocks = vi.hoisted(() => ({ context: null, api: {
  createCategory: vi.fn(), createExpense: vi.fn(), updateExpense: vi.fn(), deleteExpense: vi.fn(),
} }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => mocks.context }));
vi.mock('../../src/services/api', () => ({ budgetApi: mocks.api }));
import ExpensesPage from '../../src/pages/ExpensesPage';

function Harness({ expenses = [] }) {
  const [state, dispatch] = useReducer(reducer, {
    ...createInitialState(),
    session: { isAuthenticated: true, user: { email: 'alice@example.com' } },
    categories: [{ id: 'food', name: 'Food', budget: 100 }], expenses,
  });
  mocks.context = { state, dispatch };
  return <ExpensesPage />;
}
const existing = { id: 'expense-1', amount: 12.5, categoryId: 'food', date: '2026-01-02', notes: 'Lunch' };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.api.createExpense.mockImplementation(async value => ({ ...value, id: 'expense-1' }));
  mocks.api.updateExpense.mockImplementation(async value => value);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());
async function fill(user, category = 'Food') {
  await user.type(screen.getByLabelText(/Amount/), '12.50');
  await user.type(screen.getByLabelText(/Category/), category);
  await user.type(screen.getByLabelText('Notes'), 'Lunch');
}

it('adds an expense through the page and clears the form after success', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.getByText('No expenses recorded yet.')).toBeInTheDocument();
  await fill(user);
  await user.click(screen.getByRole('button', { name: 'Add Expense' }));
  expect(await screen.findByRole('cell', { name: 'Lunch' })).toBeInTheDocument();
  expect(mocks.api.createExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 12.5, categoryId: 'food' }));
  expect(screen.getByLabelText(/Amount/)).toHaveValue(null);
});

it('creates a typed category before saving an expense', async () => {
  mocks.api.createCategory.mockResolvedValue({ id: 'travel', name: 'Travel', budget: 0 });
  const user = userEvent.setup(); render(<Harness />);
  await fill(user, 'Travel');
  await user.click(screen.getByRole('button', { name: 'Add Expense' }));
  expect(await screen.findByRole('cell', { name: 'Travel' })).toBeInTheDocument();
  expect(mocks.api.createCategory).toHaveBeenCalledWith({ name: 'Travel', budget: 0 });
  expect(mocks.api.createExpense).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'travel' }));
});

it('edits a row, cancels an edit, and resets the form', async () => {
  const user = userEvent.setup(); render(<Harness expenses={[existing]} />);
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText(/Amount/)).toHaveValue(12.5);
  await user.clear(screen.getByLabelText(/Amount/));
  await user.type(screen.getByLabelText(/Amount/), '20');
  await user.click(screen.getByRole('button', { name: 'Save Expense' }));
  await waitFor(() => expect(within(screen.getByRole('table')).getByText(/20\.00/)).toBeInTheDocument());
  expect(mocks.api.updateExpense).toHaveBeenCalledWith(expect.objectContaining({ id: existing.id, amount: 20 }));
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Add Expense' })).toBeInTheDocument();
  await fill(user);
  await user.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByLabelText('Notes')).toHaveValue('');
});

it('requires confirmation to delete and keeps the row if deletion fails', async () => {
  const user = userEvent.setup(); render(<Harness expenses={[existing]} />);
  window.confirm.mockReturnValueOnce(false);
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(mocks.api.deleteExpense).not.toHaveBeenCalled();
  mocks.api.deleteExpense.mockRejectedValueOnce(Error('Delete failed'));
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(await screen.findByText('Delete failed')).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Lunch' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(await screen.findByText('No expenses recorded yet.')).toBeInTheDocument();
});

it('blocks repeated saves while pending and preserves input after an API failure', async () => {
  let reject;
  mocks.api.createExpense.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  const user = userEvent.setup(); render(<Harness />);
  await fill(user);
  await user.click(screen.getByRole('button', { name: 'Add Expense' }));
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Saving…' }));
  expect(mocks.api.createExpense).toHaveBeenCalledOnce();
  reject(Error('Network unavailable'));
  expect(await screen.findByText('Network unavailable')).toBeInTheDocument();
  expect(screen.getByLabelText('Notes')).toHaveValue('Lunch');
  expect(screen.getByRole('button', { name: 'Add Expense' })).toBeEnabled();
  expect(screen.queryByRole('cell', { name: 'Lunch' })).not.toBeInTheDocument();
});

it('does not save an expense when category creation fails', async () => {
  mocks.api.createCategory.mockRejectedValue(Error('Category unavailable'));
  const user = userEvent.setup(); render(<Harness />);
  await fill(user, 'Travel');
  await user.click(screen.getByRole('button', { name: 'Add Expense' }));
  expect(await screen.findByText('Category unavailable')).toBeInTheDocument();
  expect(mocks.api.createExpense).not.toHaveBeenCalled();
});

it('validates future dates in the page before making an API request', async () => {
  const user = userEvent.setup(); const { container } = render(<Harness />);
  await fill(user);
  // Bypass native form constraints to exercise the application's validator.
  container.querySelector('form').noValidate = true;
  await user.clear(screen.getByLabelText(/Date/));
  await user.type(screen.getByLabelText(/Date/), '2099-01-01');
  await user.click(screen.getByRole('button', { name: 'Add Expense' }));
  expect(await screen.findByText('Future date selection is not allowed')).toBeInTheDocument();
  expect(mocks.api.createExpense).not.toHaveBeenCalled();
});
