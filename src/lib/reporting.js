import { calculateDurationHours } from './time';

const MINUTES_PER_DAY = 24 * 60;
const DAY_SHIFT_START = 6 * 60;
const DAY_SHIFT_END = 18 * 60;

const ONSITE_TYPES = new Set(['onsite', 'team_lunch', 'client_visit']);

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

function isOnsiteType(type) {
  return ONSITE_TYPES.has(type);
}

function parseTimeToMinutes(value) {
  if (!value) return null;
  const [hh, mm] = String(value).slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function overlapMinutes(startA, endA, startB, endB) {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  return Math.max(0, end - start);
}

function splitDayNightHours(startTime, endTime) {
  const start = parseTimeToMinutes(startTime);
  const endRaw = parseTimeToMinutes(endTime);
  if (start == null || endRaw == null) return { dayHours: 0, nightHours: 0 };

  let end = endRaw;
  if (end <= start) end += MINUTES_PER_DAY;

  const totalMinutes = end - start;
  let dayMinutes = 0;
  const minWindow = Math.floor(start / MINUTES_PER_DAY);
  const maxWindow = Math.floor((end - 1) / MINUTES_PER_DAY);

  for (let window = minWindow; window <= maxWindow; window += 1) {
    const dayStart = window * MINUTES_PER_DAY + DAY_SHIFT_START;
    const dayEnd = window * MINUTES_PER_DAY + DAY_SHIFT_END;
    dayMinutes += overlapMinutes(start, end, dayStart, dayEnd);
  }

  const nightMinutes = Math.max(totalMinutes - dayMinutes, 0);
  return {
    dayHours: Number((dayMinutes / 60).toFixed(2)),
    nightHours: Number((nightMinutes / 60).toFixed(2))
  };
}

function formatTimeForRange(timeValue) {
  const mins = parseTimeToMinutes(timeValue);
  if (mins == null) return '';
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

export function formatHoursAsLabel(hoursValue) {
  const hours = Number(hoursValue || 0);
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes <= 0) return '-';

  const wholeHours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (wholeHours > 0 && mins > 0) return `${wholeHours} hrs ${mins} min`;
  if (wholeHours > 0) return `${wholeHours} hrs`;
  return `${mins} min`;
}

function toTimeRangeLabel(startTime, endTime) {
  const start = formatTimeForRange(startTime);
  const end = formatTimeForRange(endTime);
  if (!start || !end) return '-';
  return `${start} to ${end}`;
}

function toDayName(dateValue) {
  if (!dateValue) return '';
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
}

function collectDailyTimelineRows(entries = [], startDate = '', endDate = '') {
  const filteredTimeline = entries.filter((entry) => isWithinRange(entry.date, startDate, endDate));
  const dailyMap = new Map();

  filteredTimeline.forEach((entry) => {
    const dateKey = toDateKey(entry.date);
    const hours = Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time));
    const shiftSplit = splitDayNightHours(entry.start_time, entry.end_time);
    const current = dailyMap.get(dateKey) || {
      date: dateKey,
      day: toDayName(dateKey),
      workingHours: 0,
      onSiteHours: 0,
      remoteSupportHours: 0,
      dayShiftHours: 0,
      nightShiftHours: 0,
      projects: new Set(),
      onSiteTimings: [],
      remoteTimings: []
    };

    current.workingHours += hours;
    current.dayShiftHours += shiftSplit.dayHours;
    current.nightShiftHours += shiftSplit.nightHours;
    if (entry.project) current.projects.add(entry.project);

    const timingLabel = toTimeRangeLabel(entry.start_time, entry.end_time);
    if (isOnsiteType(entry.type)) {
      current.onSiteHours += hours;
      current.onSiteTimings.push(timingLabel);
    } else {
      current.remoteSupportHours += hours;
      current.remoteTimings.push(timingLabel);
    }

    dailyMap.set(dateKey, current);
  });

  return {
    filteredTimeline,
    dailyRows: Array.from(dailyMap.values())
      .sort((a, b) => sortByDateAscending(a.date, b.date))
      .map((row) => ({
        date: row.date,
        day: row.day,
        workingHours: Number(row.workingHours.toFixed(2)),
        onSiteHours: Number(row.onSiteHours.toFixed(2)),
        remoteSupportHours: Number(row.remoteSupportHours.toFixed(2)),
        dayShiftHours: Number(row.dayShiftHours.toFixed(2)),
        nightShiftHours: Number(row.nightShiftHours.toFixed(2)),
        projectLabel: row.projects.size === 0
          ? '-'
          : (row.projects.size === 1 ? Array.from(row.projects)[0] : 'Multiple Projects'),
        onSiteTimings: row.onSiteTimings.length ? row.onSiteTimings.join(' | ') : '-',
        remoteTimings: row.remoteTimings.length ? row.remoteTimings.join(' | ') : '-'
      }))
  };
}

