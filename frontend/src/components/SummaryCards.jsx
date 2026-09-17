import { currency } from '../utils/formatters';

export default function SummaryCards({ totalBudget, totalSpent }) {
  const remaining = totalBudget - totalSpent;
  return (
    <section className="card summary-card">
      <div className="section-title-row">
        <h2>Total Budget</h2>
      </div>
      <div className="summary-grid">
        <div>
          <span>Total</span>
          <strong>{currency(totalBudget)}</strong>
        </div>
        <div>
          <span>Remaining</span>
          <strong>{currency(remaining)}</strong>
        </div>
        <div>
          <span>Spent</span>
          <strong>{currency(totalSpent)}</strong>
        </div>
      </div>
    </section>
  );
}
