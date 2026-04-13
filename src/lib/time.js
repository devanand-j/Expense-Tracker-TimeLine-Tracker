export function calculateDurationHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const start = new Date(`1970-01-01T${startTime}:00`);
  const end = new Date(`1970-01-01T${endTime}:00`);
  let diffMs = end - start;

  if (diffMs < 0) {
    diffMs += 24 * 60 * 60 * 1000;
  }

  return Number((diffMs / (1000 * 60 * 60)).toFixed(2));
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