function eachDateInclusive(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return [];
  const days = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (cursor <= end) {
    days.push(toInputDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function toInputDate(dateValue) {
  const dt = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildRangeSummary(timeline = [], expenses = [], startDate = '', endDate = '') {
  const timelineSummary = collectDailyTimelineRows(timeline, startDate, endDate);
  const filteredTimeline = timelineSummary.filteredTimeline;
  const filteredExpenses = expenses.filter((entry) => isWithinRange(entry.date, startDate, endDate));

  const dailyMap = new Map(
    timelineSummary.dailyRows.map((row) => [row.date, { ...row, expenses: 0 }])
  );
  const categoryMap = new Map();

  let totalHours = 0;
  let totalExpenses = 0;

  filteredTimeline.forEach((entry) => {
    const hours = Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time));
    totalHours += hours;
  });

  filteredExpenses.forEach((entry) => {
    const dateKey = toDateKey(entry.date);
    const amount = Number(entry.amount || 0);
    totalExpenses += amount;

    const current = dailyMap.get(dateKey) || {
      date: dateKey,
      day: toDayName(dateKey),
      workingHours: 0,
      onSiteHours: 0,
      remoteSupportHours: 0,
      dayShiftHours: 0,
      nightShiftHours: 0,
      projectLabel: '-',
      onSiteTimings: '-',
      remoteTimings: '-',
      expenses: 0
    };
    current.expenses += amount;
    dailyMap.set(dateKey, current);

    const categoryName = entry.category || 'Uncategorized';
    categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + amount);
  });

  const dailyRows = Array.from(dailyMap.values())
    .sort((a, b) => sortByDateAscending(a.date, b.date))
    .map((row) => ({
      date: row.date,
      day: row.day || toDayName(row.date),
      workingHours: Number((row.workingHours || 0).toFixed(2)),
      onSiteHours: Number((row.onSiteHours || 0).toFixed(2)),
      remoteSupportHours: Number((row.remoteSupportHours || 0).toFixed(2)),
      dayShiftHours: Number((row.dayShiftHours || 0).toFixed(2)),
      nightShiftHours: Number((row.nightShiftHours || 0).toFixed(2)),
      projectLabel: row.projectLabel || '-',
      onSiteTimings: row.onSiteTimings || '-',
      remoteTimings: row.remoteTimings || '-',
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
      day: row.day,
      project: row.projectLabel,
      workingHours: row.workingHours,
      onSiteHours: row.onSiteHours,
      remoteSupportHours: row.remoteSupportHours,
      dayShiftHours: row.dayShiftHours,
      nightShiftHours: row.nightShiftHours,
      onSiteTimings: row.onSiteTimings,
      remoteTimings: row.remoteTimings,
      expenses: row.expenses,
      category: '',
      amount: ''
    })),
    ...categoryRows.map((row) => ({
      section: 'Category Total',
      date: '',
      day: '',
      project: '',
      workingHours: '',
      onSiteHours: '',
      remoteSupportHours: '',
      dayShiftHours: '',
      nightShiftHours: '',
      onSiteTimings: '',
      remoteTimings: '',
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

export function buildAllStaffTimesheet(entries = [], profiles = [], startDate = '', endDate = '') {
  const days = eachDateInclusive(startDate, endDate);
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile.name]));
  const usersMap = new Map();

  entries
    .filter((entry) => isWithinRange(entry.date, startDate, endDate))
    .forEach((entry) => {
      const userId = entry.user_id;
      const userName = entry.profiles?.name || profileMap.get(userId) || 'Staff';
      if (!usersMap.has(userId)) usersMap.set(userId, { userId, userName, entries: [] });
      usersMap.get(userId).entries.push(entry);
    });

  profiles.forEach((profile) => {
    if (!usersMap.has(profile.id)) {
      usersMap.set(profile.id, { userId: profile.id, userName: profile.name || 'Staff', entries: [] });
    }
  });

  const users = Array.from(usersMap.values())
    .map((user) => {
      const summary = collectDailyTimelineRows(user.entries, startDate, endDate);
      const byDate = new Map(summary.dailyRows.map((row) => [row.date, row]));

      const rows = days.map((dateKey) => {
        const base = byDate.get(dateKey);
        if (base) return base;
        return {
          date: dateKey,
          day: toDayName(dateKey),
          workingHours: 0,
          onSiteHours: 0,
          remoteSupportHours: 0,
          dayShiftHours: 0,
          nightShiftHours: 0,
          projectLabel: '-',
          onSiteTimings: '-',
          remoteTimings: '-'
        };
      });

      return {
        userId: user.userId,
        userName: user.userName,
        rows
      };
    })
    .sort((a, b) => a.userName.localeCompare(b.userName));

  return { startDate, endDate, users };
}
