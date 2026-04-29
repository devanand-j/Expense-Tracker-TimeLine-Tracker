export const EXPENSE_CATEGORIES = [
  'Food & Beverages',
  'Travel',
  'Groceries',
  'Tools or Hardware',
  'Porter delivery for Hardware',
  'Miscellaneous'
];

export const EXPENSE_CATEGORY_ICONS = {
  'Food & Beverages': '🍽️',
  'Travel': '🚕',
  'Groceries': '🛒',
  'Tools or Hardware': '🧰',
  'Porter delivery for Hardware': '📦',
  'Miscellaneous': '📦'
};

export const PORTER_EXPENSE_CATEGORY = 'Porter delivery for Hardware';
export const MISC_EXPENSE_CATEGORY = 'Miscellaneous';

function asValidCategoryList(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const normalized = [];

  values.forEach((value) => {
    const category = String(value || '').trim();
    if (!category || !EXPENSE_CATEGORIES.includes(category) || seen.has(category)) return;
    seen.add(category);
    normalized.push(category);
  });

  return normalized;
}

export function extractExpenseCategories(expense) {
  if (Array.isArray(expense)) {
    const direct = asValidCategoryList(expense);
    return direct.length ? direct : [MISC_EXPENSE_CATEGORY];
  }

  const fromJson = asValidCategoryList(expense?.categories);
  if (fromJson.length) return fromJson;

  const fallback = String(expense?.category || '').trim();
  if (EXPENSE_CATEGORIES.includes(fallback)) return [fallback];

  return [MISC_EXPENSE_CATEGORY];
}

export function hasExpenseCategory(expense, category) {
  return extractExpenseCategories(expense).includes(category);
}

export function getPrimaryExpenseCategory(expense) {
  return extractExpenseCategories(expense)[0] || MISC_EXPENSE_CATEGORY;
}

export function formatExpenseCategoryList(expense) {
  return extractExpenseCategories(expense).join(', ');
}

export function categoryShareRows(expense) {
  const categories = extractExpenseCategories(expense);
  const amount = Number(expense?.amount || 0);
  const divisor = categories.length || 1;
  const share = amount / divisor;

  return categories.map((category) => ({
    category,
    amount: share
  }));
}

export function buildCategoryTotals(expenses = []) {
  const map = new Map();

  expenses.forEach((expense) => {
    categoryShareRows(expense).forEach((row) => {
      map.set(row.category, (map.get(row.category) || 0) + row.amount);
    });
  });

  return Object.fromEntries(map.entries());
}
