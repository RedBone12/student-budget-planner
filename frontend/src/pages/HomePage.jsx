import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../context/AppContext';
import SummaryCards from '../components/SummaryCards';
import SpendingInsights from '../components/SpendingInsights';
import { currency } from '../utils/formatters';

const COLORS = ['#3b82f6', '#22c55e', '#facc15', '#ef4444', '#64748b', '#8b5cf6'];

export default function HomePage() {
  const { state } = useApp();
  const month = new Date().toISOString().slice(0, 7);
  const navigate = useNavigate();
  const { totalBudget, totalSpent, chartData } = useMemo(() => {
    const monthExpenses = state.expenses.filter(expense => expense.date.startsWith(month));
    const spentByCategory = monthExpenses.reduce((totals, expense) => {
      totals[expense.categoryId] = (totals[expense.categoryId] || 0) + Number(expense.amount);
      return totals;
    }, {});

    return {
      totalBudget: state.categories.reduce((sum, item) => sum + Number(item.budget), 0),
      totalSpent: monthExpenses.reduce((sum, item) => sum + Number(item.amount), 0),
      chartData: state.categories
        .map((category) => ({ name: category.name, value: spentByCategory[category.id] || 0 }))
        .filter((item) => item.value > 0),
    };
  }, [state.categories, state.expenses, month]);

  return (
    <div className="page-grid home-layout">
      <SpendingInsights key={state.session.user?.email} />
      <SummaryCards totalBudget={totalBudget} totalSpent={totalSpent} />
      <section className="card chart-card">
        <h2>Spending by category — {month}</h2>
        {chartData.length === 0 ? <p className="empty-state">Add an expense to see this chart.</p> : null}
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={92}>
              {chartData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </section>
      <section className="card action-panel">
        <button className="primary-btn" onClick={() => navigate('/app/expenses')}>Add Expense</button>
        <button className="ghost-btn" onClick={() => navigate('/app/reports')}>View Reports</button>
        <button className="ghost-btn" onClick={() => navigate('/app/settings')}>Edit Budget</button>
      </section>
      <section className="card metrics-inline">
        <div>
          <span>Total Spent</span>
          <strong>{currency(totalSpent)}</strong>
        </div>
        <div>
          <span>Total Budget</span>
          <strong>{currency(totalBudget)}</strong>
        </div>
      </section>
    </div>
  );
}
