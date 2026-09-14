import { generateId } from "../utils/formatters.js";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_EXPENSES,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_SETTINGS,
  DEFAULT_USER,
} from "../data/defaultData.js";

export function createBook(demo = false) {
  return {
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    expenses: demo ? DEFAULT_EXPENSES.map((e) => ({ ...e })) : [],
    notifications: demo ? [...DEFAULT_NOTIFICATIONS] : [],
    settings: { ...DEFAULT_SETTINGS },
    alertLevels: {},
  };
}
function bookOf(state) {
  const { categories, expenses, notifications, settings, alertLevels } = state;
  return { categories, expenses, notifications, settings, alertLevels };
}
function saveAccount(state) {
  return state.session.user
    ? { ...state.accounts, [state.session.user.email]: bookOf(state) }
    : state.accounts;
}
function repairBook(book) {
  const categories = book.categories.map((c) => ({ ...c }));
  const expenses = book.expenses.map((e) => ({ ...e }));
  expenses.forEach((e) => {
    if (!categories.some((c) => c.id === e.categoryId)) {
      if (
        e.categoryId === "food" &&
        categories.some((c) => c.id === "groceries")
      )
        e.categoryId = "groceries";
      else
        categories.push({
          id: e.categoryId,
          name: "Recovered category (" + e.categoryId + ")",
          budget: 0,
        });
    }
  });
  return {
    ...bookOf(book),
    categories,
    expenses,
    settings: { ...DEFAULT_SETTINGS, ...book.settings },
    alertLevels: book.alertLevels || {},
  };
}
export function createInitialState(saved) {
  if (!saved)
    return {
      session: { isAuthenticated: false, user: null },
      accounts: { [DEFAULT_USER.email]: createBook(true) },
      ...createBook(),
    };
  const accounts = Object.fromEntries(
    Object.entries(saved.accounts || {}).map(([email, book]) => [
      email,
      repairBook(book),
    ]),
  );
  // Legacy data has no owner. Preserve it under the active account, or the demo account.
  const owner = saved.session.user?.email || DEFAULT_USER.email;
  if (!saved.accounts || saved.session.isAuthenticated)
    accounts[owner] = repairBook(saved);
  const initialBook = (!saved.accounts || saved.session.isAuthenticated)
    ? accounts[owner]
    : createBook();
  return {
    ...saved,
    session: { isAuthenticated: false, user: null },
    accounts,
    ...initialBook,
  };
}

function createNotification(title, message, type = "info") {
  return {
    id: generateId(),
    title,
    message,
    type,
    createdAt: new Date().toISOString(),
  };
}

function reduceAction(state, action) {
  switch (action.type) {
    case "LOGIN": {
      const accounts = saveAccount(state);
      const book = accounts[action.payload.email] || createBook();
      return {
        ...state,
        ...book,
        accounts,
        session: { isAuthenticated: true, user: action.payload },
      };
    }
    case "LOAD_REMOTE_DATA":
      return {
        ...state,
        categories: action.payload.categories,
        expenses: action.payload.expenses,
        settings: { ...DEFAULT_SETTINGS, ...action.payload.settings },
        alertLevels: {},
      };
    case "LOGOUT":
      return {
        ...state,
        ...createBook(),
        accounts: saveAccount(state),
        session: { isAuthenticated: false, user: null },
      };
    case "ADD_EXPENSE": {
      const expenses = [action.payload, ...state.expenses];
      const notifications = state.settings.transactionNotifications
        ? [
            createNotification(
              "Expense added",
              `${action.meta.categoryName} • €${action.payload.amount}`,
              "success",
            ),
            ...state.notifications,
          ]
        : state.notifications;
      return { ...state, expenses, notifications };
    }
    case "UPDATE_EXPENSE": {
      const expenses = state.expenses.map((item) =>
        item.id === action.payload.id ? action.payload : item,
      );
      const notifications = state.settings.transactionNotifications
        ? [
            createNotification(
              "Expense updated",
              `${action.meta.categoryName} updated on ${action.payload.date}`,
              "info",
            ),
            ...state.notifications,
          ]
        : state.notifications;
      return { ...state, expenses, notifications };
    }
    case "DELETE_EXPENSE": {
      const expenses = state.expenses.filter(
        (item) => item.id !== action.payload.id,
      );
      const notifications = state.settings.transactionNotifications
        ? [
            createNotification(
              "Expense deleted",
              `${action.payload.categoryName} • €${action.payload.amount}`,
              "warning",
            ),
            ...state.notifications,
          ]
        : state.notifications;
      return { ...state, expenses, notifications };
    }
    case "UPSERT_CATEGORY": {
      const exists = state.categories.some(
        (item) => item.id === action.payload.id,
      );
      const categories = exists
        ? state.categories.map((item) =>
            item.id === action.payload.id ? action.payload : item,
          )
        : [...state.categories, action.payload];
      return { ...state, categories };
    }
    case "DELETE_CATEGORY":
      if (state.expenses.some((item) => item.categoryId === action.payload))
        return state;
      return {
        ...state,
        categories: state.categories.filter(
          (item) => item.id !== action.payload,
        ),
      };
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case "PUSH_NOTIFICATION":
      return {
        ...state,
        notifications: [
          createNotification(
            action.payload.title,
            action.payload.message,
            action.payload.type,
          ),
          ...state.notifications,
        ],
      };
    default:
      return state;
  }
}

function updateAlerts(state) {
  if (!state.session.isAuthenticated || !state.settings.budgetAlerts)
    return state;
  const spentByCategory = state.expenses.reduce((totals, expense) => {
    totals[expense.categoryId] =
      (totals[expense.categoryId] || 0) + Number(expense.amount);
    return totals;
  }, {});
  const levels = {};
  const notifications = [];
  state.categories.forEach((category) => {
    const spent = spentByCategory[category.id] || 0;
    const ratio = category.budget > 0 ? spent / category.budget : 0;
    const level = ratio >= 1 ? 100 : ratio >= 0.8 ? 80 : 0;
    levels[category.id] = level;
    if (level > (state.alertLevels?.[category.id] || 0))
      notifications.push(
        createNotification(
          category.name +
            (level === 100
              ? " budget reached or exceeded"
              : " budget reached 80%"),
          level === 100
            ? "You have reached or exceeded the budget for " +
                category.name +
                "."
            : "You are close to the spending limit for " + category.name + ".",
          "warning",
        ),
      );
  });
  return {
    ...state,
    alertLevels: levels,
    notifications: [...notifications, ...state.notifications],
  };
}
export function reducer(state, action) {
  const next = reduceAction(state, action);
  if (next === state) return state;
  const checked = updateAlerts(next);
  return { ...checked, accounts: saveAccount(checked) };
}
