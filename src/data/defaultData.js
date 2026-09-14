import { generateId } from '../utils/formatters.js';

export const DEFAULT_CATEGORIES = [
  { id: 'groceries', name: 'Groceries', budget: 250 },
  { id: 'transport', name: 'Transport', budget: 120 },
  { id: 'rent', name: 'Rent', budget: 600 },
  { id: 'entertainment', name: 'Entertainment', budget: 150 },
  { id: 'study-materials', name: 'Study materials', budget: 80 },
  { id: 'utilities', name: 'Utilities', budget: 90 },
];

export const DEFAULT_SETTINGS = {
  monthlySummary: true,
  budgetAlerts: true,
  dailyReminder: true,
  transactionNotifications: true,
};

export const DEFAULT_EXPENSES = [
  { id: generateId(), amount: 100, categoryId: 'groceries', date: '2026-03-01', notes: 'Aldi' },
  { id: generateId(), amount: 100, categoryId: 'rent', date: '2026-03-02', notes: 'July rent' },
  { id: generateId(), amount: 100, categoryId: 'transport', date: '2026-03-03', notes: 'Leap card' },
  { id: generateId(), amount: 90, categoryId: 'entertainment', date: '2026-03-04', notes: 'Cinema' },
];

export const DEFAULT_NOTIFICATIONS = [];

export const DEFAULT_USER = {
  fullName: 'Student User',
  email: 'student@example.com',
};
