import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { startOfWeek } from '../lib/time';

const DAY_COLUMNS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' }
];

const TIMESHEET_STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  needs_changes: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
};

function formatDateKey(date) {
  const value = date instanceof Date ? date : new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatWeekLabel(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString('en-IN', opts)} – ${end.toLocaleDateString('en-IN', opts)}`;
}

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date;
  });
}

function createEmptyRow() {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return {
    id,
    project: '',
    activity: '',
    description: '',
    monday: '',
    tuesday: '',
    wednesday: '',
    thursday: '',
    friday: '',
    saturday: '',
    sunday: ''
  };
}

function normalizeHours(value) {
  if (value === '') return '';
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return '';
  if (numeric > 24) return '24';
  return String(numeric);
}

function sumRowHours(row) {
  return DAY_COLUMNS.reduce((sum, column) => sum + Number(row[column.key] || 0), 0);
}

function isDayColumnKey(key) {
  return DAY_COLUMNS.some((column) => column.key === key);
}

function formatStatusLabel(status) {
  return String(status || 'draft').replace(/_/g, ' ');
}

function isFutureDate(dateKey) {
  return dateKey > formatDateKey(new Date());
}

function isDayApproved(approvedDays, dateKey) {
  return approvedDays.has(dateKey);
}

export default function TimesheetPage() {
  const { user, profile } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [sheetId, setSheetId] = useState(null);
  const [rows, setRows] = useState([createEmptyRow()]);
  const [sheetStatus, setSheetStatus] = useState('draft');
  const [approvalComment, setApprovalComment] = useState('');
  const [reviewedAt, setReviewedAt] = useState('');
  const [submittedAt, setSubmittedAt] = useState('');
  const [statusHistory, setStatusHistory] = useState([]);
  const [conflictFlags, setConflictFlags] = useState([]);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [approvedDays, setApprovedDays] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  const weekStart = useMemo(() => startOfWeek(new Date(selectedDate)), [selectedDate]);
  const weekStartKey = useMemo(() => formatDateKey(weekStart), [weekStart]);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekEndKey = useMemo(() => formatDateKey(weekDays[6]), [weekDays]);
  const isFutureWeek = useMemo(() => weekStartKey > formatDateKey(new Date()), [weekStartKey]);
  const isAdmin = profile?.role === 'admin';
  // Sheet-level editable: employee needs draft/needs_changes; admin always editable (non-future)
  const sheetEditable = isAdmin
    ? !isFutureWeek
    : ['draft', 'needs_changes'].includes(sheetStatus) && !isFutureWeek;

  const totalHours = useMemo(() => rows.reduce((sum, row) => sum + sumRowHours(row), 0), [rows]);
  const filledDays = useMemo(() => {
    const counts = new Set();
    rows.forEach((row) => {
      DAY_COLUMNS.forEach((column) => {
        if (Number(row[column.key] || 0) > 0) counts.add(column.key);
      });
    });
    return counts.size;
  }, [rows]);

  const hasFilledTimesheet = totalHours > 0;
  const isApprovedSheet = sheetStatus === 'approved';

  const boardToneClass = isApprovedSheet
    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-900/10'
    : hasFilledTimesheet
      ? 'border-sky-200 bg-sky-50/50 dark:border-sky-900/40 dark:bg-sky-900/10'
      : 'border-[#dddddd] bg-white dark:border-[#444444] dark:bg-[#2b2b2b]';

  const dayTotals = useMemo(
    () =>
      DAY_COLUMNS.map((column) =>
        rows.reduce((sum, row) => sum + Number(row[column.key] || 0), 0)
      ),
    [rows]
  );

  useEffect(() => {
    let active = true;

    async function loadSheet() {
      setLoading(true);
      const { data, error } = await supabase
        .from('weekly_timesheets')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start', weekStartKey)
        .maybeSingle();

      if (!active) return;

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      if (data) {
        setSheetId(data.id);
        setRows(Array.isArray(data.rows) && data.rows.length ? data.rows : [createEmptyRow()]);
        setSheetStatus(data.status || 'draft');
        setApprovalComment(data.approval_comment || '');
        setReviewedAt(data.reviewed_at || '');
        setSubmittedAt(data.submitted_at || '');
        setStatusHistory(Array.isArray(data.status_history) ? data.status_history : []);
        setConflictFlags(Array.isArray(data.conflict_flags) ? data.conflict_flags : []);

        // Build per-day approved set from ALL approved sheets for this user
        if (data.status === 'approved') {
          const days = new Set();
          const WEEK_DAYS_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          (data.rows || []).forEach((row) => {
            WEEK_DAYS_ORDER.forEach((dayKey, idx) => {
              if (Number(row[dayKey] || 0) > 0) {
                const date = new Date(`${weekStartKey}T00:00:00`);
                date.setDate(date.getDate() + idx);
                days.add(formatDateKey(date));
              }
            });
          });
          setApprovedDays(days);
        } else {
          setApprovedDays(new Set());
        }
      } else {
        setSheetId(null);
        setRows([createEmptyRow()]);
        setSheetStatus('draft');
        setApprovalComment('');
        setReviewedAt('');
        setSubmittedAt('');
        setStatusHistory([]);
        setConflictFlags([]);
        setApprovedDays(new Set());
      }

      setLoading(false);
    }

    if (user?.id && weekStartKey) {
      void loadSheet();
    }

    return () => {
      active = false;
    };
  }, [user?.id, weekStartKey]);

  useEffect(() => {
    let active = true;

    async function loadAssignedProjects() {
      const response = profile?.role === 'admin'
        ? await supabase
            .from('projects')
            .select('name, is_active')
            .eq('is_active', true)
            .order('name', { ascending: true })
        : await supabase
            .from('employee_project_assignments')
            .select('projects(name, is_active)')
            .eq('user_id', user.id);

      if (!active) return;

      if (response.error) {
        toast.error(response.error.message);
        return;
      }

      const names = profile?.role === 'admin'
        ? (response.data || []).map((row) => row.name).filter(Boolean)
        : (response.data || []).map((row) => row.projects?.name).filter(Boolean);

      setAvailableProjects([...new Set(names)].sort((a, b) => a.localeCompare(b)));
    }

    if (user?.id) {
      void loadAssignedProjects();
    }

    return () => {
      active = false;
    };
  }, [user?.id, profile?.role]);

  // #16: Warn on unsaved changes before navigating away
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // #10: Real-time notifications for timesheet status changes
  useEffect(() => {
    if (!user?.id || isAdmin) return;
    const channel = supabase
      .channel(`timesheet-notify-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'weekly_timesheets', filter: `user_id=eq.${user.id}` }, (payload) => {
        const newStatus = payload.new?.status;
        const oldStatus = payload.old?.status;
        if (newStatus && newStatus !== oldStatus) {
          const week = payload.new?.week_start || '';
          if (newStatus === 'approved') toast.success(`Timesheet for week of ${week} was approved!`);
          else if (newStatus === 'rejected') toast.error(`Timesheet for week of ${week} was rejected.`);
          else if (newStatus === 'needs_changes') toast(`Timesheet for week of ${week} needs changes.`, { icon: '✏️' });
        }
      });
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, isAdmin]);

  const updateRow = (rowId, key, value) => {
    const nextValue = isDayColumnKey(key) ? normalizeHours(value) : value;
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, [key]: nextValue } : row)));
    setIsDirty(true);
  };

  const addRow = () => setRows((current) => [...current, createEmptyRow()]);

  const removeRow = (rowId) => {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== rowId) : current));
  };

  // A cell is editable if: sheet is editable AND day is not future AND day is not individually approved
  const cellEditable = (date) => {
    if (!sheetEditable) return false;
    const dateKey = formatDateKey(date);
    if (isFutureDate(dateKey)) return false;
    if (!isAdmin && isDayApproved(approvedDays, dateKey)) return false;
    return true;
  };

  // Whether the whole sheet toolbar (Add Row, Save, Submit) is usable
  const editableByEmployee = sheetEditable;

  const saveSheet = async (nextStatus = 'draft') => {
    if (!user?.id) return;

    if (isFutureWeek) {
      toast.error('Future weeks cannot be filled yet.');
      return;
    }

    if (nextStatus === 'submitted' && totalHours <= 0) {
      toast.error('Add at least one hour before submitting.');
      return;
    }

    if (!isAdmin) {
      const hasInvalidProject = rows.some((row) => {
        const rowHours = sumRowHours(row);
        if (rowHours <= 0) return false;
        return !row.project || !availableProjects.includes(row.project);
      });
      if (hasInvalidProject) {
        toast.error('Each filled row must use an assigned project.');
        return;
      }
    }

    // Block any value entered in a future day cell
    const hasFutureValue = weekDays.some((date, index) => {
      const dateKey = formatDateKey(date);
      if (!isFutureDate(dateKey)) return false;
      return rows.some((row) => Number(row[DAY_COLUMNS[index].key] || 0) > 0);
    });
    if (hasFutureValue) {
      toast.error('Future dates cannot have hours. Remove those values before saving.');
      return;
    }

    // #2: Gap day warning — warn if there are zero-hour days between filled days
    if (nextStatus === 'submitted') {
      const filledIndices = DAY_COLUMNS.map((col, idx) => {
        const total = rows.reduce((s, r) => s + Number(r[col.key] || 0), 0);
        return total > 0 ? idx : -1;
      }).filter((i) => i >= 0);

      if (filledIndices.length >= 2) {
        const minIdx = filledIndices[0];
        const maxIdx = filledIndices[filledIndices.length - 1];
        const gapDays = [];
        for (let i = minIdx + 1; i < maxIdx; i++) {
          const total = rows.reduce((s, r) => s + Number(r[DAY_COLUMNS[i].key] || 0), 0);
          const dateKey = formatDateKey(weekDays[i]);
          if (total === 0 && !isFutureDate(dateKey)) gapDays.push(DAY_COLUMNS[i].label);
        }
        if (gapDays.length > 0) {
          const confirmed = window.confirm(`No hours logged for ${gapDays.join(', ')} between filled days. Is this intentional (e.g. leave day)?`);
          if (!confirmed) return;
        }
      }
    }
    const cleanedRows = rows.map((row) => ({
      ...row,
      monday: normalizeHours(row.monday),
      tuesday: normalizeHours(row.tuesday),
      wednesday: normalizeHours(row.wednesday),
      thursday: normalizeHours(row.thursday),
      friday: normalizeHours(row.friday),
      saturday: normalizeHours(row.saturday),
      sunday: normalizeHours(row.sunday)
    }));

    const historyEntry = {
      status: nextStatus,
      comment: nextStatus === 'submitted' ? 'Submitted for approval' : '',
      changed_at: new Date().toISOString(),
      changed_by: user.id
    };
    const nextHistory = [...statusHistory, historyEntry];

    const payload = {
      id: sheetId || undefined,
      user_id: user.id,
      week_start: weekStartKey,
      week_end: weekEndKey,
      rows: cleanedRows,
      total_hours: Number(cleanedRows.reduce((sum, row) => sum + sumRowHours(row), 0).toFixed(2)),
      status: nextStatus,
      submitted_at: nextStatus === 'submitted' ? new Date().toISOString() : submittedAt || null
    };

    if (isAdmin) {
      payload.approval_comment = approvalComment || '';
      payload.reviewed_at = reviewedAt || null;
      payload.reviewed_by = null;
      payload.status_history = nextHistory;
    }

    setSaving(true);
    const { error } = await supabase
      .from('weekly_timesheets')
      .upsert(payload, { onConflict: 'user_id,week_start' })
      .select('*')
      .single();
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSheetStatus(nextStatus);
    setSubmittedAt(nextStatus === 'submitted' ? new Date().toISOString() : submittedAt);
    setStatusHistory(nextHistory);
    setIsDirty(false);
    toast.success(nextStatus === 'submitted' ? 'Timesheet sent for approval' : 'Timesheet saved');
  };

  if (loading) {
    return <div className="card p-6 text-sm text-slate-500">Loading timesheet...</div>;
  }

  return (
    <div className="space-y-7">
      <div className="card p-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal text-white shadow shadow-teal/30">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-ink dark:text-white">Timesheet </h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Select a week, fill project cards, save progress, and send it for approval when ready.
          </p>
          <p className="mt-3 text-xs tracking-wide text-slate-500 dark:text-slate-400">
            Rule: past and today are editable, future dates are always locked. Approved days are immutable.
          </p>
        </div>
      </div>

      <div className="card flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
        <label className="space-y-2 text-sm font-medium">
          <span>Select Week</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setSelectedDate(formatDateKey(new Date()))}
          >
            Current Week
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const next = new Date(weekStart);
              next.setDate(next.getDate() - 7);
              setSelectedDate(formatDateKey(next));
            }}
          >
            Previous Week
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const next = new Date(weekStart);
              next.setDate(next.getDate() + 7);
              setSelectedDate(formatDateKey(next));
            }}
            disabled={!isFutureWeek && weekStartKey >= formatDateKey(new Date())}
          >
            Next Week
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Week</p>
          <p className="mt-2 text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">{formatWeekLabel(weekStart)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Hours</p>
          <p className="mt-2 text-lg font-bold tracking-tight text-teal">{totalHours.toFixed(2)}h</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Filled Days</p>
          <p className="mt-2 text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">{filledDays}/7</p>
        </div>
      </div>

      {isFutureWeek ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
          Future weeks cannot be filled yet. Select the current or a past week.
        </div>
      ) : null}

      <section className={`card space-y-5 border p-4 md:p-6 ${boardToneClass}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Weekly Rows</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-ink dark:text-white">Project Breakdown</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Enter project hours in quarter-hour increments. Each day accepts up to 24 hours.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {weekDays.map((date, index) => {
              const total = dayTotals[index] || 0;
              return (
                <div
                  key={DAY_COLUMNS[index].key}
                  className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-800"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{DAY_COLUMNS[index].label}</p>
                  <p className="text-[10px] text-slate-400">{formatDateKey(date).slice(5)}</p>
                  <p className="mt-1 text-xs font-bold text-teal">{total.toFixed(2)}h</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {rows.map((row, rowIndex) => {
            const rowTotal = sumRowHours(row);
            const toneClass = rowTotal > 0
              ? (isApprovedSheet
                ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-900/20'
                : 'border-sky-200 bg-sky-50/80 dark:border-sky-900/40 dark:bg-sky-900/20')
              : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/20';

            return (
              <article key={row.id} className={`rounded-2xl border p-4 shadow-sm md:p-5 ${toneClass}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Row {rowIndex + 1}</p>
                    <p className="mt-1 text-base font-semibold tracking-tight text-slate-800 dark:text-slate-100">{rowTotal.toFixed(2)}h logged</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
                    onClick={() => removeRow(row.id)}
                    disabled={!editableByEmployee || rows.length === 1}
                  >
                    Remove Row
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>Project</span>
                    <select
                      value={row.project}
                      onChange={(event) => updateRow(row.id, 'project', event.target.value)}
                      disabled={!editableByEmployee}
                      className="field rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    >
                      <option value="">Select project</option>
                      {[...new Set([...availableProjects, row.project].filter(Boolean))].map((projectName) => (
                        <option key={projectName} value={projectName}>{projectName}</option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>Activity / Phase</span>
                    <input
                      value={row.activity}
                      onChange={(event) => updateRow(row.id, 'activity', event.target.value)}
                      disabled={!editableByEmployee}
                      placeholder="Activity / Phase"
                      className="field rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    />
                  </label>

                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2 xl:col-span-1">
                    <span>Description</span>
                    <textarea
                      value={row.description}
                      onChange={(event) => updateRow(row.id, 'description', event.target.value)}
                      disabled={!editableByEmployee}
                      placeholder="Description"
                      className="field min-h-[44px] rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    />
                  </label>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                  {weekDays.map((date, index) => {
                    const dayKey = DAY_COLUMNS[index].key;
                    const editable = cellEditable(date);
                    const dateKey = formatDateKey(date);
                    const isFuture = isFutureDate(dateKey);
                    const isDayLocked = !isAdmin && isDayApproved(approvedDays, dateKey);
                    const hasDayHours = Number(row[dayKey] || 0) > 0;
                    const filledCellClass = hasDayHours
                      ? (isDayLocked
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200'
                        : isApprovedSheet
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200'
                          : 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-200')
                      : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100';

                    const lockReason = isFuture ? 'Future' : isDayLocked ? 'Approved' : null;

                    return (
                      <label
                        key={`${row.id}-${dayKey}`}
                        className="rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{DAY_COLUMNS[index].label}</span>
                          <span className="text-[10px] text-slate-400">{dateKey.slice(5)}</span>
                        </div>
                        {lockReason ? (
                          <div className="mt-2 rounded-lg bg-slate-100 px-1 py-1.5 text-center text-[10px] font-semibold text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                            {lockReason}
                          </div>
                        ) : (
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            max="24"
                            value={row[dayKey]}
                            onChange={(event) => updateRow(row.id, dayKey, event.target.value)}
                            disabled={!editable}
                            placeholder={editable ? '0.00' : 'Locked'}
                            tabIndex={editable ? 0 : -1}
                            className={`field mt-2 rounded-lg text-center ${filledCellClass} ${editable ? '' : 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500'}`}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn-secondary" onClick={addRow} disabled={!editableByEmployee}>
          + Add Row
        </button>

        <div className="hidden flex-wrap gap-2 sm:flex">
          {isDirty ? <span className="self-center text-xs text-amber-500 dark:text-amber-400">Unsaved changes</span> : null}
          <button type="button" className="btn-secondary" onClick={() => saveSheet('draft')} disabled={saving || !editableByEmployee}>
            Save Draft
          </button>
          <button type="button" className="btn-primary" onClick={() => saveSheet('submitted')} disabled={saving || !editableByEmployee}>
            Get Approval
          </button>
        </div>
      </div>

      <div className="sm:hidden">
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="mx-auto flex w-full max-w-xl gap-2">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => saveSheet('draft')}
              disabled={saving || !editableByEmployee}
            >
              Save Draft
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => saveSheet('submitted')}
              disabled={saving || !editableByEmployee}
            >
              Get Approval
            </button>
          </div>
        </div>
        <div className="h-20" />
      </div>

      {profile?.role === 'admin' ? (
        <div className="card p-5">
          <h2 className="text-lg font-semibold">Review</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Submitted At</p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{submittedAt ? new Date(submittedAt).toLocaleString() : '-'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Approved / Reviewed At</p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{reviewedAt ? new Date(reviewedAt).toLocaleString() : '-'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Manager Comment</p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{approvalComment || '-'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Conflict Flags</p>
              {conflictFlags.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {conflictFlags.map((flag) => (
                    <span key={flag} className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      {flag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">-</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
