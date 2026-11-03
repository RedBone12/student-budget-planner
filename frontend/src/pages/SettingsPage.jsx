import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { validateCategory } from "../utils/validators";
import { budgetApi } from '../services/api';

export default function SettingsPage() {
  const { state, dispatch } = useApp();
  const [form, setForm] = useState({ id: "", name: "", budget: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingSetting, setUpdatingSetting] = useState(false);
  const [delivery, setDelivery] = useState(null);
  const [deliveryError, setDeliveryError] = useState('');
  useEffect(() => {
    let active = true;
    budgetApi.deliveryStatus().then(value => { if (active) setDelivery(value); })
      .catch(error => { if (active) setDeliveryError(error.message); });
    return () => { active = false; };
  }, []);

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
    if (updatingSetting) return;
    if (
      state.settings[key] &&
      !window.confirm("Are you sure want to disable it ?")
    )
      return;
    const nextSettings = { ...state.settings, [key]: !state.settings[key] };
    setUpdatingSetting(true);
    try {
      const settings = await budgetApi.updateSettings(nextSettings);
      dispatch({ type: "UPDATE_SETTINGS", payload: settings });
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally { setUpdatingSetting(false); }
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
        <p className="setting-note">Email runs daily at 09:00 UTC. Monthly summaries are sent on the first day of the month. Budget email alerts are checked daily. Browser activity notifications continue to work independently.</p>
        <p role="status">{delivery?.ready ? 'Email delivery is available for your verified account email.' : 'Email delivery is unavailable until sender and account-email verification is complete.'}</p>
        {delivery?.sandbox && <p>The email service is in restricted test mode. Your account email also needs email-provider verification; contact the app owner if delivery is unavailable.</p>}
        {deliveryError && <p role="alert" className="form-error">{deliveryError}</p>}
        <label className="toggle-row"><span>Enable scheduled email delivery</span>
          <input type="checkbox" checked={Boolean(state.settings.emailDeliveryEnabled)} disabled={updatingSetting || (!state.settings.emailDeliveryEnabled && !delivery?.ready)} onChange={() => toggleSetting('emailDeliveryEnabled')} />
        </label>
        <div className="toggle-list">
          {[
            ["monthlySummary", "Monthly summary email"],
            ["budgetAlerts", "Alert when category exceeds 80%"],
            ["dailyReminder", "Daily spending reminder email"],
            ["transactionNotifications", "Expense activity notifications"],
          ].map(([key, label]) => (
            <label key={key} className="toggle-row">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(state.settings[key])}
                disabled={updatingSetting}
                onChange={() => toggleSetting(key)}
              />
            </label>
          ))}
        </div>
        {delivery?.history?.length > 0 && <><h3>Recent email attempts</h3><ul>{delivery.history.map((item, index) => <li key={index}>{item.attemptedAt}: {item.status === 'ACCEPTED' ? 'Accepted by email provider (inbox delivery is not guaranteed)' : item.status === 'SENDING' ? 'Delivery outcome uncertain; automatic duplicate sends are suppressed' : 'Failed; will retry on the next scheduled attempt'}</li>)}</ul></>}
      </section>
    </div>
  );
}
