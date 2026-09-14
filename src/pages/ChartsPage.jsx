import { useMemo } from 'react';
import { weeklySpending } from '../utils/statistics';
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { useApp } from '../context/AppContext';
import { currency } from '../utils/formatters';

const COLORS = ['#3b82f6', '#22c55e', '#facc15', '#ef4444', '#64748b', '#8b5cf6'];

export default function ChartsPage() {
  const { state } = useApp();
  const { pieData, weeklyData } = useMemo(() => {
    const spentByCategory = state.expenses.reduce((totals, expense) => {
      totals[expense.categoryId] = (totals[expense.categoryId] || 0) + Number(expense.amount);
      return totals;
    }, {});
    return {
      pieData: state.categories
        .map((category) => ({ name: category.name, value: spentByCategory[category.id] || 0 }))
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value),
      weeklyData: weeklySpending(state.expenses),
    };
  }, [state.categories, state.expenses]);

  return (
    <div className="two-column-grid">
      <section className="card">
        <h2>Spending Trend</h2>
        {pieData.length === 0 ? <p className="empty-state">Add an expense to see spending trends.</p> : null}
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
              {pieData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </section>
      <section className="card">
        <h2>Weekly spending — last 5 weeks</h2>
        <p>Monday–Sunday; labels show the week start date.</p>
        {weeklyData.some((item) => item.total > 0) ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weeklyData}>
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip formatter={(value) => currency(value)} />
              <Bar dataKey="total" fill="#22c55e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="empty-state chart-empty">No expenses were recorded during this period.</p>}
      </section>
      <section className="card full-span">
        <h2>Key Insights</h2>
        <ul className="insight-list">
          {pieData.slice(0, 3).map((item, index) => (
            <li key={item.name}>#{index + 1} {item.name}: {currency(item.value)}</li>
          ))}
          {pieData.length === 0 ? <li>No spending insights are available yet.</li> : null}
          <li>The weekly chart covers the current week and the four preceding calendar weeks.</li>
        </ul>
      </section>
    </div>
  );
}
