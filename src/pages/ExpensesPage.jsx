import { useMemo, useState } from 'react';
import ExpenseForm from '../components/ExpenseForm';
import RecentExpenses from '../components/RecentExpenses';
import { useApp } from '../context/AppContext';
import { validateExpense } from '../utils/validators';
import { budgetApi } from '../services/api';

export default function ExpensesPage() {
  const { state, dispatch } = useApp();
  const [error, setError] = useState('');
  const [editingExpense, setEditingExpense] = useState(null);
  const [saving, setSaving] = useState(false);

  const recentExpenses = useMemo(
    () => [...state.expenses].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [state.expenses]
  );

  const handleSubmit = async (form, reset) => {
    const message = validateExpense(form);
    if (message) return setError(message);

    const inputCategoryName = form.categoryName.trim();

    let matchedCategory = state.categories.find(
      (item) => item.name.toLowerCase() === inputCategoryName.toLowerCase()
    );

    if (!matchedCategory) {
      try {
        matchedCategory = await budgetApi.createCategory({ name: inputCategoryName, budget: 0 });
        dispatch({ type: 'UPSERT_CATEGORY', payload: matchedCategory });
      } catch (requestError) {
        return setError(requestError.message);
      }
    }

    const payload = {
      ...(editingExpense ? { id: editingExpense.id } : {}),
      amount: Number(form.amount),
      categoryId: matchedCategory.id,
      date: form.date,
      notes: form.notes,
    };

    setSaving(true);
    try {
      const savedExpense = editingExpense
        ? await budgetApi.updateExpense(payload)
        : await budgetApi.createExpense(payload);
      dispatch({
        type: editingExpense ? 'UPDATE_EXPENSE' : 'ADD_EXPENSE',
        payload: savedExpense,
        meta: { categoryName: matchedCategory.name },
      });
      setError('');
      setEditingExpense(null);
      reset();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (expense) => {
    const categoryName =
      state.categories.find((item) => item.id === expense.categoryId)?.name || 'Category';

    if (window.confirm('Delete this expense record?')) {
      try {
        await budgetApi.deleteExpense(expense.id);
        dispatch({ type: 'DELETE_EXPENSE', payload: { ...expense, categoryName } });
      } catch (requestError) {
        setError(requestError.message);
      }
    }
  };

  return (
    <div className="stack-gap">
      <ExpenseForm
        categories={state.categories}
        onSubmit={handleSubmit}
        editingExpense={editingExpense}
        error={error}
        onCancelEdit={() => setEditingExpense(null)}
        submitting={saving}
      />

      <RecentExpenses
        expenses={recentExpenses}
        categories={state.categories}
        onEdit={setEditingExpense}
        onDelete={handleDelete}
      />
    </div>
  );
}
