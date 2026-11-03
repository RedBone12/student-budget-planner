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
  const resting = Boolean(error || result?.mode === 'unavailable' || result?.mode === 'limited');
  const mood = busy || result?.mode === 'pending' ? 'thinking' : resting ? 'resting' : result?.mode === 'ai' ? 'happy' : 'idle';
  const greeting = busy ? 'Counting the little things…' : error || result?.mode === 'unavailable' ? 'A little thinking break. Your numbers are still here.'
    : result?.mode === 'limited' ? 'That’s today’s thinking done. See you tomorrow!'
      : result?.mode === 'pending' ? 'One little moment — I’m already on it.'
        : result?.mode === 'ai' ? 'All done! Let’s take a look together.'
          : result?.mode === 'insufficient' ? 'Every little entry helps build your spending story.' : 'Hi, I’m Penny! Shall we check in on your budget?';
  return <section className={`card insights-card insights-${mood}`}>
    <div className="insights-intro">
      <div className="penny-scene" aria-hidden="true">
        <span className="penny-spark penny-spark-one">✦</span><span className="penny-spark penny-spark-two">✧</span>
        <svg className="penny" viewBox="0 0 160 160" focusable="false">
          <ellipse className="penny-shadow" cx="80" cy="143" rx="40" ry="7" fill="#d4e8dd" />
          <g className="penny-body" stroke="#285e4a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M39 74Q20 58 31 43Q48 43 54 61M108 61Q120 43 134 48Q140 64 124 78" fill="#a4dcb4" />
            <path d="M37 101Q16 95 21 84Q26 78 31 85" fill="none" />
            <path d="M42 117L41 136Q51 143 61 136L65 126M99 126L103 137Q115 143 122 135L119 116" fill="#a4dcb4" />
            <path d="M29 91Q29 53 79 52Q132 51 133 93Q138 132 83 133Q31 134 29 91Z" fill="#c9efcd" />
            <path d="M66 59H94" fill="none" />
            <g className="penny-coin"><circle cx="80" cy="36" r="18" fill="#ffe8a0" /><path d="M84 27Q71 25 71 36Q71 47 84 45M67 33H80M67 39H79" fill="none" stroke="#b17a23" strokeWidth="2.5" /></g>
            <path className="penny-eye" d="M53 85v6M109 85v6" fill="none" strokeWidth="4" />
            <path className="penny-sleepy-eyes" d="M49 90q5 4 10 0M104 90q5 4 10 0" fill="none" />
            <ellipse cx="81" cy="103" rx="18" ry="12" fill="#a4dcb4" strokeWidth="2" />
            <path d="M75 101v4M87 101v4" strokeWidth="2.5" />
            <path className="penny-smile" d="M73 119q8 6 16 0" fill="none" strokeWidth="2" />
            <ellipse cx="47" cy="101" rx="8" ry="5" fill="#f2b9ae" stroke="none" /><ellipse cx="115" cy="101" rx="8" ry="5" fill="#f2b9ae" stroke="none" />
          </g>
        </svg>
      </div>
      <div className="insights-welcome">
        <span className="penny-label">MEET PENNY · YOUR BUDGET BUDDY</span>
        <h2>AI spending insights</h2>
        <p className="penny-bubble" aria-live="polite">{greeting}</p>
        <p className="insights-subtitle">Small steps. A clearer picture of your spending.</p>
      </div>
      <button className="primary-btn penny-action" disabled={busy} onClick={analyze}><span aria-hidden="true">{busy ? '◌' : '✦'}</span> {busy ? 'Analyzing…' : 'Analyze this month'}</button>
    </div>
    <p className="insights-data-note">Analyze this UTC month to date. On request, anonymous category totals are sent to Amazon Bedrock in EU regions. Notes, contact details and raw transactions are not sent. Up to three generations per account per UTC day; identical data reuses cached results.</p>
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
