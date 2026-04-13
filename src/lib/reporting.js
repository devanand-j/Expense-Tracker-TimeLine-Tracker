import { calculateDurationHours } from './time';

function toDateKey(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function isWithinRange(dateValue, startDate, endDate) {
  const dateKey = toDateKey(dateValue);
  if (!dateKey) return false;
  if (startDate && dateKey < startDate) return false;
  if (endDate && dateKey > endDate) return false;
  return true;
}

function sortByDateAscending(a, b) {
  return a.localeCompare(b);
}

export function buildRangeSummary(timeline = [], expenses = [], startDate = '', endDate = '') {
  const filteredTimeline = timeline.filter((entry) => isWithinRange(entry.date, startDate, endDate));
  const filteredExpenses = expenses.filter((entry) => isWithinRange(entry.date, startDate, endDate));

  const dailyMap = new Map();
  const categoryMap = new Map();

  let totalHours = 0;
  let totalExpenses = 0;

  filteredTimeline.forEach((entry) => {
    const dateKey = toDateKey(entry.date);
    const hours = Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time));
    totalHours += hours;

    const current = dailyMap.get(dateKey) || { date: dateKey, hours: 0, expenses: 0 };
    current.hours += hours;
    dailyMap.set(dateKey, current);
  });

  filteredExpenses.forEach((entry) => {
    const dateKey = toDateKey(entry.date);
    const amount = Number(entry.amount || 0);
    totalExpenses += amount;

    const current = dailyMap.get(dateKey) || { date: dateKey, hours: 0, expenses: 0 };
    current.expenses += amount;
    dailyMap.set(dateKey, current);

    const categoryName = entry.category || 'Uncategorized';
    categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + amount);
  });

  const dailyRows = Array.from(dailyMap.values())
    .sort((a, b) => sortByDateAscending(a.date, b.date))
    .map((row) => ({
      date: row.date,
      workingHours: Number(row.hours.toFixed(2)),
      expenses: Number(row.expenses.toFixed(2))
    }));

  const categoryRows = Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({
      category,
      amount: Number(amount.toFixed(2))
    }));

  const exportRows = [
    { section: 'Summary', date: '', workingHours: Number(totalHours.toFixed(2)), expenses: Number(totalExpenses.toFixed(2)), category: '', amount: '' },
    ...dailyRows.map((row) => ({
      section: 'Daily Total',
      date: row.date,
      workingHours: row.workingHours,
      expenses: row.expenses,
      category: '',
      amount: ''
    })),
    ...categoryRows.map((row) => ({
      section: 'Category Total',
      date: '',
      workingHours: '',
      expenses: '',
      category: row.category,
      amount: row.amount
    }))
  ];

  return {
    filteredTimeline,
    filteredExpenses,
    totalHours: totalHours.toFixed(2),
    totalExpenses: totalExpenses.toFixed(2),
    dailyRows,
    categoryRows,
    exportRows
  };
}
