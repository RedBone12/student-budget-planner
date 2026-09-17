import { useState } from "react";
import { useApp } from "../context/AppContext";
import { validateCategory } from "../utils/validators";
import { budgetApi } from '../services/api';

export default function SettingsPage() {
  const { state, dispatch } = useApp();
  const [form, setForm] = useState({ id: "", name: "", budget: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const saveCategory = async (event) => {
    event?.preventDefault();
    const message = validateCategory(
      form.name,
      form.budget,
      state.categories,
      form.id,
    );
    if (message) return setError(message);
    setSaving(true);
    try {
      const input = { ...(form.id ? { id: form.id } : {}), name: form.name.trim(), budget: Number(form.budget) };
      const category = form.id
        ? await budgetApi.updateCategory(input)
        : await budgetApi.createCategory(input);
      dispatch({ type: "UPSERT_CATEGORY", payload: category });
      setForm({ id: "", name: "", budget: "" });
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (category) => {
    if (state.expenses.some(expense => expense.categoryId === category.id)) {
      setError('This category has expenses. Move or delete those expenses before deleting it.');
      return;
    }
    try {
      await budgetApi.deleteCategory(category.id);
      dispatch({type:'DELETE_CATEGORY', payload:category.id});
      if (form.id === category.id) setForm({id:'', name:'', budget:''});
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const toggleSetting = async (key) => {
    if (
      state.settings[key] &&
      !window.confirm("Are you sure want to disable it ?")
    )
      return;
    const nextSettings = { ...state.settings, [key]: !state.settings[key] };
    try {
      const settings = await budgetApi.updateSettings(nextSettings);
      dispatch({ type: "UPDATE_SETTINGS", payload: settings });
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="two-column-grid">
      <section className="card">
        <h2>Budget Settings</h2>
        <div className="settings-list">
          {state.categories.map((category) => (
            <div key={category.id} className="category-row">
              <span>{category.name}</span>
              <span>Budget limit</span>
              <strong>{category.budget}</strong>
              <button
                className="ghost-btn small"
                onClick={() =>
                  setForm({
                    id: category.id,
                    name: category.name,
                    budget: String(category.budget),
                  })
                }
              >
                Edit
              </button>
              <button
                className="ghost-btn small danger"
                onClick={() =>
                  deleteCategory(category)
                }
              >
                Delete
              </button>
            </div>
          ))}
        </div>
        <form className="settings-form" onSubmit={saveCategory}>
          <label>
            Category name
            <input
              list="settings-categories"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </label>
          <datalist id="settings-categories">
            {state.categories.map((category) => (
              <option key={category.id} value={category.name} />
            ))}
          </datalist>{" "}
          <label>
            Budget limit (€)
            <input
              type="number"
              min="0.01"
              max="999999999.99"
              step="0.01"
              inputMode="decimal"
              value={form.budget}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, budget: e.target.value }))
              }
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Budget'}
          </button>
        </form>
      </section>
      <section className="card">
        <h2>Notification Settings</h2>
        <p className="setting-note">Budget and transaction alerts work in this browser. Email and daily delivery need the backend service.</p>
        <div className="toggle-list">
          {[
            ["monthlySummary", "Monthly summary email (preference only)"],
            ["budgetAlerts", "Alert when category exceeds 80%"],
            ["dailyReminder", "Daily spending reminder (preference only)"],
            ["transactionNotifications", "Expense activity notifications"],
          ].map(([key, label]) => (
            <label key={key} className="toggle-row">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={state.settings[key]}
                onChange={() => toggleSetting(key)}
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
