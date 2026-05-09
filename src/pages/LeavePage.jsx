import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { toDateKey } from '../lib/time';

const LEAVE_TYPES = [
  { value: 'SL', label: 'Sick Leave (SL)' },
  { value: 'CL', label: 'Casual Leave (CL)' }
];

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  cancelled: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
};

const defaultForm = {
  id: null,
  leave_type: 'SL',
  start_date: '',
  end_date: '',
  subject: '',
  content: ''
};

function normalizeStatusHistory(value) {
  if (!Array.isArray(value)) return [];
  return [...value].sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatLeaveType(value) {
  return LEAVE_TYPES.find((item) => item.value === value)?.label || value;
}

function leaveDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const a = new Date(`${startDate}T00:00:00`);
  const b = new Date(`${endDate}T00:00:00`);
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

function isMissingSchemaTable(error, tableName) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('could not find the table') && msg.includes(String(tableName || '').toLowerCase());
}

export default function LeavePage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [tableUnavailable, setTableUnavailable] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyPreview, setHistoryPreview] = useState(null);
  const [timesheetConflicts, setTimesheetConflicts] = useState(new Set());
  const [filters, setFilters] = useState({ status: '' });

  const filtered = useMemo(() => {
    if (!filters.status) return items;
    return items.filter((item) => item.status === filters.status);
  }, [items, filters.status]);

  const fetchLeaves = useCallback(async () => {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingSchemaTable(error, 'public.leave_requests')) {
        setTableUnavailable(true);
        setItems([]);
        return;
      }
      toast.error(error.message);
      return;
    }

    setTableUnavailable(false);
    setItems(data || []);

    // #3: Detect leave days that overlap with filled timesheet hours
    const approvedLeaves = (data || []).filter((l) => l.status === 'approved');
    if (approvedLeaves.length > 0) {
      const { data: sheets } = await supabase
        .from('weekly_timesheets')
        .select('week_start, rows')
        .eq('user_id', user.id);

      const WEEK_DAYS_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const filledDays = new Set();
      (sheets || []).forEach((sheet) => {
        if (!sheet.week_start || !Array.isArray(sheet.rows)) return;
        sheet.rows.forEach((row) => {
          WEEK_DAYS_ORDER.forEach((dayKey, idx) => {
            if (Number(row[dayKey] || 0) > 0) {
              const d = new Date(`${sheet.week_start}T00:00:00`);
              d.setDate(d.getDate() + idx);
              filledDays.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
            }
          });
        });
      });

      const conflicts = new Set();
      approvedLeaves.forEach((leave) => {
        const cursor = new Date(`${leave.start_date}T00:00:00`);
        const end = new Date(`${leave.end_date}T00:00:00`);
        while (cursor <= end) {
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`;
          if (filledDays.has(key)) conflicts.add(leave.id);
          cursor.setDate(cursor.getDate() + 1);
        }
      });
      setTimesheetConflicts(conflicts);
    } else {
      setTimesheetConflicts(new Set());
    }
  }, [user.id]);

  useEffect(() => {
    if (!user?.id) return;
    void fetchLeaves();
  }, [user?.id, fetchLeaves]);

  // Real-time leave approval notifications
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`leave-notify-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leave_requests', filter: `user_id=eq.${user.id}` }, (payload) => {
        const newStatus = payload.new?.status;
        const oldStatus = payload.old?.status;
        if (newStatus && newStatus !== oldStatus) {
          if (newStatus === 'approved') toast.success(`Leave "${payload.new.subject}" was approved!`);
          else if (newStatus === 'rejected') toast.error(`Leave "${payload.new.subject}" was rejected.`);
        }
        void fetchLeaves();
      });
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, fetchLeaves]);

  const pendingCount = useMemo(
    () => items.filter((entry) => entry.status === 'pending').length,
    [items]
  );

  const approvedCount = useMemo(
    () => items.filter((entry) => entry.status === 'approved').length,
    [items]
  );

  const rejectedCount = useMemo(
    () => items.filter((entry) => entry.status === 'rejected').length,
    [items]
  );

  const validateForm = () => {
    if (!form.start_date || !form.end_date) {
      toast.error('Start and end date are required.');
      return false;
    }

    if (form.end_date < form.start_date) {
      toast.error('End date cannot be earlier than start date.');
      return false;
    }

    if (!String(form.subject || '').trim()) {
      toast.error('Subject is required.');
      return false;
    }

    if (!String(form.content || '').trim()) {
      toast.error('Content is required.');
      return false;
    }

    return true;
  };

  const openAdd = () => {
    setForm(defaultForm);
    setOpen(true);
  };

  const openEdit = (item) => {
    setForm({
      id: item.id,
      leave_type: item.leave_type,
      start_date: item.start_date,
      end_date: item.end_date,
      subject: item.subject,
      content: item.content
    });
    setOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validateForm()) return;

    setSaving(true);

    if (form.id) {
      const original = items.find((entry) => entry.id === form.id);
      const resubmitted = original?.status === 'rejected';
      const nextStatus = resubmitted ? 'pending' : (original?.status || 'pending');
      const nextHistory = [
        ...(Array.isArray(original?.status_history) ? original.status_history : []),
        {
          status: nextStatus,
          comment: resubmitted ? 'Updated and resubmitted by employee' : 'Updated by employee',
          changed_at: new Date().toISOString(),
          changed_by: user.id
        }
      ];

      const { error } = await supabase
        .from('leave_requests')
        .update({
          leave_type: form.leave_type,
          start_date: form.start_date,
          end_date: form.end_date,
          subject: String(form.subject || '').trim(),
          content: String(form.content || '').trim(),
          status: nextStatus,
          status_history: nextHistory
        })
        .eq('id', form.id);

      setSaving(false);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success('Leave request updated');
      setOpen(false);
      setForm(defaultForm);
      fetchLeaves();
      return;
    }

    const history = [
      {
        status: 'pending',
        comment: 'Submitted by employee',
        changed_at: new Date().toISOString(),
        changed_by: user.id
      }
    ];

    const { error } = await supabase
      .from('leave_requests')
      .insert({
        user_id: user.id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        subject: String(form.subject || '').trim(),
        content: String(form.content || '').trim(),
        status: 'pending',
        submitted_at: new Date().toISOString(),
        status_history: history
      });

    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Leave request submitted');
    setOpen(false);
    setForm(defaultForm);
    fetchLeaves();
  };

  const cancelRequest = async (item) => {
    const ok = window.confirm('Cancel this leave request?');
    if (!ok) return;
    const nextHistory = [
      ...(Array.isArray(item.status_history) ? item.status_history : []),
      {
        status: 'cancelled',
        comment: 'Cancelled by employee',
        changed_at: new Date().toISOString(),
        changed_by: user.id
      }
    ];

    const { error } = await supabase
      .from('leave_requests')
      .update({
        status: 'cancelled',
        status_history: nextHistory
      })
      .eq('id', item.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Leave request cancelled');
    fetchLeaves();
  };

  const remove = async (id) => {
    const ok = window.confirm('Delete this leave request permanently?');
    if (!ok) return;
    const { error } = await supabase.from('leave_requests').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Leave request deleted');
    fetchLeaves();
  };

  return (
    <div className="space-y-6">
      {tableUnavailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
          Leave module is not available yet in this environment. Run the latest SQL from supabase/schema.sql to enable it.
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink dark:text-white">Leave Request</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Raise leave requests here with subject and content instead of sending manual email.
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd} disabled={tableUnavailable}>Request Leave</button>
      </div>

      <div className="card flex flex-wrap gap-2 p-4">
        <select className="field dark:border-slate-600 dark:bg-slate-700 dark:text-white" value={filters.status} onChange={(e) => setFilters((x) => ({ ...x, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="btn-secondary flex items-center justify-center gap-2 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600" onClick={() => setFilters({ status: '' })}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          Clear
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending</p>
          <p className="mt-2 text-2xl font-bold">{pendingCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Approved</p>
          <p className="mt-2 text-2xl font-bold">{approvedCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Rejected</p>
          <p className="mt-2 text-2xl font-bold">{rejectedCount}</p>
        </div>
      </div>

      <div className="card p-4">
        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {filtered.map((item) => {
            const editable = ['pending', 'rejected'].includes(item.status);
            const removable = ['pending', 'rejected', 'cancelled'].includes(item.status);
            const days = leaveDays(item.start_date, item.end_date);
            return (
              <div key={item.id} className="rounded-xl border border-[#dddddd] p-3 text-sm dark:border-[#444]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{formatLeaveType(item.leave_type)} · {days} day{days !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.start_date} to {item.end_date}</p>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[item.status] || STATUS_STYLES.pending}`}>{String(item.status || '').replace(/_/g, ' ')}</span>
                </div>
                <p className="mt-1 font-medium">{item.subject}</p>
                {item.approval_comment ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Comment: {item.approval_comment}</p> : null}
                {timesheetConflicts.has(item.id) ? <span className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-300">⚠ conflict</span> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" aria-label="Edit" className="rounded-md border border-[#dddddd] bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] disabled:opacity-50 dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200" onClick={() => openEdit(item)} disabled={!editable}>Edit</button>
                  <button type="button" aria-label="Cancel" className="rounded-md border border-[#dddddd] bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] disabled:opacity-50 dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200" onClick={() => cancelRequest(item)} disabled={item.status !== 'pending'}>Cancel</button>
                  <button type="button" aria-label="History" className="rounded-md border border-[#dddddd] bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200" onClick={() => setHistoryPreview(item)}>History</button>
                  <button type="button" aria-label="Delete" className="rounded-md border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => remove(item.id)} disabled={!removable}>Delete</button>
                </div>
              </div>
            );
          })}
          {!filtered.length ? <p className="py-4 text-center text-sm text-slate-400">No leave requests match the selected filter.</p> : null}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                <th className="py-2">Type</th>
                <th>Period</th>
                <th>Days</th>
                <th>Subject</th>
                <th>Content</th>
                <th>Status</th>
                <th>Admin Comment</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const editable = ['pending', 'rejected'].includes(item.status);
                const removable = ['pending', 'rejected', 'cancelled'].includes(item.status);
                return (
                  <tr key={item.id} className="border-b border-[#f1f1f1] dark:border-[#444]">
                    <td className="py-2">{formatLeaveType(item.leave_type)}</td>
                    <td>{item.start_date} to {item.end_date}</td>
                    <td className="font-semibold">{leaveDays(item.start_date, item.end_date)}d</td>
                    <td className="max-w-[180px] truncate">{item.subject}</td>
                    <td className="max-w-[240px] truncate">{item.content}</td>
                    <td>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[item.status] || STATUS_STYLES.pending}`}>
                        {String(item.status || '').replace(/_/g, ' ')}
                      </span>
                      {timesheetConflicts.has(item.id) ? (
                        <span className="ml-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-300" title="Timesheet hours exist on this leave period">⚠ conflict</span>
                      ) : null}
                    </td>
                    <td className="max-w-[180px] truncate">{item.approval_comment || '—'}</td>
                    <td>{formatDateTime(item.submitted_at || item.created_at)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" aria-label="Edit" className="rounded-md border border-[#dddddd] bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => openEdit(item)} disabled={!editable}>Edit</button>
                        <button type="button" aria-label="Cancel" className="rounded-md border border-[#dddddd] bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => cancelRequest(item)} disabled={item.status !== 'pending'}>Cancel</button>
                        <button type="button" aria-label="History" className="rounded-md border border-[#dddddd] bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(item)}>History</button>
                        <button type="button" aria-label="Delete" className="rounded-md border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => remove(item.id)} disabled={!removable}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length ? (
                <tr><td colSpan={9} className="py-4 text-center text-sm text-slate-400">No leave requests match the selected filter.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        title={form.id ? 'Edit Leave Request' : 'New Leave Request'}
        open={open}
        onClose={() => { setOpen(false); setForm(defaultForm); }}
      >
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Leave Type</label>
            <select
              value={form.leave_type}
              onChange={(event) => setForm((current) => ({ ...current, leave_type: event.target.value }))}
              className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
            >
              {LEAVE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))}
                className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))}
                className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Subject</label>
            <input
              type="text"
              value={form.subject}
              onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              placeholder="Leave request subject"
              className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Content</label>
            <textarea
              rows={5}
              value={form.content}
              onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
              placeholder="Write the leave details here"
              className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => { setOpen(false); setForm(defaultForm); }}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Submit'}</button>
          </div>
        </form>
      </Modal>

      <Modal
        title={historyPreview ? `Status History - ${historyPreview.subject}` : 'Status History'}
        open={Boolean(historyPreview)}
        onClose={() => setHistoryPreview(null)}
      >
        {historyPreview ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
              <p><span className="font-semibold">Type:</span> {formatLeaveType(historyPreview.leave_type)}</p>
              <p><span className="font-semibold">Period:</span> {historyPreview.start_date} to {historyPreview.end_date}</p>
              <p><span className="font-semibold">Current Status:</span> {String(historyPreview.status || '').replace(/_/g, ' ')}</p>
            </div>

            {normalizeStatusHistory(historyPreview.status_history).length ? (
              <ul className="space-y-2">
                {normalizeStatusHistory(historyPreview.status_history).map((event, index) => (
                  <li key={`${event.changed_at || index}-${event.status || 'status'}`} className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
                    <p className="font-semibold capitalize">{event.status || '-'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(event.changed_at)}</p>
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
