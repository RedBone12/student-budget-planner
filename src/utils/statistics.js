import { todayString, isValidDate } from './formatters.js';
// Calendar weeks run Monday through Sunday; include the current week and four preceding weeks.
export function weeklySpending(expenses, now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return Array.from({length:5}, (_, index) => {
    const start = new Date(monday); start.setDate(start.getDate() - (4-index)*7);
    const end = new Date(start); end.setDate(end.getDate()+7);
    const from = todayString(start), to = todayString(end);
    return {week:from, total:expenses.filter(e => isValidDate(e.date) && e.date >= from && e.date < to).reduce((sum,e)=>sum+Number(e.amount),0)};
  });
}
