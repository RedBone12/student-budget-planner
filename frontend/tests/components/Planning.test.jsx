import React, { useReducer } from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createInitialState, reducer } from '../../src/context/appState';

const mocks = vi.hoisted(() => ({ context: null, api: {
  listRecurring: vi.fn(), listSettlements: vi.fn(), createRecurring: vi.fn(), updateRecurring: vi.fn(), deleteRecurring: vi.fn(),
  settleMonth: vi.fn(), applyDue: vi.fn(), importExpenses: vi.fn(), loadBudgetData: vi.fn(), deliveryStatus: vi.fn(), updateSettings: vi.fn(),
} }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => mocks.context }));
vi.mock('../../src/services/api', () => ({ budgetApi: mocks.api }));
import PlanningPage from '../../src/pages/PlanningPage';
import ExpensesPage from '../../src/pages/ExpensesPage';
import SettingsPage from '../../src/pages/SettingsPage';
import ReportsPage from '../../src/pages/ReportsPage';
import CsvImport from '../../src/components/CsvImport';

const categories = [{ id: 'food', name: 'Food', budget: 100 }, { id: 'rent', name: 'Rent', budget: 600 }];
const expenses = [
  { id: '1', categoryId: 'food', amount: 12.5, date: '2026-01-02', notes: 'Lunch' },
  { id: '2', categoryId: 'food', amount: 20, date: '2026-01-03', notes: 'Dinner' },
  { id: '3', categoryId: 'rent', amount: 12.5, date: '2026-01-02', notes: 'Other' },
];
function Harness({ children }) {
  const [state, dispatch] = useReducer(reducer, { ...createInitialState(), categories, expenses,
    session: { isAuthenticated: true, user: { email: 'alice@example.com' } } });
  mocks.context = { state, dispatch };
  return children;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.api.listRecurring.mockResolvedValue([]); mocks.api.listSettlements.mockResolvedValue([]);
  mocks.api.loadBudgetData.mockResolvedValue({ categories, expenses, settings: {} });
  mocks.api.deliveryStatus.mockResolvedValue({ ready: true, sandbox: true, history: [] });
  mocks.api.updateSettings.mockImplementation(async value => value);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

it('combines date, category and amount filters and clears them without changing records', async () => {
  const user = userEvent.setup(); render(<Harness><ExpensesPage /></Harness>);
  await user.selectOptions(screen.getByLabelText('Filter category'), 'food');
  await user.type(screen.getByLabelText('From date'), '2026-01-02');
  await user.type(screen.getByLabelText('To date'), '2026-01-02');
  await user.type(screen.getByLabelText('Minimum amount (€)'), '12.50');
  await user.type(screen.getByLabelText('Maximum amount (€)'), '12.50');
  expect(screen.getByText('Showing 1 of 3 expenses')).toBeInTheDocument();
  expect(screen.queryByRole('cell', { name: 'Dinner' })).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText('Minimum amount (€)'));
  await user.type(screen.getByLabelText('Minimum amount (€)'), '30');
  expect(screen.getByRole('alert')).toHaveTextContent('Minimum amount');
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByText('Showing 3 of 3 expenses')).toBeInTheDocument();
});

