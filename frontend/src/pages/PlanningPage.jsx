import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { budgetApi } from '../services/api';
import { currency } from '../utils/formatters';
import CsvImport from '../components/CsvImport';

export default function PlanningPage() {
  const { state, dispatch } = useApp();
  const [rules, setRules] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(() => {
    const date = new Date(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - 1); return date.toISOString().slice(0, 7);
  });
  const initialRule = { categoryId: state.categories[0]?.id || '', amount: '', frequency: 'monthly', startDate: new Date().toISOString().slice(0, 10), endDate: '', notes: '' };
  const [form, setForm] = useState(initialRule);
  useEffect(() => {
    let active = true;
    Promise.all([budgetApi.listRecurring(), budgetApi.listSettlements()]).then(([recurring, closed]) => {
      if (active) { setRules(recurring); setSettlements(closed); }
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);
  const refreshExpenses = async () => dispatch({ type: 'LOAD_REMOTE_DATA', payload: await budgetApi.loadBudgetData() });
  const action = async callback => {
    setBusy(true); setError(''); setStatus('');
    try { await callback(); } catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  const field = name => event => setForm(previous => ({ ...previous, [name]: event.target.value }));
  const createRule = event => {
    event.preventDefault();
    action(async () => {
      const saved = await budgetApi.createRecurring({ ...form, amount: Number(form.amount) });
      setRules(previous => [...previous, saved]); setForm(initialRule); setStatus('Recurring expense saved. Due entries run daily at 09:00 UTC.');
    });
  };
  return <div className="stack-gap">
    <h1>Budget planning</h1>
    {error && <p role="alert" className="form-error">{error}</p>}
    {status && <p role="status">{status}</p>}
    <section className="card">
      <h2>Monthly settlement</h2>
      <p>Close a completed UTC calendar month. The saved snapshot will not change when you edit expenses or budgets later. Budget limits are captured at settlement time.</p>
      <label>Settlement month<input type="month" value={month} onChange={event => setMonth(event.target.value)} required /></label>
      <button className="primary-btn" disabled={busy || !month || month >= new Date().toISOString().slice(0, 7)} onClick={() => action(async () => {
        const saved = await budgetApi.settleMonth(month);
        setSettlements(previous => [...previous.filter(item => item.month !== saved.month), saved]); setStatus(`Settlement saved for ${saved.month}`);
      })}>Close month</button>
      {settlements.length === 0 && <p>No closed months yet.</p>}
      {settlements.slice().sort((a, b) => b.month.localeCompare(a.month)).map(item => <details key={item.month}>
        <summary>{item.month} — spent {currency(item.spentCents / 100)} of {currency(item.budgetCents / 100)}</summary>
        <p>{item.transactionCount} transactions. Remaining: {currency((item.budgetCents - item.spentCents) / 100)}</p>
        <div className="table-wrap"><table><thead><tr><th>Category</th><th>Budget</th><th>Spent</th><th>Remaining</th></tr></thead>
          <tbody>{item.rows.map(row => <tr key={row.categoryId}><td>{row.name}</td><td>{currency(row.budgetCents / 100)}</td><td>{currency(row.spentCents / 100)}</td><td>{currency(row.remainingCents / 100)}</td></tr>)}</tbody></table></div>
      </details>)}
    </section>
    <section className="card">
      <h2>Recurring expenses</h2>
      <p>Weekly or monthly expenses are added on their due date in UTC. Monthly dates clamp to the last day of short months, keeping the original day for later months. Up to 24 missed entries per schedule are caught up each run. Pausing keeps the next due date; resuming catches up missed entries.</p>
      <form className="report-toolbar" onSubmit={createRule}>
        <label>Recurring category<select value={form.categoryId} onChange={field('categoryId')} required>
          <option value="">Select category</option>{state.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>Recurring amount (€)<input type="number" min="0.01" max="999999999.99" step="0.01" value={form.amount} onChange={field('amount')} required /></label>
        <label>Frequency<select value={form.frequency} onChange={field('frequency')}><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></label>
        <label>First due date<input type="date" value={form.startDate} onChange={field('startDate')} required /></label>
        <label>End date (optional)<input type="date" min={form.startDate} value={form.endDate} onChange={field('endDate')} /></label>
        <label>Recurring notes<input value={form.notes} onChange={field('notes')} maxLength={500} /></label>
        <button className="primary-btn" disabled={busy}>Create recurring expense</button>
      </form>
      <button className="ghost-btn" disabled={busy} onClick={() => action(async () => {
        const result = await budgetApi.applyDue(); await refreshExpenses(); setRules(await budgetApi.listRecurring()); setStatus(`Added ${result.created} due expenses`);
      })}>Add due expenses now</button>
      <div className="table-wrap"><table><thead><tr><th>Category</th><th>Amount</th><th>Schedule</th><th>Next due</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {rules.map(rule => <tr key={rule.id}><td>{state.categories.find(item => item.id === rule.categoryId)?.name || 'Unknown'}</td><td>{currency(rule.amount)}</td><td>{rule.frequency}</td><td>{rule.nextDate}</td><td>{!rule.active ? 'Paused' : rule.endDate && rule.nextDate > rule.endDate ? 'Finished' : 'Active'}</td><td>
          <button className="ghost-btn small" disabled={busy} onClick={() => action(async () => {
            const saved = await budgetApi.updateRecurring({ ...rule, active: !rule.active }); setRules(previous => previous.map(item => item.id === saved.id ? saved : item));
          })}>{rule.active ? 'Pause' : 'Resume'}</button>
          <button className="ghost-btn small danger" disabled={busy} onClick={() => {
            if (window.confirm('Remove this recurring schedule? Existing expenses will be kept.')) action(async () => { await budgetApi.deleteRecurring(rule.id); setRules(previous => previous.filter(item => item.id !== rule.id)); });
          }}>Remove schedule</button>
        </td></tr>)}
        {!rules.length && <tr><td colSpan="6">No recurring schedules yet.</td></tr>}
      </tbody></table></div>
    </section>
    <CsvImport categories={state.categories} onImported={refreshExpenses} />
  </div>;
}
