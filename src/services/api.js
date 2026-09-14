import { fetchAuthSession } from 'aws-amplify/auth';
import { authService } from './auth';

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request(path, options = {}) {
  if (!baseUrl) throw new Error('AWS API URL is missing from the frontend configuration.');
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Your session has expired. Please log in again.');

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  let body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`);
  // Support both normal API Gateway responses and locally proxied Lambda envelopes.
  if (body && typeof body.body === 'string' && Number.isInteger(body.statusCode)) {
    body = body.body ? JSON.parse(body.body) : null;
  }
  return body;
}

const json = (method, value) => ({ method, body: JSON.stringify(value) });

export const budgetApi = {
  login: authService.login,
  register: authService.register,
  confirmRegistration: authService.confirmRegistration,
  resendRegistrationCode: authService.resendRegistrationCode,
  currentUser: authService.currentUser,
  logout: authService.logout,
  loadBudgetData: async () => {
    const [expenses, categories, settings] = await Promise.all([
      request('/expenses'),
      request('/categories'),
      request('/settings'),
    ]);
    if (!Array.isArray(expenses) || !Array.isArray(categories) || !settings || Array.isArray(settings)) {
      throw new Error('AWS API returned an unexpected data format.');
    }
    return { expenses, categories, settings };
  },
  createExpense: (expense) => request('/expenses', json('POST', expense)),
  updateExpense: (expense) => request(`/expenses/${encodeURIComponent(expense.id)}`, json('PUT', expense)),
  deleteExpense: (id) => request(`/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createCategory: (category) => request('/categories', json('POST', category)),
  updateCategory: (category) => request(`/categories/${encodeURIComponent(category.id)}`, json('PUT', category)),
  deleteCategory: (id) => request(`/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateSettings: (settings) => request('/settings', json('PATCH', settings)),
};
