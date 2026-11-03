import { useRef, useState } from 'react';
import { budgetApi } from '../services/api';
import { readExpenseCsv } from '../utils/budget';
import { currency } from '../utils/formatters';

export default function CsvImport({ categories, onImported }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const importId = useRef('');
  const fileVersion = useRef(0);
  const preview = async event => {
    const version = ++fileVersion.current;
    setRows([]); setError(''); setStatus(''); importId.current = '';
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw Error('CSV must be smaller than 1 MB');
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('Could not read CSV')); reader.readAsText(file);
      });
      const parsed = readExpenseCsv(text, categories);
      if (version !== fileVersion.current) return;
      importId.current = crypto.randomUUID(); setRows(parsed);
    } catch (error) { if (version === fileVersion.current) setError(error.message); }
  };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const result = await budgetApi.importExpenses({ importId: importId.current, rows, skipDuplicates });
      await onImported(); setRows([]); setStatus(`Imported ${result.imported} expenses; skipped ${result.skipped} matching rows.`);
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  return <section className="card">
    <h2>Import expenses from CSV</h2>
    <p>Use <code>date,category,amount,notes</code> columns, dates in YYYY-MM-DD and positive euro amounts. Categories must already exist. Up to 50 rows and 1 MB per file. The file stays in your browser until you confirm; only validated rows are sent.</p>
    <pre>date,category,amount,notes{'\n'}2026-01-02,Groceries,12.50,Lunch</pre>
    <label>Choose expense CSV<input type="file" accept=".csv,text/csv" onChange={preview} disabled={busy} /></label>
    <label><input type="checkbox" checked={skipDuplicates} disabled={busy} onChange={event => { setSkipDuplicates(event.target.checked); importId.current = crypto.randomUUID(); }} />Skip rows matching an existing expense (date, category, amount and notes)</label>
    {error && <p role="alert" className="form-error">{error}</p>}
    {status && <p role="status">{status}</p>}
    {rows.length > 0 && <>
      <h3>Import preview — {rows.length} rows</h3>
      <div className="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Notes</th></tr></thead><tbody>
        {rows.map((row, index) => <tr key={index}><td>{row.date}</td><td>{categories.find(item => item.id === row.categoryId)?.name}</td><td>{currency(row.amount)}</td><td>{row.notes}</td></tr>)}
      </tbody></table></div>
      <button className="primary-btn" onClick={submit} disabled={busy}>{busy ? 'Importing…' : 'Confirm import'}</button>
      <button className="ghost-btn" disabled={busy} onClick={() => { setRows([]); fileVersion.current++; }}>Cancel import</button>
    </>}
  </section>;
}
