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
  { value: 'day', label: 'Day Shift', note: '10:00 AM to 6:00 PM', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  { value: 'night', label: 'Night Shift', note: '6:00 PM to 10:00 AM', color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
];

const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.value, t]));
const SHIFT_MAP = Object.fromEntries(SHIFTS.map((s) => [s.value, s]));

const defaultForm = { id: null, date: '', start_time: '', end_time: '', shift: 'day', type: 'onsite', description: '' };

function TypeBadge({ type }) {
  const t = TYPE_MAP[type] || { label: type, color: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.color}`}>{t.label}</span>;
}

function ShiftBadge({ shift }) {
  const s = SHIFT_MAP[shift] || { label: shift, color: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.color}`}>{s.label}</span>;
}

export default function TimelinePage() {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  async function fetchEntries() {
    let q = supabase.from('timeline_entries').select('*, profiles(name)').order('date', { ascending: false });
    if (profile?.role !== 'admin') q = q.eq('user_id', user.id);
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setEntries(data || []);
  }

  useEffect(() => { fetchEntries(); }, [profile?.role]);

  const stats = useMemo(() => {
    const dailyMap = {};
    let onsite = 0, offsite = 0;
    entries.forEach((e) => {
      const dur = Number(e.duration || calculateDurationHours(e.start_time, e.end_time));
      dailyMap[e.date] = (dailyMap[e.date] || 0) + dur;
      if (e.type === 'onsite' || e.type === 'team_lunch' || e.type === 'client_visit') onsite += dur;
      else offsite += dur;
    });
    return { dailyMap, onsite: onsite.toFixed(2), offsite: offsite.toFixed(2) };
  }, [entries]);

  const submit = async (e) => {
    e.preventDefault();
    if (!validateTimelineTimes(form.start_time, form.end_time)) {
      toast.error('Start and end time are required.');
      return;
    }
    setSaving(true);
    const payload = {
      user_id: form.id ? form.user_id || user.id : user.id,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      shift: form.shift,
      type: form.type,
      description: form.description,
      duration: calculateDurationHours(form.start_time, form.end_time)
    };
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

  const openAdd = () => { setForm(defaultForm); setOpen(true); };
  const openEdit = (entry) => { setForm({ ...defaultForm, ...entry, shift: entry.shift || 'day' }); setOpen(true); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink dark:text-white">Timeline</h1>
          <p className="mt-0.5 text-sm text-slate-400">{entries.length} entries logged</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openAdd}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Entry
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Onsite / Visits', value: `${stats.onsite}h`, icon: '🏢', color: 'text-emerald-600' },
          { label: 'Offsite', value: `${stats.offsite}h`, icon: '🏠', color: 'text-blue-600' },
          { label: 'Total Entries', value: entries.length, icon: '📋', color: 'text-purple-600' },
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

      {/* Table */}
      <div className="card overflow-hidden dark:bg-slate-800 dark:border-slate-700">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70">
                {['Date', 'Start', 'End', 'Duration', 'Shift', 'Type', 'Description', ...(profile?.role === 'admin' ? ['User'] : []), 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
              {entries.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">No entries yet. Add your first entry!</td></tr>
              )}
              {entries.map((entry) => (
                <tr key={entry.id} className="group transition hover:bg-slate-50/90 dark:hover:bg-slate-700/35">
                  <td className="px-4 py-3 font-medium text-ink dark:text-slate-100">
                    {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{entry.start_time?.slice(0,5)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{entry.end_time?.slice(0,5)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-700/90 dark:text-slate-200">
                      {Number(entry.duration).toFixed(2)}h
                    </span>
                  </td>
                  <td className="px-4 py-3"><ShiftBadge shift={entry.shift || 'day'} /></td>
                  <td className="px-4 py-3"><TypeBadge type={entry.type} /></td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-slate-500 dark:text-slate-400">{entry.description || '—'}</td>
                  {profile?.role === 'admin' && <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{entry.profiles?.name}</td>}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
                      <button onClick={() => openEdit(entry)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-teal/40 hover:text-teal dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">Edit</button>
                      <button onClick={() => remove(entry.id)} className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-500 shadow-sm transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <Modal title={form.id ? 'Edit Entry' : 'New Timeline Entry'} open={open} onClose={() => setOpen(false)}>
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
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition text-left
                    ${form.shift === shift.value
                      ? 'border-teal bg-teal text-white shadow shadow-teal/30'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-teal/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                >
                  <div>{shift.label}</div>
                  <div className={`mt-0.5 text-xs ${form.shift === shift.value ? 'text-white/90' : 'text-slate-400 dark:text-slate-400'}`}>
                    {shift.note}
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Day shift is from 10:00 AM to 6:00 PM and Night shift is from 6:00 PM to 10:00 AM.
            </p>
          </div>

          {form.start_time && form.end_time && (
            <p className="text-xs text-teal font-semibold">
              ⏱ Duration: {calculateDurationHours(form.start_time, form.end_time).toFixed(2)} hours
            </p>
          )}

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

          <div>
            <label className="form-label">Description</label>
            <textarea
              className="field resize-none"
              rows={3}
              placeholder="What did you work on?"
              value={form.description}
              onChange={(e) => setForm((x) => ({ ...x, description: e.target.value }))}
            />
          </div>

          <button className="btn-primary w-full py-3" type="submit" disabled={saving}>
            {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : (form.id ? 'Update Entry' : 'Add Entry')}
          </button>
        </form>
      </Modal>
    </div>
  );
}
