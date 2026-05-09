import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import DatePicker from '../components/DatePicker';
import Modal from '../components/Modal';
import ReceiptUpload from '../components/ReceiptUpload';
import TimePicker from '../components/TimePicker';
import { useAuth } from '../context/AuthContext';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_ICONS,
  MISC_EXPENSE_CATEGORY,
  PORTER_EXPENSE_CATEGORY,
  extractExpenseCategories,
  formatExpenseCategoryList,
  getPrimaryExpenseCategory,
  hasExpenseCategory
} from '../lib/expenseCategories';
import { supabase } from '../lib/supabaseClient';
import { toDateKey, todayKey, formatDate } from '../lib/time';
import { validatePositiveAmount } from '../utils/validation';

function normalizeStatusHistory(value) {
  if (!Array.isArray(value)) return [];
  return [...value].sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
}

function formatHistoryDate(value) {
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

const STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
};

const CUSTOM_PROJECTS_KEY = 'vseek_custom_projects';

function loadCustomProjects() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PROJECTS_KEY) || '[]'); } catch { return []; }
}

function saveCustomProject(name) {
  const existing = loadCustomProjects();
  if (!existing.includes(name)) {
    localStorage.setItem(CUSTOM_PROJECTS_KEY, JSON.stringify([...existing, name]));
  }
}

function getCurrentTimeValue() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

const defaultForm = {
  id: null,
  date: '',
  expense_time: '',
  project: '',
  categories: ['Food & Beverages'],
  amount: '',
  notes: '',
  receipt_url: '',
  status: 'draft'
};

const WEEK_DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Use shared date helpers from lib/time
const dateKeyFromDate = toDateKey;

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateKeyFromDate(date);
}

