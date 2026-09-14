import { todayString, isValidDate } from './formatters.js';

export function validateExpense(form) {
  if (!String(form.amount).trim() || !String(form.categoryName).trim()) {
    return 'Mandatory fields cannot be blank';
  }

  const amount = Number(form.amount);
  if (
    !Number.isFinite(amount) ||
    amount > 999999999.99 ||
    amount <= 0 ||
    !/^\d+(\.\d{1,2})?$/.test(String(form.amount))
  ) {
    return 'Amount must be between 0.01 and 999999999.99 with up to 2 decimals';
  }

  if (!isValidDate(form.date)) return 'Please enter a valid expense date';

  if (form.date > todayString()) {
    return 'Future date selection is not allowed';
  }

  if (form.notes.length > 500) {
    return 'Notes cannot exceed 500 characters';
  }

  return '';
}

export function validateCategory(name, budget, existingCategories, currentId) {
  if (!name.trim()) {
    return 'Category name is required';
  }

  if (
    existingCategories.some(
      (item) =>
        item.name.toLowerCase() === name.trim().toLowerCase() &&
        item.id !== currentId
    )
  ) {
    return 'Duplicate Category is not allowed';
  }

  if (!/^\d+(\.\d{1,2})?$/.test(String(budget)) || Number(budget) <= 0 || !Number.isFinite(Number(budget)) || Number(budget) > 999999999.99) {
    return 'Budget limit must be between 0.01 and 999999999.99 with up to 2 decimals';
  }

  return '';
}

export function validateReportFilters(fromDate, toDate) {
  if ((fromDate && !isValidDate(fromDate)) || (toDate && !isValidDate(toDate))) return 'Please enter valid report dates';
  if (fromDate && toDate && fromDate > toDate) {
    return 'From Date cannot be greater than To Date';
  }

  const today = todayString();

  if ((fromDate && fromDate > today) || (toDate && toDate > today)) {
    return 'Future date selection is barred';
  }

  return '';
}