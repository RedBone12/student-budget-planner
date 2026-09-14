import { useEffect, useState } from 'react';
import { todayString } from '../utils/formatters';

const createEmptyForm = () => ({ amount: '', categoryName: '', date: todayString(), notes: '' });

export default function ExpenseForm({ categories, onSubmit, editingExpense, error, onCancelEdit, submitting = false }) {
  const [form, setForm] = useState(createEmptyForm);

  useEffect(() => {
    if (editingExpense) {
      const matchedCategory = categories.find(
        (item) => item.id === editingExpense.categoryId
      );

      setForm({
        amount: String(editingExpense.amount),
        categoryName: matchedCategory?.name || '',
        date: editingExpense.date,
        notes: editingExpense.notes,
      });
    } else {
      setForm(createEmptyForm());
    }
  }, [editingExpense, categories]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(form, () => setForm(createEmptyForm()));
  };

  return (
    <section className="card">
      <div className="section-band">Add Expense</div>
      <h2>{editingExpense ? 'Edit Expense' : 'Add Expense'}</h2>

      <form className="expense-form" onSubmit={handleSubmit}>
        <label>
          Amount (€) *
          <input
            type="number"
            name="amount"
            value={form.amount}
            onChange={handleChange}
            placeholder="0.00"
            min="0.01"
            max="999999999.99"
            step="0.01"
            inputMode="decimal"
            required
          />
        </label>

        <label>
          Category *
          <input
            name="categoryName"
            list="expense-categories"
            value={form.categoryName}
            onChange={handleChange}
            placeholder="Select or type category"
            required
          />
          <datalist id="expense-categories">
            {categories.map((category) => (
              <option key={category.id} value={category.name} />
            ))}
          </datalist>
        </label>

        <label>
          Date *
          <input
            type="date"
            name="date"
            max={todayString()}
            value={form.date}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Notes
          <input
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Input notes here..."
            maxLength={500}
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="button-row">
          <button type="reset" className="ghost-btn" onClick={() => setForm(createEmptyForm())}>
            Reset
          </button>

          {editingExpense ? (
            <button type="button" className="ghost-btn" onClick={onCancelEdit}>
              Cancel
            </button>
          ) : null}

          <button type="submit" className="primary-btn" disabled={submitting}>
            {submitting ? 'Saving…' : editingExpense ? 'Save Expense' : 'Add Expense'}
          </button>
        </div>
      </form>
    </section>
  );
}
