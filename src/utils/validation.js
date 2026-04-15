export function validatePositiveAmount(amount) {
  const value = Number(amount);
  return Number.isFinite(value) && value > 0;
}

export function validateReceiptFile(file) {
  if (!file) return { ok: true };
  const allowedTypes = ['image/jpeg', 'image/png'];
  if (!allowedTypes.includes(file.type)) {
    return { ok: false, message: 'Only JPG and PNG files are allowed.' };
  }

  const maxBytes = 1 * 1024 * 1024;
  if (file.size > maxBytes) {
    return { ok: false, message: 'File size must be less than 1MB.' };
  }

  return { ok: true };
}

export function validateTimelineTimes(start, end) {
  return Boolean(start && end);
}
