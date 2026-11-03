import { emptyFilters, filterError } from '../utils/budget';

export default function ExpenseFilters({ filters, onChange, categories }) {
  const field = key => event => onChange({ ...filters, [key]: event.target.value });
  return <section className="card">
    <h2>Filter expenses</h2>
    <div className="report-toolbar">
      <label>Filter category<select value={filters.categoryId} onChange={field('categoryId')}>
        <option value="">All categories</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label>From date<input type="date" value={filters.fromDate} onChange={field('fromDate')} /></label>
      <label>To date<input type="date" value={filters.toDate} onChange={field('toDate')} /></label>
      <label>Minimum amount (€)<input type="number" min="0" step="0.01" value={filters.minAmount} onChange={field('minAmount')} /></label>
      <label>Maximum amount (€)<input type="number" min="0" step="0.01" value={filters.maxAmount} onChange={field('maxAmount')} /></label>
      <button type="button" className="ghost-btn" onClick={() => onChange({ ...emptyFilters })}>Clear filters</button>
    </div>
    {filterError(filters) && <p role="alert" className="form-error">{filterError(filters)}</p>}
  </section>;
}
