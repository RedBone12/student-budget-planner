import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { currency, formatDate, todayString } from '../utils/formatters';
import { validateReportFilters } from '../utils/validators';

export default function ReportsPage() {
  const { state } = useApp();
  const initialFilters = { categoryId: '', fromDate: '', toDate: todayString() };
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [error, setError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const rows = useMemo(() => {
    const categoryNames = new Map(state.categories.map((item) => [item.id, item.name]));
    return state.expenses
      .filter((expense) => (!appliedFilters.categoryId || expense.categoryId === appliedFilters.categoryId))
      .filter((expense) => (!appliedFilters.fromDate || expense.date >= appliedFilters.fromDate))
      .filter((expense) => (!appliedFilters.toDate || expense.date <= appliedFilters.toDate))
      .map((expense) => ({
        ...expense,
        categoryName: categoryNames.get(expense.categoryId) || 'Unknown',
      }));
  }, [appliedFilters, state.categories, state.expenses]);

  const total = rows.reduce((sum, item) => sum + Number(item.amount), 0);

  const generateReport = () => {
    const message = validateReportFilters(filters.fromDate, filters.toDate);
    setError(message);
    if (!message) setAppliedFilters(filters);
  };

  const downloadPdf = async () => {
    const message = validateReportFilters(filters.fromDate, filters.toDate);
    if (message) return setError(message);
    setError('');
    setIsDownloading(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = new jsPDF();
      doc.text('Student Budget Planner Report', 14, 16);
      autoTable(doc, {
        head: [['Expense Category', 'Date', 'Amount']],
        body: rows.map((item) => [item.categoryName, formatDate(item.date), currency(item.amount)]),
        startY: 24,
      });
      doc.text(`Total: ${currency(total)}`, 14, doc.lastAutoTable.finalY + 12);
      doc.save('student-budget-report.pdf');
    } catch {
      setError('The PDF could not be created. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="card report-page">
      <div className="report-toolbar">
        <label>
          Expense Categories
          <select value={filters.categoryId} onChange={(e) => setFilters((prev) => ({ ...prev, categoryId: e.target.value }))}>
            <option value="">All categories</option>
            {state.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label>
          Start date
          <input type="date" max={todayString()} value={filters.fromDate} onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))} />
        </label>
        <label>
          End date
          <input type="date" max={todayString()} value={filters.toDate} onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))} />
        </label>
        <button className="primary-btn large" onClick={generateReport}>Generate Report</button>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <section className="report-preview">
        <h2>Report Preview</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Expense Category</th>
                <th>Date</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.categoryName}</td>
                  <td>{formatDate(row.date)}</td>
                  <td>{currency(row.amount)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan="3" className="empty-state">No expenses match these filters.</td></tr>
              ) : null}
              <tr>
                <td><strong>Total</strong></td>
                <td></td>
                <td><strong>{currency(total)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="report-actions">
          <button className="primary-btn" onClick={downloadPdf} disabled={isDownloading}>
            {isDownloading ? 'Preparing PDF…' : 'Download PDF'}
          </button>
        </div>
      </section>
    </div>
  );
}
