import { currency, formatDate } from '../utils/formatters';

export default function RecentExpenses({ expenses, categories, onEdit, onDelete }) {
  const getCategoryName = (categoryId) => categories.find((item) => item.id === categoryId)?.name || 'Unknown';

  return (
    <section className="card">
      <div className="section-band">Recent Expense</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Amount (€)</th>
              <th>Notes</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => (
              <tr key={expense.id}>
                <td>{formatDate(expense.date)}</td>
                <td>{getCategoryName(expense.categoryId)}</td>
                <td>{currency(expense.amount)}</td>
                <td>{expense.notes || '-'}</td>
                <td className="actions-cell">
                  <button className="ghost-btn small" onClick={() => onEdit(expense)}>Edit</button>
                  <button className="ghost-btn small danger" onClick={() => onDelete(expense)}>Delete</button>
                </td>
              </tr>
            ))}
            {expenses.length === 0 ? (
              <tr><td colSpan="5" className="empty-state">No expenses recorded yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
