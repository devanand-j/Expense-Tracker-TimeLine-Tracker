import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import DatePicker from '../components/DatePicker';
import Modal from '../components/Modal';
import TimePicker from '../components/TimePicker';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { calculateDurationHours } from '../lib/time';
import { validateTimelineTimes } from '../utils/validation';

const TYPES = [
  { value: 'onsite',       label: 'Onsite',        color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  { value: 'offsite',      label: 'Offsite',       color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  { value: 'team_lunch',   label: 'Team Lunch',    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  { value: 'client_visit', label: 'Client Visit',  color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
];

const SHIFTS = [
  { value: 'day', label: 'Day Shift', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  { value: 'night', label: 'Night Shift', color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
];

const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.value, t]));
const SHIFT_MAP = Object.fromEntries(SHIFTS.map((s) => [s.value, s]));

const defaultForm = {
  id: null,
  date: '',
  start_time: '',
  end_time: '',
  shift: 'day',
  project: '',
  type: 'onsite'
};

function TypeBadge({ type }) {
  const t = TYPE_MAP[type] || { label: type, color: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.color}`}>{t.label}</span>;
}

function ShiftBadge({ shift }) {
  const s = SHIFT_MAP[shift] || { label: shift, color: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.color}`}>{s.label}</span>;
}

// Week utility functions
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function getWeekDays(startDate) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function formatWeekRange(startDate) {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${startDate.toLocaleDateString('en-IN', opts)} – ${endDate.toLocaleDateString('en-IN', opts)}`;
}

function formatDayHeader(date) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${dayNames[date.getDay()]} ${date.getDate()}`;
}

function toHHMM(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function safeDuration(startTime, endTime) {
  const duration = calculateDurationHours(startTime, endTime);
  return Number.isFinite(duration) ? duration : 0;
}

export default function TimelinePage() {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState([]);
  const [filters, setFilters] = useState({ project: '', type: '', shift: '', from: '', to: '' });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [availableProjects, setAvailableProjects] = useState([]);

  async function fetchEntries() {
    let q = supabase.from('timeline_entries').select('*, profiles(name)').order('date', { ascending: true }).order('start_time', { ascending: true });
    if (profile?.role !== 'admin') q = q.eq('user_id', user.id);
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setEntries(data || []);

    const projectRes = profile?.role === 'admin'
      ? await supabase.from('projects').select('name, is_active').eq('is_active', true).order('name', { ascending: true })
      : await supabase.from('employee_project_assignments').select('projects(name, is_active)').eq('user_id', user.id);

    if (projectRes.error) {
      toast.error(projectRes.error.message);
      return;
    }

    const names = profile?.role === 'admin'
      ? (projectRes.data || []).map((row) => row.name).filter(Boolean)
      : (projectRes.data || []).map((row) => row.projects?.name).filter(Boolean);

    setAvailableProjects([...new Set(names)].sort((a, b) => a.localeCompare(b)));
  }

  useEffect(() => { fetchEntries(); }, [profile?.role]);

  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      if (filters.project && item.project !== filters.project) return false;
      if (filters.type && item.type !== filters.type) return false;
      if (filters.shift && (item.shift || 'day') !== filters.shift) return false;
      if (filters.from && item.date < filters.from) return false;
      if (filters.to && item.date > filters.to) return false;
      return true;
    });
  }, [entries, filters]);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  
  const weekEntries = useMemo(() => {
    const weekDateStrings = weekDays.map(d => formatDate(d));
    const grouped = {};
    weekDateStrings.forEach(date => {
      grouped[date] = [];
    });
    filteredEntries.forEach((e) => {
      if (grouped.hasOwnProperty(e.date)) {
        grouped[e.date].push(e);
      }
    });
    return grouped;
  }, [filteredEntries, weekDays]);

  const stats = useMemo(() => {
    const weekDateStrings = weekDays.map(d => formatDate(d));
    let onsite = 0, offsite = 0, totalHours = 0;
    weekDateStrings.forEach(date => {
      (weekEntries[date] || []).forEach((e) => {
        const dur = Number(e.duration || calculateDurationHours(e.start_time, e.end_time));
        totalHours += dur;
        if (e.type === 'onsite' || e.type === 'team_lunch' || e.type === 'client_visit') onsite += dur;
        else offsite += dur;
      });
    });
    return { onsite: onsite.toFixed(2), offsite: offsite.toFixed(2), total: totalHours.toFixed(2) };
  }, [weekEntries, weekDays]);

  const submit = async (e) => {
    e.preventDefault();
    if (!validateTimelineTimes(form.start_time, form.end_time)) {
      toast.error('Start and end time are required.');
      return;
    }
    if (!form.project) {
      toast.error('Project is required.');
      return;
    }

    setSaving(true);
    const payload = {
      user_id: form.id ? form.user_id || user.id : user.id,
      date: form.date,
      start_time: toHHMM(form.start_time),
      end_time: toHHMM(form.end_time),
      shift: form.shift,
      project: form.project,
      type: form.type,
      duration: safeDuration(form.start_time, form.end_time)
    };
    if (!payload.duration || payload.duration <= 0) {
      setSaving(false);
      toast.error('Invalid time range. Please enter valid start and end time.');
      return;
    }
    const q = form.id
      ? supabase.from('timeline_entries').update(payload).eq('id', form.id)
      : supabase.from('timeline_entries').insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(form.id ? 'Entry updated' : 'Entry added');
    setOpen(false);
    setForm(defaultForm);
    fetchEntries();
  };

  const remove = async (id) => {
    const { error } = await supabase.from('timeline_entries').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Entry deleted');
    fetchEntries();
  };

  const openAdd = (date = null) => {
    setForm({
      ...defaultForm,
      date: date || formatDate(new Date()),
      project: availableProjects[0] || ''
    });
    setOpen(true);
  };
  const openEdit = (entry) => {
    setForm({
      ...defaultForm,
      ...entry,
      start_time: toHHMM(entry.start_time),
      end_time: toHHMM(entry.end_time),
      shift: entry.shift || 'day'
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header & Week Navigation */}
      <div>
        <h1 className="text-2xl font-extrabold text-ink dark:text-white">Timesheet</h1>
        <p className="mt-0.5 text-sm text-slate-400">Week of {formatWeekRange(weekStart)}</p>
      </div>

      {/* Filters */}
      <div className="card grid gap-3 p-4 dark:border-slate-700 dark:bg-slate-800 md:grid-cols-6">
        <select
          className="field dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          value={filters.project}
          onChange={(e) => setFilters((x) => ({ ...x, project: e.target.value }))}
        >
          <option value="">All Projects</option>
          {[...new Set(entries.map((x) => x.project).filter(Boolean))].map((project) => (
            <option key={project} value={project}>{project}</option>
          ))}
        </select>

        <select
          className="field dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          value={filters.type}
          onChange={(e) => setFilters((x) => ({ ...x, type: e.target.value }))}
        >
          <option value="">All Types</option>
          {TYPES.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>

        <select
          className="field dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          value={filters.shift}
          onChange={(e) => setFilters((x) => ({ ...x, shift: e.target.value }))}
        >
          <option value="">All Shifts</option>
          {SHIFTS.map((shift) => (
            <option key={shift.value} value={shift.value}>{shift.label}</option>
          ))}
        </select>

        <DatePicker value={filters.from} onChange={(v) => setFilters((x) => ({ ...x, from: v }))} placeholder="From date" />
        <DatePicker value={filters.to} onChange={(v) => setFilters((x) => ({ ...x, to: v }))} placeholder="To date" />

        <button
          className="btn-secondary flex items-center justify-center gap-2 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
          onClick={() => setFilters({ project: '', type: '', shift: '', from: '', to: '' })}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          Clear
        </button>
      </div>

      <div className="flex items-center justify-between card p-4 dark:bg-slate-800 dark:border-slate-700">
        <button
          onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000))}
          className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-teal/40 hover:text-teal transition dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Previous Week
        </button>
        
        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
          {formatWeekRange(weekStart)}
        </span>

        <button
          onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000))}
          className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-teal/40 hover:text-teal transition dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
        >
          Next Week
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'This Week Total', value: `${stats.total}h`, icon: '⏱', color: 'text-teal-600' },
          { label: 'Onsite / Visits', value: `${stats.onsite}h`, icon: '🏢', color: 'text-emerald-600' },
          { label: 'Offsite', value: `${stats.offsite}h`, icon: '🏠', color: 'text-blue-600' },
        ].map((s) => (
          <div key={s.label} className="card flex items-center gap-4 p-5 dark:bg-slate-800 dark:border-slate-700">
            <span className="text-3xl">{s.icon}</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Weekly Timesheet Grid */}
      <div className="card overflow-hidden dark:bg-slate-800 dark:border-slate-700">
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 min-w-[900px]">
            {/* Header Row - Days */}
            {weekDays.map((day) => {
              const dayEntries = weekEntries[formatDate(day)] || [];
              const dayTotal = dayEntries.reduce((sum, e) => sum + Number(e.duration || 0), 0);
              const isToday = formatDate(day) === formatDate(new Date());
              
              return (
                <div
                  key={formatDate(day)}
                  className={`border-r border-slate-100 dark:border-slate-700 p-4 min-h-[600px] flex flex-col transition ${
                    isToday
                      ? 'bg-teal/5 dark:bg-teal/10'
                      : 'hover:bg-slate-50/50 dark:hover:bg-slate-700/30'
                  }`}
                >
                  {/* Day Header */}
                  <div className={`mb-4 pb-3 border-b ${isToday ? 'border-teal/50' : 'border-slate-100 dark:border-slate-700'}`}>
                    <div className="font-bold text-ink dark:text-white">{formatDayHeader(day)}</div>
                    <div className={`text-xs mt-1 ${isToday ? 'text-teal font-semibold' : 'text-slate-400'}`}>
                      {isToday ? '📍 Today' : day.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                    </div>
                  </div>

                  {/* Entries */}
                  <div className="space-y-2 flex-1 overflow-y-auto mb-3">
                    {dayEntries.length === 0 ? (
                      <div className="text-center py-6 text-slate-400">
                        <p className="text-xs">No entries</p>
                      </div>
                    ) : (
                      dayEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="group rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-700/40 transition hover:shadow-md dark:hover:shadow-lg"
                        >
                          <div className="flex items-start justify-between gap-1 mb-1.5">
                            <div className="font-bold text-slate-700 dark:text-slate-200">
                              {entry.start_time?.slice(0, 5)} – {entry.end_time?.slice(0, 5)}
                            </div>
                            <div className="text-xs font-bold text-teal dark:text-teal-400">
                              {Number(entry.duration).toFixed(1)}h
                            </div>
                          </div>

                          <div className="mb-1.5 space-y-1">
                            <div className="flex gap-1 flex-wrap">
                              <TypeBadge type={entry.type} />
                              <ShiftBadge shift={entry.shift || 'day'} />
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                              {entry.project}
                            </div>
                          </div>

                          {entry.description && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 italic mb-2 line-clamp-2">
                              {entry.description}
                            </div>
                          )}

                          <div className="flex gap-1 opacity-0 transition group-hover:opacity-100 pt-1">
                            <button
                              onClick={() => openEdit(entry)}
                              className="flex-1 rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => remove(entry.id)}
                              className="flex-1 rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Daily Total */}
                  <div className={`border-t ${isToday ? 'border-teal/50' : 'border-slate-100 dark:border-slate-700'} pt-2 mb-3`}>
                    <div className={`text-xs font-bold ${dayTotal > 0 ? 'text-teal' : 'text-slate-400'}`}>
                      {dayTotal > 0 ? `${dayTotal.toFixed(1)}h logged` : 'No time logged'}
                    </div>
                  </div>

                  {/* Add Entry Button */}
                  <button
                    onClick={() => openAdd(formatDate(day))}
                    className="w-full rounded-lg border border-teal/30 bg-teal/5 px-3 py-2.5 text-xs font-semibold text-teal transition hover:bg-teal/10 dark:border-teal/40 dark:bg-teal/10 dark:text-teal-400 dark:hover:bg-teal/20"
                  >
                    + Add Entry
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal */}
      <Modal title={form.id ? 'Edit Entry' : 'New Timesheet Entry'} open={open} onClose={() => setOpen(false)}>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="form-label">Date <span className="text-red-500">*</span></label>
            <DatePicker value={form.date} onChange={(v) => setForm((x) => ({ ...x, date: v }))} placeholder="Pick a date" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Start Time <span className="text-red-500">*</span></label>
              <TimePicker value={form.start_time} onChange={(v) => setForm((x) => ({ ...x, start_time: v }))} placeholder="Start" />
            </div>
            <div>
              <label className="form-label">End Time <span className="text-red-500">*</span></label>
              <TimePicker value={form.end_time} onChange={(v) => setForm((x) => ({ ...x, end_time: v }))} placeholder="End" />
            </div>
          </div>

          <div>
            <label className="form-label">Shift <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              {SHIFTS.map((shift) => (
                <button
                  key={shift.value}
                  type="button"
                  onClick={() => setForm((x) => ({ ...x, shift: shift.value }))}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition
                    ${form.shift === shift.value
                      ? 'border-teal bg-teal text-white shadow shadow-teal/30'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-teal/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                >
                  {shift.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">Project <span className="text-red-500">*</span></label>
            <select
              className="field dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              value={form.project}
              onChange={(e) => setForm((x) => ({ ...x, project: e.target.value }))}
              required
            >
              <option value="">Select Project</option>
              {availableProjects.map((projectName) => <option key={projectName} value={projectName}>{projectName}</option>)}
            </select>
            {!availableProjects.length ? <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">No assigned projects. Ask admin to assign projects.</p> : null}
          </div>

          <div>
            <label className="form-label">Type <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm((x) => ({ ...x, type: t.value }))}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition
                    ${form.type === t.value
                      ? 'border-teal bg-teal text-white shadow shadow-teal/30'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-teal/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary w-full py-3" type="submit" disabled={saving}>
            {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : (form.id ? 'Update Entry' : 'Add Entry')}
          </button>
        </form>
      </Modal>
    </div>
  );
}