function toHours(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

// Collect dates that have hours in APPROVED timesheets only
function collectApprovedTimesheetDays(sheets) {
  const result = new Set();
  (sheets || []).forEach((sheet) => {
    if (sheet.status !== 'approved') return;
    if (Array.isArray(sheet.approved_days) && sheet.approved_days.length > 0) {
      sheet.approved_days.forEach((dateStr) => {
        if (dateStr) result.add(String(dateStr).slice(0, 10));
      });
      return;
    }

    if (!sheet.week_start || !Array.isArray(sheet.rows)) return;
    sheet.rows.forEach((row) => {
      WEEK_DAY_KEYS.forEach((dayKey, idx) => {
        if (toHours(row?.[dayKey]) > 0) result.add(addDays(sheet.week_start, idx));
      });
    });
  });
  return result;
}

function collectApprovedLeaveDays(leaves) {
  const result = new Set();
  (leaves || []).forEach((leave) => {
    if (leave.status !== 'approved' || !leave.start_date || !leave.end_date) return;
    const cursor = new Date(`${leave.start_date}T00:00:00`);
    const end = new Date(`${leave.end_date}T00:00:00`);
    while (cursor <= end) {
      result.add(dateKeyFromDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  return result;
}

export default function ExpensePage() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [filters, setFilters] = useState({ category: '', project: '', from: '', to: '' });
  const [availableProjects, setAvailableProjects] = useState([]);
  const [customProjects, setCustomProjects] = useState(loadCustomProjects);
  const [isOtherProject, setIsOtherProject] = useState(false);
  const [otherProjectInput, setOtherProjectInput] = useState('');
  const [offsiteDates, setOffsiteDates] = useState([]);
  const [approvedTimesheetDays, setApprovedTimesheetDays] = useState([]);
  const [approvedLeaveDays, setApprovedLeaveDays] = useState([]);
  const [saving, setSaving] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const isMisc = form.categories.includes(MISC_EXPENSE_CATEGORY);
  const maxExpenseDate = useMemo(() => todayKey(), []);
  const offsiteDateSet = useMemo(() => new Set(offsiteDates), [offsiteDates]);
  const approvedTimesheetDateSet = useMemo(() => new Set(approvedTimesheetDays), [approvedTimesheetDays]);
  const approvedLeaveDateSet = useMemo(() => new Set(approvedLeaveDays), [approvedLeaveDays]);

  // #1: Orphan detection â€” expense dates no longer backed by a filled timesheet or approved leave
  const orphanExpenseDates = useMemo(() => {
    if (isAdmin) return new Set();
    const orphans = new Set();
    items.forEach((entry) => {
      if (entry.status === 'approved') return; // approved expenses are immutable, skip
      if (entry.status === 'draft') return; // draft expenses are work-in-progress, skip
      if (!entry.date) return;
      const onLeave = approvedLeaveDateSet.has(entry.date);
      const onTimesheet = approvedTimesheetDateSet.has(entry.date);
      if (!onLeave && !onTimesheet) orphans.add(entry.date);
    });
    return orphans;
  }, [items, approvedTimesheetDateSet, approvedLeaveDateSet, isAdmin]);

  const calendarDayToneMap = useMemo(() => {
    const tones = {};
    approvedTimesheetDays.forEach((dateKey) => { tones[dateKey] = 'green'; });
    approvedLeaveDays.forEach((dateKey) => { tones[dateKey] = 'red'; });
    return tones;
  }, [approvedTimesheetDays, approvedLeaveDays]);

  const getExpenseDateBlockReason = (dateValue, categories = form.categories) => {
    if (!dateValue || isAdmin) return '';
    if (dateValue > maxExpenseDate) return 'Future expense dates are not allowed.';
    const onApprovedLeaveDate = approvedLeaveDateSet.has(dateValue);
    const porterOnLeaveException = onApprovedLeaveDate && categories.includes(PORTER_EXPENSE_CATEGORY);
    if (onApprovedLeaveDate && !porterOnLeaveException) return 'Expense cannot be raised on approved leave dates.';
    if (offsiteDateSet.has(dateValue)) return 'Expense cannot be raised for an offsite day.';
    if (!approvedTimesheetDateSet.has(dateValue) && !porterOnLeaveException) {
      return 'Expense can only be added on dates covered by an approved timesheet or an approved leave.';
    }
    return '';
  };

  const isBlockedExpenseDate = (dateValue) => Boolean(getExpenseDateBlockReason(dateValue));

  const fetchExpenses = useCallback(async () => {
    let expenseQuery = supabase.from('expenses').select('*, profiles(name)').order('date', { ascending: false });
    if (!isAdmin) expenseQuery = expenseQuery.eq('user_id', user.id);

    const projectsQuery = isAdmin
      ? supabase.from('projects').select('name, is_active').eq('is_active', true).order('name', { ascending: true })
      : supabase.from('employee_project_assignments').select('projects(name, is_active)').eq('user_id', user.id);

    const offsiteQuery = isAdmin
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('timeline_entries').select('date').eq('user_id', user.id).eq('type', 'offsite');

    const approvedTimesheetQuery = isAdmin
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('weekly_timesheets').select('week_start, status, approved_days, rows').eq('user_id', user.id);

    const leaveQuery = isAdmin
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('leave_requests').select('start_date, end_date, status').eq('user_id', user.id).eq('status', 'approved');

    const [expenseRes, offsiteRes, approvedTimesheetRes, leaveRes, projectsRes] = await Promise.all([
      expenseQuery,
      offsiteQuery,
      approvedTimesheetQuery,
      leaveQuery,
      projectsQuery
    ]);

    if (expenseRes.error) return toast.error(expenseRes.error.message);
    if (offsiteRes.error) return toast.error(offsiteRes.error.message);
    if (approvedTimesheetRes.error) return toast.error(approvedTimesheetRes.error.message);
    if (leaveRes.error) return toast.error(leaveRes.error.message);
    if (projectsRes.error) return toast.error(projectsRes.error.message);

    const projectNames = isAdmin
      ? (projectsRes.data || []).map((entry) => entry.name).filter(Boolean)
      : (projectsRes.data || []).map((entry) => entry.projects?.name).filter(Boolean);

    setItems(expenseRes.data || []);
    setAvailableProjects([...new Set(projectNames)].sort((a, b) => a.localeCompare(b)));
    setOffsiteDates([...(new Set((offsiteRes.data || []).map((entry) => entry.date).filter(Boolean)))]);
    setApprovedTimesheetDays([...collectApprovedTimesheetDays(approvedTimesheetRes.data || [])]);
    setApprovedLeaveDays([...collectApprovedLeaveDays(leaveRes.data || [])]);
  }, [profile?.role, user.id]);

  useEffect(() => {
    void fetchExpenses();
  }, [profile?.role, user.id]);

  useEffect(() => {
    if (!user?.id || isAdmin) return undefined;

    const channel = supabase
      .channel(`expenses-notify-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `user_id=eq.${user.id}` }, () => {
        void fetchExpenses();
      });
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, isAdmin, fetchExpenses]);

  const filtered = useMemo(() => items.filter((entry) => {
    if (filters.category && !hasExpenseCategory(entry, filters.category)) return false;
    if (filters.project && entry.project !== filters.project) return false;
    if (filters.from && entry.date < filters.from) return false;
    if (filters.to && entry.date > filters.to) return false;
    return true;
  }), [items, filters]);

  const approvedFiltered = useMemo(() => filtered.filter((entry) => entry.status === 'approved'), [filtered]);
  const approvedTotalFiltered = useMemo(() => approvedFiltered.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), [approvedFiltered]);
  const canModifyExpense = (entry) => isAdmin || !['approved'].includes(entry.status);

  const submit = async (event, submitMode = 'pending') => {
    event.preventDefault();

    if (!form.date) return toast.error('Date is required.');
    if (!form.project) return toast.error('Project is required.');
    if (!form.expense_time) return toast.error('Time is required.');
    if (!isAdmin && !availableProjects.includes(form.project) && !customProjects.includes(form.project)) return toast.error('Selected project is not assigned to you.');
    if (!form.categories.length) return toast.error('Select at least one category.');

    const blockedReason = getExpenseDateBlockReason(form.date, form.categories);
    if (blockedReason) return toast.error(blockedReason);
    if (!validatePositiveAmount(form.amount)) return toast.error('Amount must be greater than 0');
    if (isMisc && !form.notes?.trim()) return toast.error('Notes are required for Miscellaneous expenses');

    setSaving(true);
    const nextStatus = submitMode === 'draft' ? 'draft' : 'pending';
    const payload = {
      user_id: form.id ? form.user_id || user.id : user.id,
      date: form.date,
      expense_time: form.expense_time,
      project: form.project,
      categories: form.categories,
      category: form.categories[0],
      amount: Number(form.amount),
      notes: form.notes,
      receipt_url: form.receipt_url,
      status: nextStatus
    };

    const query = form.id
      ? supabase.from('expenses').update(payload).eq('id', form.id)
      : supabase.from('expenses').insert(payload);

    const { error } = await query;
    setSaving(false);

    if (error) return toast.error(error.message);
    if (isOtherProject && form.project) {
      saveCustomProject(form.project);
      setCustomProjects(loadCustomProjects());
    }
    toast.success(submitMode === 'draft' ? 'Expense saved as draft' : (form.id ? 'Expense submitted' : 'Expense submitted'));
    setForm(defaultForm);
    setIsOtherProject(false);
    setOtherProjectInput('');
    setOpen(false);
    void fetchExpenses();
  };

  const remove = async (id) => {
    const target = items.find((entry) => entry.id === id);
    if (target && !canModifyExpense(target)) return toast.error('Approved expenses cannot be deleted.');
    const ok = window.confirm('Delete this expense? This cannot be undone.');
    if (!ok) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Expense deleted');
    void fetchExpenses();
  };

  const openAdd = async () => {
    await fetchExpenses();
    const sortedAllowedDates = [...approvedTimesheetDays]
      .filter((dateKey) => !isBlockedExpenseDate(dateKey))
      .sort((a, b) => (a < b ? 1 : -1));

    const defaultDate = !isAdmin && !isBlockedExpenseDate(maxExpenseDate)
      ? maxExpenseDate
      : (!isAdmin ? (sortedAllowedDates[0] || '') : '');

    setIsOtherProject(false);
    setOtherProjectInput('');
    setForm({
      ...defaultForm,
      date: defaultDate,
      expense_time: getCurrentTimeValue(),
      project: availableProjects[0] || '',
      categories: [EXPENSE_CATEGORIES[0]]
    });
    setOpen(true);
  };

  const openEdit = (entry) => {
    if (!canModifyExpense(entry)) return toast.error('Approved expenses cannot be edited.');
    const allKnown = [...availableProjects, ...customProjects];
    const isCustom = entry.project && !allKnown.includes(entry.project);
    setIsOtherProject(isCustom);
    setOtherProjectInput(isCustom ? entry.project : '');
    setForm({
      ...defaultForm,
      ...entry,
      expense_time: entry.expense_time || getCurrentTimeValue(),
      project: entry.project || '',
      categories: extractExpenseCategories(entry)
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink dark:text-white">Expenses</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {filtered.length} records · Approved: {approvedFiltered.length} · Admin Approved Expense Total: ₹{approvedTotalFiltered.toFixed(2)}
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openAdd}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Expense
        </button>
      </div>

      <div className="card grid gap-3 p-4 dark:border-slate-700 dark:bg-slate-800 md:grid-cols-5">
        <select className="field dark:border-slate-600 dark:bg-slate-700 dark:text-white" value={filters.category} onChange={(e) => setFilters((x) => ({ ...x, category: e.target.value }))}>
          <option value="">All Categories</option>
          {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select className="field dark:border-slate-600 dark:bg-slate-700 dark:text-white" value={filters.project} onChange={(e) => setFilters((x) => ({ ...x, project: e.target.value }))}>
          <option value="">All Projects</option>
          {[...new Set(items.map((entry) => entry.project).filter(Boolean))].map((project) => <option key={project} value={project}>{project}</option>)}
        </select>
        <DatePicker value={filters.from} onChange={(v) => setFilters((x) => ({ ...x, from: v }))} placeholder="From date" />
        <DatePicker value={filters.to} onChange={(v) => setFilters((x) => ({ ...x, to: v }))} placeholder="To date" />
        <button className="btn-secondary flex items-center justify-center gap-2 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600" onClick={() => setFilters({ category: '', project: '', from: '', to: '' })}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          Clear
        </button>
      </div>

      <div className="card overflow-hidden dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70">
                {['Date', 'Time', 'Project', 'Category', 'Amount', 'Status', 'Conflicts', 'Notes', 'Receipt', ...(profile?.role === 'admin' ? ['User'] : []), 'Actions'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">No expenses found. Add your first expense.</td></tr>
              ) : null}
              {filtered.map((entry) => (
                <tr key={entry.id} className="group transition hover:bg-slate-50/90 dark:hover:bg-slate-700/35">
                  <td className="px-4 py-3 font-medium text-ink dark:text-slate-100">{formatDate(entry.date)}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{entry.expense_time?.slice(0, 5) || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{entry.project || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      {(() => {
                        const IconComponent = EXPENSE_CATEGORY_ICONS[getPrimaryExpenseCategory(entry)];
                        return IconComponent ? <IconComponent className="h-4 w-4" /> : null;
                      })()}
                      <span className="text-slate-700 dark:text-slate-200">{formatExpenseCategoryList(entry)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-ink dark:text-slate-100">₹{Number(entry.amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[entry.status] || ''}`}>{entry.status}</span>
                    {orphanExpenseDates.has(entry.date) ? (
                      <span className="ml-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-300" title="Timesheet no longer covers this date">⚠ orphan</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{Array.isArray(entry.conflict_flags) && entry.conflict_flags.length ? entry.conflict_flags.join(', ') : '—'}</td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-slate-500 dark:text-slate-400">{entry.notes || '—'}</td>
                  <td className="px-4 py-3">
                    {entry.receipt_url ? <a href={entry.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal hover:bg-teal/20 transition dark:bg-teal/20 dark:text-teal-300">View</a> : <span className="text-slate-300 dark:text-slate-600">â€”</span>}
                  </td>
                  {profile?.role === 'admin' ? <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{entry.profiles?.name}</td> : null}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
                      <button onClick={() => setHistoryItem(entry)} aria-label="View status history" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-teal/40 hover:text-teal dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">History</button>
                      <button onClick={() => openEdit(entry)} aria-label="Edit expense" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-teal/40 hover:text-teal disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300" disabled={!canModifyExpense(entry)}>Edit</button>
                      <button onClick={() => remove(entry.id)} aria-label="Delete expense" className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-500 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400" disabled={!canModifyExpense(entry)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal title={form.id ? 'Edit Expense' : 'New Expense'} open={open} onClose={() => setOpen(false)}>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="form-label">Date <span className="text-red-500">*</span></label>
              <DatePicker
                value={form.date}
                onChange={(v) => setForm((x) => ({ ...x, date: v }))}
                placeholder="Pick a date"
                maxDate={isAdmin ? undefined : maxExpenseDate}
                disabledDates={isAdmin ? [] : offsiteDates}
                isDateDisabled={isAdmin ? undefined : (dateKey) => isBlockedExpenseDate(dateKey)}
                dayToneMap={isAdmin ? {} : calendarDayToneMap}
              />
              {!isAdmin ? <p className="mt-1 text-[11px] text-slate-400">Green: dates with approved timesheet hours. Red: approved leave (Porter delivery exception applies).</p> : null}
              {!isAdmin && form.date && isBlockedExpenseDate(form.date) ? <p className="mt-1 text-[11px] font-semibold text-red-500">{getExpenseDateBlockReason(form.date)}</p> : null}
            </div>
            <div>
              <label className="form-label">Time <span className="text-red-500">*</span></label>
              <TimePicker value={form.expense_time} onChange={(v) => setForm((x) => ({ ...x, expense_time: v }))} placeholder="Pick time" />
            </div>
          </div>

          <div>
            <label className="form-label">Project <span className="text-red-500">*</span></label>
            <select
              className="field dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              value={isOtherProject ? '__other__' : form.project}
              onChange={(e) => {
                if (e.target.value === '__other__') {
                  setIsOtherProject(true);
                  setOtherProjectInput('');
                  setForm((x) => ({ ...x, project: '' }));
                } else {
                  setIsOtherProject(false);
                  setOtherProjectInput('');
                  setForm((x) => ({ ...x, project: e.target.value }));
                }
              }}
              required={!isOtherProject}
            >
              <option value="">Select Project</option>
              {availableProjects.map((p) => <option key={p} value={p}>{p}</option>)}
              {customProjects.filter((p) => !availableProjects.includes(p)).map((p) => (
                <option key={p} value={p}>✓ {p}</option>
              ))}
              <option value="__other__">+ Others (type your own)</option>
            </select>
            {isOtherProject && (
              <input
                className="field mt-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                type="text"
                placeholder="Enter project name"
                value={otherProjectInput}
                onChange={(e) => {
                  setOtherProjectInput(e.target.value);
                  setForm((x) => ({ ...x, project: e.target.value.trim() }));
                }}
                required
                autoFocus
              />
            )}
            {!availableProjects.length && !customProjects.length ? <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">No projects assigned. Ask admin to assign a project before adding expense.</p> : null}
          </div>

          <div>
            <label className="form-label">Category <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {EXPENSE_CATEGORIES.map((category) => {
                const isSelected = form.categories[0] === category;
                const IconComponent = EXPENSE_CATEGORY_ICONS[category];
                return (
                  <label
                    key={category}
                    onClick={() => setForm((x) => ({ ...x, categories: [category] }))}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      isSelected
                        ? 'border-teal bg-teal text-white shadow shadow-teal/30'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-teal/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="expense-category"
                      checked={isSelected}
                      onChange={() => {}}
                      className="sr-only"
                    />
                    {IconComponent && <IconComponent className="h-4 w-4" />}
                    <span>{category}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="form-label">Amount (₹) <span className="text-red-500">*</span></label>
            <input className="field dark:border-slate-600 dark:bg-slate-700 dark:text-white" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm((x) => ({ ...x, amount: e.target.value }))} placeholder="0.00" />
          </div>

          <div>
            <label className="form-label">Notes {isMisc ? <span className="text-red-500">* (required for Miscellaneous)</span> : <span className="text-slate-400 font-normal">(optional)</span>}</label>
            <textarea className={`field resize-none dark:border-slate-600 dark:bg-slate-700 dark:text-white ${isMisc ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-200' : ''}`} rows={3} required={isMisc} value={form.notes} onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))} placeholder={isMisc ? 'Please describe this miscellaneous expense…' : 'Add a note…'} />
          </div>

          <ReceiptUpload userId={user.id} currentUrl={form.receipt_url} required onUploaded={(url) => setForm((x) => ({ ...x, receipt_url: url }))} />

          <div className="flex flex-col gap-2">
            <button className="btn-primary w-full py-3" type="button" disabled={saving} onClick={(e) => submit(e, 'pending')}>
              {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : (form.id ? 'Update & Submit' : 'Submit Expense')}
            </button>
            {!isAdmin ? (
              <button className="w-full py-2 text-sm font-medium text-slate-500 transition hover:text-teal dark:text-slate-400 dark:hover:text-teal" type="button" disabled={saving} onClick={(e) => submit(e, 'draft')}>
                {saving ? '...' : 'Save as Draft'}
              </button>
            ) : null}
          </div>
        </form>
      </Modal>

      <Modal title="Expense Status History" open={Boolean(historyItem)} onClose={() => setHistoryItem(null)}>
        {historyItem ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
              <p><span className="font-semibold">Date:</span> {historyItem.date}</p>
              <p><span className="font-semibold">Project:</span> {historyItem.project || '-'}</p>
              <p><span className="font-semibold">Categories:</span> {formatExpenseCategoryList(historyItem)}</p>
              <p><span className="font-semibold">Amount:</span> ₹{Number(historyItem.amount || 0).toFixed(2)}</p>
            </div>

            {normalizeStatusHistory(historyItem.status_history).length ? (
              <ul className="space-y-2">
                {normalizeStatusHistory(historyItem.status_history).map((event, index) => (
                  <li key={`${event.changed_at || index}-${event.status || 'status'}`} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                    <p className="font-semibold capitalize">{event.status || '-'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatHistoryDate(event.changed_at)}</p>
                    {event.comment ? <p className="mt-1 text-slate-600 dark:text-slate-300">{event.comment}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No status history yet.</p>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
