export function normalizeStatusHistory(value) {
  if (!Array.isArray(value)) return [];
  return [...value].sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
}

export function formatHistoryDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  const hours = date.getHours() % 12 || 12;
  const mins = String(date.getMinutes()).padStart(2, '0');
  const suffix = date.getHours() >= 12 ? 'PM' : 'AM';
  return `${day}-${month}-${year} ${String(hours).padStart(2, '0')}:${mins} ${suffix}`;
}

export function isMissingSchemaTable(error, tableName) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('could not find the table') && msg.includes(String(tableName || '').toLowerCase());
}

export function getHoursSince(value) {
  if (!value) return 0;
  const then = new Date(value).getTime();
  if (!then) return 0;
  const diffMs = Date.now() - then;
  return diffMs / (1000 * 60 * 60);
}

export function slugify(value) {
  if (!value) return '';
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function normalizeConflictFlags(value) {
  if (!Array.isArray(value)) return [];
  return value;
}

export function formatSlaDuration(hours) {
  if (!Number.isFinite(hours)) return '-';
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  const rem = Math.floor(hours % 24);
  return `${days}d ${rem}h`;
}
