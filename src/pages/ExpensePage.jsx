import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import DatePicker from '../components/DatePicker';
import Modal from '../components/Modal';
import ReceiptUpload from '../components/ReceiptUpload';
import TimePicker from '../components/TimePicker';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { validatePositiveAmount } from '../utils/validation';

const CATEGORIES = ['Food & Beverages', 'Miscellaneous', 'Groceries', 'Cab', 'Bus', 'Train'];

const CAT_ICONS = {
  'Food & Beverages': '🍽️',
  'Miscellaneous': '📦',
  'Groceries': '🛒',
  'Cab': '🚕',
  'Bus': '🚌',
  'Train': '🚆',
};

const STATUS_STYLES = {
  pending:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const defaultForm = {
  id: null, date: '', expense_time: '',
  category: 'Food & Beverages', amount: '', notes: '', receipt_url: '', status: 'pending'
};

export default function ExpensePage() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [filters, setFilters] = useState({ category: '', from: '', to: '' });
  const [saving, setSaving] = useState(false);

  const isMisc = form.category === 'Miscellaneous';

  async function fetchExpenses() {
    let q = supabase.from('expenses').select('*, profiles(name)').order('date', { ascending: false });
    if (profile?.role !== 'admin') q = q.eq('user_id', user.id);
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setItems(data || []);
  }

  useEffect(() => { fetchExpenses(); }, [profile?.role]);

  const filtered = useMemo(() => items.filter((x) => {
    if (filters.category && x.category !== filters.category) return false;
    if (filters.from && x.date < filters.from) return false;
    if (filters.to && x.date > filters.to) return false;
    return true;
  }), [items, filters]);

  const totalFiltered = filtered.reduce((s, x) => s + Number(x.amount), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!validatePositiveAmount(form.amount)) { toast.error('Amount must be greater than 0'); return; }
    if (isMisc && !form.notes?.trim()) { toast.error('Notes are required for Miscellaneous expenses'); return; }

    setSaving(true);
    const payload = {
      user_id: form.id ? form.user_id || user.id : user.id,
      date: form.date, expense_time: form.expense_time,
      category: form.category, amount: Number(form.amount),
      notes: form.notes, receipt_url: form.receipt_url,
      status: form.status || 'pending'
    };
    const q = form.id
      ? supabase.from('expenses').update(payload).eq('id', form.id)
      : supabase.from('expenses').insert({ ...payload, status: 'pending' });
    const { error } = await q;
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(form.id ? 'Expense updated' : 'Expense added');
    setForm(defaultForm); setOpen(false); fetchExpenses();
  };

  const remove = async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Expense deleted'); fetchExpenses();
  };

  const openAdd = () => { setForm(defaultForm); setOpen(true); };
  const openEdit = (item) => { setForm(item); setOpen(true); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink dark:text-white">Expenses</h1>
          <p className="mt-0.5 text-sm text-slate-400">{filtered.length} records · Total: ₹{totalFiltered.toFixed(2)}</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openAdd}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Expense
        </button>
      </div>

      {/* Filters */}
      <div className="card grid gap-3 p-4 dark:border-slate-700 dark:bg-slate-800 md:grid-cols-4">
        <select
          className="field dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          value={filters.category}
          onChange={(e) => setFilters((x) => ({ ...x, category: e.target.value }))}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
        </select>
        <DatePicker value={filters.from} onChange={(v) => setFilters((x) => ({ ...x, from: v }))} placeholder="From date" />
        <DatePicker value={filters.to} onChange={(v) => setFilters((x) => ({ ...x, to: v }))} placeholder="To date" />
        <button
          className="btn-secondary flex items-center justify-center gap-2 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
          onClick={() => setFilters({ category: '', from: '', to: '' })}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70">
                {['Date', 'Time', 'Category', 'Amount', 'Status', 'Notes', 'Receipt', ...(profile?.role === 'admin' ? ['User'] : []), 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">No expenses found. Add your first expense!</td></tr>
              )}
              {filtered.map((item) => (
                <tr key={item.id} className="group transition hover:bg-slate-50/90 dark:hover:bg-slate-700/35">
                  <td className="px-4 py-3 font-medium text-ink dark:text-slate-100">
                    {new Date(item.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{item.expense_time?.slice(0,5) || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span>{CAT_ICONS[item.category]}</span>
                      <span className="text-slate-700 dark:text-slate-200">{item.category}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-ink dark:text-slate-100">₹{Number(item.amount).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[item.status] || ''}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-slate-500 dark:text-slate-400">{item.notes || '—'}</td>
                  <td className="px-4 py-3">
                    {item.receipt_url
                      ? <a href={item.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal hover:bg-teal/20 transition dark:bg-teal/20 dark:text-teal-300">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          View
                        </a>
                      : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  {profile?.role === 'admin' && <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{item.profiles?.name}</td>}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
                      <button onClick={() => openEdit(item)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-teal/40 hover:text-teal dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">Edit</button>
                      <button onClick={() => remove(item.id)} className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-500 shadow-sm transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <Modal title={form.id ? 'Edit Expense' : 'New Expense'} open={open} onClose={() => setOpen(false)}>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Date <span className="text-red-500">*</span></label>
              <DatePicker value={form.date} onChange={(v) => setForm((x) => ({ ...x, date: v }))} placeholder="Pick a date" />
            </div>
            <div>
              <label className="form-label">Time <span className="text-red-500">*</span></label>
              <TimePicker value={form.expense_time} onChange={(v) => setForm((x) => ({ ...x, expense_time: v }))} placeholder="Pick time" />
            </div>
          </div>

          <div>
            <label className="form-label">Category <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm((x) => ({ ...x, category: cat, notes: cat !== 'Miscellaneous' ? x.notes : x.notes }))}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition
                    ${form.category === cat
                      ? 'border-teal bg-teal text-white shadow shadow-teal/30'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-teal/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                >
                  <span>{CAT_ICONS[cat]}</span> {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">Amount (₹) <span className="text-red-500">*</span></label>
            <input
              className="field dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              type="number" min="0.01" step="0.01" required
              value={form.amount}
              onChange={(e) => setForm((x) => ({ ...x, amount: e.target.value }))}
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="form-label">
              Notes {isMisc ? <span className="text-red-500">* <span className="font-normal normal-case text-red-400">(required for Miscellaneous)</span></span> : <span className="text-slate-400 font-normal">(optional)</span>}
            </label>
            <textarea
              className={`field resize-none dark:border-slate-600 dark:bg-slate-700 dark:text-white ${isMisc ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-200' : ''}`}
              rows={3}
              required={isMisc}
              value={form.notes}
              onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))}
              placeholder={isMisc ? 'Please describe this miscellaneous expense…' : 'Add a note…'}
            />
            {isMisc && !form.notes?.trim() && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-500">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                Notes are required for Miscellaneous
              </p>
            )}
          </div>

          <ReceiptUpload
            userId={user.id}
            currentUrl={form.receipt_url}
            required
            onUploaded={(url) => setForm((x) => ({ ...x, receipt_url: url }))}
          />

          <button className="btn-primary w-full py-3" type="submit" disabled={saving}>
            {saving
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              : (form.id ? 'Update Expense' : 'Add Expense')}
          </button>
        </form>
      </Modal>
    </div>
  );
}
