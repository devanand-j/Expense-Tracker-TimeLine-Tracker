export function calculateDurationHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;

  const parseToMinutes = (value) => {
    const parts = String(value).split(':');
    if (parts.length < 2) return null;
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  };

  const startMinutes = parseToMinutes(startTime);
  const endMinutes = parseToMinutes(endTime);
  if (startMinutes == null || endMinutes == null) return 0;

  let diffMinutes = endMinutes - startMinutes;

  if (diffMinutes < 0) {
    diffMinutes += 24 * 60;
  }

  return Number((diffMinutes / 60).toFixed(2));
}

export function startOfWeek(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay();
  const diff = current.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(current.setDate(diff));
}

export function formatDate(dateValue) {
  return new Date(dateValue).toLocaleDateString();
}
