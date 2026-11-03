import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { budgetApi } from '../services/api';
import { currency } from '../utils/formatters';

export default function SpendingInsights() {
  const { state, dispatch } = useApp();
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const version = useRef(0);
  useEffect(() => { version.current++; setResult(null); return () => { version.current++; }; }, [state.expenses, state.categories, state.session?.user?.email]);
  const analyze = async () => {
    const requestVersion = version.current;
    setBusy(true); setError(''); setStatus('');
    try { const response = await budgetApi.analyzeSpending(); if (requestVersion === version.current) setResult(response); }
    catch (error) { if (requestVersion === version.current) setError(error.message); }
    finally { setBusy(false); }
  };
  const apply = async evidence => {
    const requestVersion = version.current;
    const category = state.categories.find(item => item.id === evidence.categoryId);
    if (!category || !window.confirm(`Change ${category.name} budget from ${currency(category.budget)} to ${currency(evidence.proposedBudgetCents / 100)}? Historical spending does not establish what you can afford.`)) return;
    setBusy(true); setError('');
    try {
      const saved = await budgetApi.updateCategory({ ...category, budget: evidence.proposedBudgetCents / 100 });
      if (requestVersion !== version.current) return;
      dispatch({ type: 'UPSERT_CATEGORY', payload: saved }); setStatus('Budget updated after your confirmation.');
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  const messages = {
    insufficient: 'No significant patterns meet the current thresholds. Historical comparisons need recorded expenses; unusual spending checks require at least five earlier transactions in the category.',
    unavailable: 'AI explanation is currently unavailable. Calculated evidence is shown below; it is not an AI-generated analysis.',
    limited: 'Daily generation limit reached. You can still review the calculated evidence below. Try again tomorrow UTC.',
    pending: 'An analysis of this data is already running. Try again shortly.',
  };
  return <section className="card" style={{ gridColumn: '1 / -1' }}>
    <h2>AI spending insights</h2>
    <p>Analyze this UTC month to date. On request, anonymous category totals are sent to Amazon Bedrock in EU regions. Notes, contact details and raw transactions are not sent. Up to three generations per account per UTC day; identical data reuses cached results.</p>
    <button className="primary-btn" disabled={busy} onClick={analyze}>{busy ? 'Analyzing…' : 'Analyze this month'}</button>
    {error && <p role="alert" className="form-error">{error}</p>}
    {status && <p role="status">{status}</p>}
    {result && <>
      <p>{result.month} through {result.asOf}. Comparison: the same calendar days in {result.comparisonMonth}, rather than the full previous month.</p>
      {result.mode === 'ai' ? <p role="status">{result.cached ? 'Saved AI analysis' : 'AI analysis generated'}. Check the calculated evidence before acting; explanations may be inaccurate.</p> : <p role="status">{messages[result.mode]}</p>}
      {[['Main findings', result.findings], ['Budget suggestions', result.suggestions]].map(([title, items]) => items?.length > 0 && <div key={title}><h3>{title}</h3><ul>{items.map(item => {
        const fact = result.evidence.find(row => row.id === item.evidenceId);
        return <li key={item.evidenceId}><strong>{fact.categoryName}</strong>: {item.explanation}{fact.kind === 'suggestion' && <button className="ghost-btn" disabled={busy} onClick={() => apply(fact)}>Review budget change</button>}</li>;
      })}</ul></div>)}
      {result.evidence.map(fact => <details key={fact.id}><summary>{fact.categoryName} — {fact.kind === 'unusual' ? 'Unusually large entry to review' : fact.kind === 'suggestion' ? 'Historical budget comparison' : fact.kind === 'change' ? 'Spending increase' : 'Budget usage'}: calculated evidence</summary>
        <p>This month to date: {currency(fact.spentCents / 100)}. Previous month, same calendar days: {currency(fact.previousCents / 100)}. Current budget: {currency(fact.budgetCents / 100)}.</p>
        <p>Average across the previous three complete months: {currency(fact.averageCents / 100)}; {fact.historyMonths} of those months have recorded spending. A month without records counts as zero, not proof of no spending.</p>
        {fact.kind === 'unusual' && <p>Entry dated {fact.date}: {currency(fact.amountCents / 100)}. Historical median: {currency(fact.medianCents / 100)} from {fact.sampleCount} entries. This identifies a difference, not its cause.</p>}
        {fact.proposedBudgetCents && <p>Optional budget to review: {currency(fact.proposedBudgetCents / 100)}, calculated by rounding the historical average up to the next five euros. This does not assess affordability.</p>}
        <Link to={`/app/expenses?categoryId=${encodeURIComponent(fact.categoryId)}&fromDate=${result.month}-01&toDate=${result.asOf}`}>View matching expenses</Link>
      </details>)}
    </>}
  </section>;
}
