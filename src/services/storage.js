const KEY = 'student-budget-planner-state';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function validBook(book) {
  return object(book) && Array.isArray(book.categories) && book.categories.every(c => object(c) && typeof c.id === 'string' && typeof c.name === 'string' && Number.isFinite(c.budget))
    && Array.isArray(book.expenses) && book.expenses.every(e => object(e) && typeof e.id === 'string' && typeof e.categoryId === 'string' && typeof e.date === 'string' && typeof e.notes === 'string' && Number.isFinite(e.amount))
    && Array.isArray(book.notifications) && book.notifications.every(n => object(n) && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.message === 'string' && typeof n.createdAt === 'string') && object(book.settings);
}
export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!validBook(saved) || !object(saved.session)) return null;
    if (saved.accounts && (!object(saved.accounts) || !Object.values(saved.accounts).every(validBook))) return null;
    return saved;
  } catch { return null; }
}
export function saveState(state) {
  try {
    const { users: _legacyUsers, ...safeState } = state;
    localStorage.setItem(KEY, JSON.stringify({
      ...safeState,
      session: { isAuthenticated: false, user: null },
    }));
    return true;
  }
  catch { return false; }
}
