import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ state: null, dispatch: vi.fn(), analyzeSpending: vi.fn(), updateCategory: vi.fn() }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ state: mocks.state, dispatch: mocks.dispatch }) }));
vi.mock('../../src/services/api', () => ({ budgetApi: mocks }));
import SpendingInsights from '../../src/components/SpendingInsights';
const fact = { id: 'C1-suggestion', kind: 'suggestion', categoryId: 'food', categoryName: 'Food', spentCents: 10000, previousCents: 6000, budgetCents: 5000, averageCents: 8000, historyMonths: 3, proposedBudgetCents: 8000 };
const result = { month: '2026-11', asOf: '2026-11-03', comparisonMonth: '2026-10', mode: 'ai', cached: false,
  findings: [{ evidenceId: 'C1-unusual', explanation: 'Review the larger entry against your usual spending.' }],
  suggestions: [{ evidenceId: fact.id, explanation: 'Consider reviewing this limit based on historical spending.' }],
  evidence: [fact, { ...fact, id: 'C1-unusual', kind: 'unusual', amountCents: 10000, medianCents: 2000, sampleCount: 6, date: '2026-11-02' }] };
beforeEach(() => {
  vi.resetAllMocks(); mocks.state = { categories: [{ id: 'food', name: 'Food', budget: 50 }], expenses: [], session: { user: { email: 'alice@example.com' } } };
  mocks.analyzeSpending.mockResolvedValue(result); mocks.updateCategory.mockResolvedValue({ id: 'food', name: 'Food', budget: 80 });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());
const view = () => render(<MemoryRouter><SpendingInsights /></MemoryRouter>);
it('only analyzes on request and displays verified evidence, privacy and filtered expense links', async () => {
  const user = userEvent.setup(); view(); expect(mocks.analyzeSpending).not.toHaveBeenCalled();
  expect(screen.getByText(/raw transactions are not sent/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Analyze this month' }));
  expect(await screen.findByText(/AI analysis generated/)).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Main findings' })).toBeVisible();
  expect(screen.getAllByRole('link', { name: 'View matching expenses' })[0]).toHaveAttribute('href', '/app/expenses?categoryId=food&fromDate=2026-11-01&toDate=2026-11-03');
  await user.click(screen.getByText(/Food — Unusually large/)); expect(screen.getByText(/Historical median/)).toBeVisible();
});
it('requires confirmation before saving the calculated budget and handles rejection', async () => {
  const user = userEvent.setup(); view(); await user.click(screen.getByRole('button', { name: 'Analyze this month' }));
  const button = await screen.findByRole('button', { name: 'Review budget change' });
  window.confirm.mockReturnValueOnce(false); await user.click(button); expect(mocks.updateCategory).not.toHaveBeenCalled();
  await user.click(button); await waitFor(() => expect(mocks.updateCategory).toHaveBeenCalledWith({ id: 'food', name: 'Food', budget: 80 }));
  expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'UPSERT_CATEGORY', payload: { id: 'food', name: 'Food', budget: 80 } });
  expect(screen.getByText('Budget updated after your confirmation.')).toBeVisible();
});
it('shows honest non-AI and cached states without fabricated explanations', async () => {
  const user = userEvent.setup(); view();
  for (const mode of ['insufficient', 'unavailable', 'limited', 'pending']) {
    mocks.analyzeSpending.mockResolvedValueOnce({ ...result, mode, findings: [], suggestions: [] });
    await user.click(screen.getByRole('button', { name: 'Analyze this month' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Main findings' })).not.toBeInTheDocument());
    expect(screen.queryByText(/AI analysis generated/)).not.toBeInTheDocument();
  }
  mocks.analyzeSpending.mockResolvedValueOnce({ ...result, cached: true }); await user.click(screen.getByRole('button', { name: 'Analyze this month' }));
  expect(await screen.findByText(/Saved AI analysis/)).toBeVisible();
});
it('handles request/save failures and blocks repeated generation while pending', async () => {
  const user = userEvent.setup(); view(); mocks.analyzeSpending.mockRejectedValueOnce(Error('API unavailable'));
  await user.click(screen.getByRole('button', { name: 'Analyze this month' })); expect(await screen.findByRole('alert')).toHaveTextContent('API unavailable');
  let resolve; mocks.analyzeSpending.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await user.click(screen.getByRole('button', { name: 'Analyze this month' })); expect(screen.getByRole('button', { name: 'Analyzing…' })).toBeDisabled();
  resolve(result); const button = await screen.findByRole('button', { name: 'Review budget change' });
  mocks.updateCategory.mockRejectedValueOnce(Error('Save failed')); await user.click(button); expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
});
it('discards responses when source data changes and clears an existing analysis', async () => {
  const user = userEvent.setup(); const rendered = view(); let resolve;
  mocks.analyzeSpending.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await user.click(screen.getByRole('button', { name: 'Analyze this month' }));
  mocks.state = { ...mocks.state, expenses: [{ id: 'changed' }] }; rendered.rerender(<MemoryRouter><SpendingInsights /></MemoryRouter>);
  resolve(result); await waitFor(() => expect(screen.getByRole('button', { name: 'Analyze this month' })).toBeEnabled());
  expect(screen.queryByText(/AI analysis generated/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Analyze this month' })); expect(await screen.findByText(/AI analysis generated/)).toBeVisible();
  mocks.state = { ...mocks.state, categories: [] }; rendered.rerender(<MemoryRouter><SpendingInsights /></MemoryRouter>);
  expect(screen.queryByText(/AI analysis generated/)).not.toBeInTheDocument();
});
