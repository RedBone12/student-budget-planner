export const emptyFilters = { categoryId: '', fromDate: '', toDate: '', minAmount: '', maxAmount: '' };
export function filterError(filters) {
  const { fromDate, toDate, minAmount, maxAmount } = filters;
  if (fromDate && toDate && fromDate > toDate) return 'Start date must not be after end date';
  for (const amount of [minAmount, maxAmount]) {
    if (amount !== '' && (!/^\d+(\.\d{1,2})?$/.test(String(amount)) || Number(amount) > 999999999.99)) return 'Enter a valid amount with up to two decimals';
  }
  if (minAmount !== '' && maxAmount !== '' && Number(minAmount) > Number(maxAmount)) return 'Minimum amount must not exceed maximum amount';
  return '';
}
export function filteredExpenses(expenses, filters) {
  if (filterError(filters)) return [];
  return expenses.filter(item => (!filters.categoryId || item.categoryId === filters.categoryId) &&
    (!filters.fromDate || item.date >= filters.fromDate) && (!filters.toDate || item.date <= filters.toDate) &&
    (filters.minAmount === '' || Math.round(item.amount * 100) >= Math.round(Number(filters.minAmount) * 100)) &&
    (filters.maxAmount === '' || Math.round(item.amount * 100) <= Math.round(Number(filters.maxAmount) * 100)));
}
export function readExpenseCsv(text, categories) {
  const records = []; let record = [], value = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  for (let index = 0; index <= text.length; index++) {
    const ch = text[index];
    if (quoted) {
      if (ch === '"' && text[index + 1] === '"') { value += '"'; index++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else if (ch === undefined) throw Error('CSV has an unclosed quoted field');
      else value += ch;
    } else if (ch === '"') {
      if (value || closed) throw Error('CSV quote must start a field');
      quoted = true;
    } else if (ch === ',' || ch === '\n' || ch === undefined) {
      record.push(value.replace(/\r$/, '')); value = ''; closed = false;
      if (ch !== ',') { if (record.some(cell => cell.trim())) records.push(record); record = []; }
    } else {
      if (closed && ch !== '\r') throw Error('Unexpected text after a quoted CSV field');
      if (!closed) value += ch;
    }
  }
  if (!records.length || records[0].map(cell => cell.trim().toLowerCase()).join(',') !== 'date,category,amount,notes') {
    throw Error('Use CSV columns in this order: date,category,amount,notes');
  }
  const rows = records.slice(1);
  if (!rows.length || rows.length > 50) throw Error('Import between 1 and 50 rows per file');
  const categoryIds = new Map(categories.map(item => [item.name.trim().toLowerCase(), item.id]));
  return rows.map((row, index) => {
    if (row.length !== 4) throw Error(`Row ${index + 2}: expected four columns`);
    const [date, name, amount, notes] = row.map(cell => cell.trim());
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date || date > new Date().toISOString().slice(0, 10)) throw Error(`Row ${index + 2}: use a valid date in YYYY-MM-DD, not in the future`);
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 999999999.99) throw Error(`Row ${index + 2}: enter a positive expense amount with up to two decimals`);
    if (!categoryIds.has(name.toLowerCase())) throw Error(`Row ${index + 2}: create category "${name}" in Settings first`);
    if (notes.length > 500) throw Error(`Row ${index + 2}: notes exceed 500 characters`);
    return { date, categoryId: categoryIds.get(name.toLowerCase()), amount: Number(amount), notes };
  });
}