it('creates, pauses, resumes and removes a recurring expense, and applies due entries', async () => {
  const user = userEvent.setup(); render(<Harness><PlanningPage /></Harness>);
  await screen.findByText('No recurring schedules yet.');
  const rule = { id: 'rule', categoryId: 'food', amount: 10, frequency: 'weekly', startDate: '2026-01-01', nextDate: '2026-01-01', active: true };
  mocks.api.createRecurring.mockResolvedValue(rule);
  mocks.api.updateRecurring.mockImplementation(async value => value);
  await user.selectOptions(screen.getByLabelText('Recurring category'), 'food');
  await user.type(screen.getByLabelText('Recurring amount (€)'), '10');
  await user.selectOptions(screen.getByLabelText('Frequency'), 'weekly');
  await user.clear(screen.getByLabelText('First due date')); await user.type(screen.getByLabelText('First due date'), '2026-01-01');
  await user.type(screen.getByLabelText('End date (optional)'), '2026-12-31');
  await user.type(screen.getByLabelText('Recurring notes'), 'Weekly lunch');
  await user.click(screen.getByRole('button', { name: 'Create recurring expense' }));
  expect(await screen.findByText(/Recurring expense saved/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Pause' }));
  expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Resume' }));
  expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
  mocks.api.applyDue.mockResolvedValue({ created: 1 }); mocks.api.listRecurring.mockResolvedValue([rule]);
  await user.click(screen.getByRole('button', { name: 'Add due expenses now' }));
  expect(await screen.findByText('Added 1 due expenses')).toBeInTheDocument();
  window.confirm.mockReturnValueOnce(false);
  await user.click(screen.getByRole('button', { name: 'Remove schedule' }));
  expect(mocks.api.deleteRecurring).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Remove schedule' }));
  expect(await screen.findByText('No recurring schedules yet.')).toBeInTheDocument();
});

it('closes a month and displays its immutable budget and spending snapshot', async () => {
  const user = userEvent.setup(); render(<Harness><PlanningPage /></Harness>);
  const record = { month: '2026-01', spentCents: 1250, budgetCents: 10000, transactionCount: 1,
    rows: [{ categoryId: 'food', name: 'Food', budgetCents: 10000, spentCents: 1250, remainingCents: 8750 }] };
  mocks.api.settleMonth.mockResolvedValue(record);
  await user.clear(screen.getByLabelText('Settlement month')); await user.type(screen.getByLabelText('Settlement month'), '2026-01');
  await user.click(screen.getByRole('button', { name: 'Close month' }));
  expect(await screen.findByText('Settlement saved for 2026-01')).toBeInTheDocument();
  expect(screen.getByText(/2026-01 — spent/)).toBeInTheDocument();
  expect(mocks.api.settleMonth).toHaveBeenCalledWith('2026-01');
});

it('reports planning load and schedule-save failures without claiming success', async () => {
  mocks.api.listRecurring.mockRejectedValue(Error('Planning unavailable'));
  const user = userEvent.setup(); render(<Harness><PlanningPage /></Harness>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Planning unavailable');
  mocks.api.createRecurring.mockRejectedValue(Error('Could not save'));
  await user.type(screen.getByLabelText('Recurring amount (€)'), '10');
  await user.click(screen.getByRole('button', { name: 'Create recurring expense' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
});

it('CSV upload only previews; failed confirmation retries with the same idempotency key', async () => {
  const user = userEvent.setup(); const imported = vi.fn();
  render(<CsvImport categories={categories} onImported={imported} />);
  const file = new File(['date,category,amount,notes\n2026-01-02,Food,12.50,"Lunch, cafe"'], 'expenses.csv', { type: 'text/csv' });
  await user.upload(screen.getByLabelText('Choose expense CSV'), file);
  expect(await screen.findByRole('heading', { name: 'Import preview — 1 rows' })).toBeInTheDocument();
  expect(mocks.api.importExpenses).not.toHaveBeenCalled();
  mocks.api.importExpenses.mockRejectedValueOnce(Error('Offline')).mockResolvedValue({ imported: 1, skipped: 0 });
  await user.click(screen.getByRole('button', { name: 'Confirm import' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  await user.click(screen.getByRole('button', { name: 'Confirm import' }));
  expect(await screen.findByText('Imported 1 expenses; skipped 0 matching rows.')).toBeInTheDocument();
  expect(mocks.api.importExpenses.mock.calls[0][0].importId).toBe(mocks.api.importExpenses.mock.calls[1][0].importId);
  expect(imported).toHaveBeenCalledOnce();
});

it('rejects invalid CSV before any API call and allows cancelling a valid preview', async () => {
  const user = userEvent.setup(); render(<CsvImport categories={categories} onImported={vi.fn()} />);
  await user.upload(screen.getByLabelText('Choose expense CSV'), new File(['bad,headers'], 'bad.csv', { type: 'text/csv' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Use CSV columns');
  await user.upload(screen.getByLabelText('Choose expense CSV'), new File(['date,category,amount,notes\n2026-01-02,Food,1,Lunch'], 'ok.csv', { type: 'text/csv' }));
  await screen.findByRole('button', { name: 'Confirm import' });
  await user.click(screen.getByRole('checkbox', { name: /Skip rows matching/ }));
  await user.click(screen.getByRole('button', { name: 'Cancel import' }));
  expect(screen.queryByRole('button', { name: 'Confirm import' })).not.toBeInTheDocument();
  expect(mocks.api.importExpenses).not.toHaveBeenCalled();
});

it('requires explicit opt-in before scheduled email and persists disabling', async () => {
  const user = userEvent.setup(); render(<Harness><SettingsPage /></Harness>);
  const checkbox = screen.getByRole('checkbox', { name: 'Enable scheduled email delivery' });
  await waitFor(() => expect(checkbox).toBeEnabled());
  expect(checkbox).not.toBeChecked();
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).toBeChecked());
  expect(mocks.api.updateSettings).toHaveBeenLastCalledWith(expect.objectContaining({ emailDeliveryEnabled: true }));
  await user.click(checkbox);
  await waitFor(() => expect(checkbox).not.toBeChecked());
});

it('keeps email opt-in disabled until verification is ready', async () => {
  mocks.api.deliveryStatus.mockResolvedValue({ ready: false, sandbox: true, history: [] });
  render(<Harness><SettingsPage /></Harness>);
  expect(screen.getByRole('checkbox', { name: 'Enable scheduled email delivery' })).toBeDisabled();
  expect(await screen.findByText(/restricted test mode/)).toBeInTheDocument();
});

it('report filtering includes amounts and leaves the last valid report when a range is invalid', async () => {
  const user = userEvent.setup(); render(<Harness><ReportsPage /></Harness>);
  await user.selectOptions(screen.getByLabelText('Expense Categories'), 'food');
  await user.type(screen.getByLabelText('Maximum amount (€)'), '12.50');
  await user.click(screen.getByRole('button', { name: 'Generate Report' }));
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
  await user.type(screen.getByLabelText('Minimum amount (€)'), '20');
  await user.click(screen.getByRole('button', { name: 'Generate Report' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Minimum amount');
});
