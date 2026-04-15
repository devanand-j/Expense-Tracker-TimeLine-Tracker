import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import { buildRangeSummary } from '../lib/reporting';
import { exportReportAsPdfAndUpload, exportReportAsXlsxAndUpload } from '../lib/export';
import { supabase } from '../lib/supabaseClient';
import { calculateDurationHours } from '../lib/time';

const PIE_COLORS = ['#04AA6D', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

function inCurrentWeek(dateStr) {
  const now = new Date();
  const first = new Date(now);
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  first.setDate(diff);
  first.setHours(0, 0, 0, 0);
  const end = new Date(first);
  end.setDate(first.getDate() + 7);
  const date = new Date(dateStr);
  return date >= first && date < end;
}

function monthName(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', { month: 'long' });
}

function toInputDate(dateValue) {
  const dt = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function slugify(value = '') {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeStatusHistory(value) {
  if (!Array.isArray(value)) return [];
  return [...value].sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
}

function formatHistoryDate(value) {
  if (!value) return '-';
  const dt = new Date(value);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = dt.toLocaleString('en-US', { month: 'short' });
  const year = dt.getFullYear();
  const hours = dt.getHours() % 12 || 12;
  const mins = String(dt.getMinutes()).padStart(2, '0');
  const suffix = dt.getHours() >= 12 ? 'PM' : 'AM';
  return `${day}-${month}-${year} ${String(hours).padStart(2, '0')}:${mins} ${suffix}`;
}

export default function AdminPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [expenseStatusFilter, setExpenseStatusFilter] = useState('all');
  const [statusAction, setStatusAction] = useState(null);
  const [statusComment, setStatusComment] = useState('');
  const [historyPreview, setHistoryPreview] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rangeStart, setRangeStart] = useState(() => {
    const today = new Date();
    return toInputDate(new Date(today.getFullYear(), today.getMonth(), 1));
  });
  const [rangeEnd, setRangeEnd] = useState(() => toInputDate(new Date()));

  async function loadEmployees() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role, created_at')
      .eq('role', 'employee')
      .order('name', { ascending: true });

    if (error) {
      toast.error(error.message);
      return [];
    }

    return data || [];
  }

  async function loadEmployeeData(employeeId) {
    const [timelineRes, expenseRes] = await Promise.all([
      supabase
        .from('timeline_entries')
        .select('*')
        .eq('user_id', employeeId)
        .order('date', { ascending: false }),
      supabase
        .from('expenses')
        .select('*')
        .eq('user_id', employeeId)
        .order('date', { ascending: false })
    ]);

    if (timelineRes.error) {
      toast.error(timelineRes.error.message);
      return;
    }

    if (expenseRes.error) {
      toast.error(expenseRes.error.message);
      return;
    }

    setTimeline(timelineRes.data || []);
    setExpenses(expenseRes.data || []);
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      setLoading(true);
      const employeeList = await loadEmployees();
      if (!mounted) return;
      setEmployees(employeeList);
      const firstEmployeeId = employeeList[0]?.id || '';
      setSelectedEmployeeId(firstEmployeeId);
      if (firstEmployeeId) {
        await loadEmployeeData(firstEmployeeId);
      } else {
        setTimeline([]);
        setExpenses([]);
      }
      setLoading(false);
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) return;
    loadEmployeeData(selectedEmployeeId);
  }, [selectedEmployeeId]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId),
    [employees, selectedEmployeeId]
  );

  const summary = useMemo(() => {
    const weeklyTimeline = timeline.filter((entry) => inCurrentWeek(entry.date));
    const weeklyExpenses = expenses.filter((entry) => inCurrentWeek(entry.date));
    const month = new Date().getMonth();

    const monthlyTimeline = timeline.filter((entry) => new Date(entry.date).getMonth() === month);
    const monthlyExpenses = expenses.filter((entry) => new Date(entry.date).getMonth() === month);

    const weeklyHours = weeklyTimeline.reduce(
      (sum, entry) => sum + Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time)),
      0
    );

    const monthlyHours = monthlyTimeline.reduce(
      (sum, entry) => sum + Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time)),
      0
    );

    const weeklyExpenseTotal = weeklyExpenses.reduce((sum, entry) => sum + Number(entry.amount), 0);
    const monthlyExpenseTotal = monthlyExpenses.reduce((sum, entry) => sum + Number(entry.amount), 0);

    const byCategory = monthlyExpenses.reduce((acc, entry) => {
      acc[entry.category] = (acc[entry.category] || 0) + Number(entry.amount);
      return acc;
    }, {});

    const categoryData = Object.entries(byCategory).map(([name, value]) => ({ name, value }));

    return {
      weeklyHours: weeklyHours.toFixed(2),
      weeklyExpenseTotal: weeklyExpenseTotal.toFixed(2),
      monthlyHours: monthlyHours.toFixed(2),
      monthlyExpenseTotal: monthlyExpenseTotal.toFixed(2),
      categoryData
    };
  }, [timeline, expenses]);

  const filteredExpenses = useMemo(() => {
    if (expenseStatusFilter === 'all') return expenses;
    return expenses.filter((entry) => entry.status === expenseStatusFilter);
  }, [expenses, expenseStatusFilter]);

  const expenseStatusCounts = useMemo(
    () => ({
      all: expenses.length,
      pending: expenses.filter((entry) => entry.status === 'pending').length,
      approved: expenses.filter((entry) => entry.status === 'approved').length,
      rejected: expenses.filter((entry) => entry.status === 'rejected').length
    }),
    [expenses]
  );

  const perMonthHours = useMemo(() => {
    const monthMap = timeline.reduce((acc, entry) => {
      const month = monthName(entry.date);
      acc[month] = (acc[month] || 0) + Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time));
      return acc;
    }, {});

    return Object.entries(monthMap).map(([month, hours]) => ({ month, hours: Number(hours.toFixed(2)) }));
  }, [timeline]);

  const rangeSummary = useMemo(
    () => buildRangeSummary(timeline, expenses, rangeStart, rangeEnd),
    [timeline, expenses, rangeStart, rangeEnd]
  );

  const resetRange = () => {
    const today = new Date();
    setRangeStart(toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)));
    setRangeEnd(toInputDate(new Date()));
  };

  const exportEmployeePdf = async () => {
    try {
      if (!selectedEmployeeId || !selectedEmployee || !user?.id) {
        toast.error('Select an employee first.');
        return;
      }

      const rows = [
        `Employee: ${selectedEmployee.name}`,
        `Date Range: ${rangeStart || '-'} to ${rangeEnd || '-'}`,
        `Total Working Hours: ${rangeSummary.totalHours}`,
        `Total Expenses: INR ${rangeSummary.totalExpenses}`,
        '',
        'Category Totals:',
        ...rangeSummary.categoryRows.map((row) => `  ${row.category}: INR ${row.amount}`),
        '',
        'Daily Totals:',
        ...rangeSummary.dailyRows.map((row) => `  ${row.date} | ${row.workingHours}h | INR ${row.expenses}`),
        '',
        'Timeline Entries:',
        ...rangeSummary.filteredTimeline.map(
          (entry) =>
            `  ${entry.date} | ${entry.start_time?.slice(0, 5) || '--:--'}-${entry.end_time?.slice(0, 5) || '--:--'} | ${Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time)).toFixed(2)}h | ${entry.type || ''} | ${entry.description || ''}`
        ),
        '',
        'Expense Entries:',
        ...rangeSummary.filteredExpenses.map(
          (entry) =>
            `  ${entry.date} | ${entry.expense_time?.slice(0, 5) || '--:--'} | ${entry.category} | INR ${Number(entry.amount || 0).toFixed(2)} | ${entry.status || ''} | ${entry.notes || ''}`
        )
      ];

      const fileSlug = slugify(selectedEmployee.name || 'employee');
      const url = await exportReportAsPdfAndUpload({
        title: `${selectedEmployee.name} - Timeline and Expenses`,
        rows,
        fileName: `admin-${fileSlug}-report`,
        userId: user.id
      });

      window.open(url, '_blank', 'noopener,noreferrer');
      toast.success('Employee PDF generated.');
    } catch (error) {
      toast.error(error.message || 'Failed to export PDF');
    }
  };

  const exportEmployeeXlsx = async () => {
    try {
      if (!selectedEmployeeId || !selectedEmployee || !user?.id) {
        toast.error('Select an employee first.');
        return;
      }

      const summaryRows = [
        {
          section: 'Summary',
          employee: selectedEmployee.name,
          fromDate: rangeStart || '',
          toDate: rangeEnd || '',
          totalHours: Number(rangeSummary.totalHours),
          totalExpenses: Number(rangeSummary.totalExpenses)
        }
      ];

      const dailyRows = rangeSummary.dailyRows.map((row) => ({
        section: 'Daily Total',
        employee: selectedEmployee.name,
        date: row.date,
        workingHours: row.workingHours,
        expenses: row.expenses
      }));

      const categoryRows = rangeSummary.categoryRows.map((row) => ({
        section: 'Category Total',
        employee: selectedEmployee.name,
        category: row.category,
        amount: row.amount
      }));

      const timelineRows = rangeSummary.filteredTimeline.map((entry) => ({
        section: 'Timeline Entry',
        employee: selectedEmployee.name,
        date: entry.date,
        startTime: entry.start_time?.slice(0, 5) || '',
        endTime: entry.end_time?.slice(0, 5) || '',
        duration: Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time)).toFixed(2),
        type: entry.type || '',
        description: entry.description || ''
      }));

      const expenseRows = rangeSummary.filteredExpenses.map((entry) => ({
        section: 'Expense Entry',
        employee: selectedEmployee.name,
        date: entry.date,
        time: entry.expense_time?.slice(0, 5) || '',
        category: entry.category || '',
        amount: Number(entry.amount || 0).toFixed(2),
        status: entry.status || '',
        notes: entry.notes || ''
      }));

      const fileSlug = slugify(selectedEmployee.name || 'employee');
      const url = await exportReportAsXlsxAndUpload({
        sheetName: 'Employee Report',
        jsonData: [...summaryRows, ...dailyRows, ...categoryRows, ...timelineRows, ...expenseRows],
        fileName: `admin-${fileSlug}-report`,
        userId: user.id
      });

      window.open(url, '_blank', 'noopener,noreferrer');
      toast.success('Employee Excel generated.');
    } catch (error) {
      toast.error(error.message || 'Failed to export Excel');
    }
  };

  const openStatusAction = (entry, status) => {
    setStatusAction({ entry, status });
    setStatusComment('');
  };

  const updateStatus = async () => {
    if (!statusAction) return;
    const { entry, status } = statusAction;

    const nextHistory = [
      ...(Array.isArray(entry.status_history) ? entry.status_history : []),
      {
        status,
        comment: String(statusComment || '').trim(),
        changed_at: new Date().toISOString(),
        changed_by: user?.id || null
      }
    ];

    const { error } = await supabase
      .from('expenses')
      .update({
        status,
        approval_comment: String(statusComment || '').trim() || null,
        status_history: nextHistory
      })
      .eq('id', entry.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setStatusAction(null);
    setStatusComment('');
    toast.success(`Expense ${status}`);
    loadEmployeeData(selectedEmployeeId);
  };

  if (loading) {
    return <div className="card p-4 text-sm">Loading employee data...</div>;
  }

  if (!employees.length) {
    return <div className="card p-4 text-sm">No employees found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Select an employee to view timelines, reports, and expenses.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {employees.map((employee) => (
            <button
              key={employee.id}
              type="button"
              onClick={() => setSelectedEmployeeId(employee.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                selectedEmployeeId === employee.id
                  ? 'border-teal bg-teal text-white shadow-sm'
                  : 'border-[#dddddd] bg-white text-slate-700 hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]'
              }`}
            >
              {employee.name}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-ink dark:text-white">{selectedEmployee?.name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Employee overview and history</p>
          </div>
          <div className="rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal dark:bg-teal/20">
            Sorted alphabetically by name
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Weekly Hours</p>
          <p className="mt-2 text-2xl font-bold">{summary.weeklyHours}h</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Weekly Expenses</p>
          <p className="mt-2 text-2xl font-bold">₹{summary.weeklyExpenseTotal}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Hours</p>
          <p className="mt-2 text-2xl font-bold">{summary.monthlyHours}h</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Expenses</p>
          <p className="mt-2 text-2xl font-bold">₹{summary.monthlyExpenseTotal}</p>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              <span>From Date</span>
              <input
                type="date"
                value={rangeStart}
                onChange={(event) => setRangeStart(event.target.value)}
                className="w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>To Date</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(event) => setRangeEnd(event.target.value)}
                className="w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              />
            </label>
          </div>

          <button type="button" className="btn-secondary self-start lg:self-auto" onClick={resetRange}>
            Reset to This Month
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={exportEmployeePdf}>
            Download Employee PDF
          </button>
          <button type="button" className="btn-secondary" onClick={exportEmployeeXlsx}>
            Download Employee Excel
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#dddddd] p-3 dark:border-[#444]">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Range Hours</p>
            <p className="mt-2 text-xl font-bold">{rangeSummary.totalHours}h</p>
          </div>
          <div className="rounded-xl border border-[#dddddd] p-3 dark:border-[#444]">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Range Expenses</p>
            <p className="mt-2 text-xl font-bold">₹{rangeSummary.totalExpenses}</p>
          </div>
          <div className="rounded-xl border border-[#dddddd] p-3 dark:border-[#444]">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Daily Entries</p>
            <p className="mt-2 text-xl font-bold">{rangeSummary.dailyRows.length}</p>
          </div>
          <div className="rounded-xl border border-[#dddddd] p-3 dark:border-[#444]">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Categories</p>
            <p className="mt-2 text-xl font-bold">{rangeSummary.categoryRows.length}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-xl border border-[#dddddd] dark:border-[#444]">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                  <th className="py-2 px-3">Date</th>
                  <th>Working Hours</th>
                  <th>Expenses</th>
                </tr>
              </thead>
              <tbody>
                {rangeSummary.dailyRows.map((row) => (
                  <tr key={row.date} className="border-b border-[#f1f1f1] dark:border-[#444]">
                    <td className="py-2 px-3">{row.date}</td>
                    <td>{row.workingHours}h</td>
                    <td>₹{row.expenses}</td>
                  </tr>
                ))}
                {!rangeSummary.dailyRows.length ? (
                  <tr>
                    <td className="py-3 px-3 text-slate-500" colSpan={3}>No records for the selected date range.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#dddddd] dark:border-[#444]">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                  <th className="py-2 px-3">Category</th>
                  <th>Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {rangeSummary.categoryRows.map((row) => (
                  <tr key={row.category} className="border-b border-[#f1f1f1] dark:border-[#444]">
                    <td className="py-2 px-3">{row.category}</td>
                    <td>₹{row.amount}</td>
                  </tr>
                ))}
                {!rangeSummary.categoryRows.length ? (
                  <tr>
                    <td className="py-3 px-3 text-slate-500" colSpan={2}>No expense categories in the selected date range.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto p-4 w-full">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold">Expenses for {selectedEmployee?.name}</h2>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: `All (${expenseStatusCounts.all})` },
              { key: 'pending', label: `Pending (${expenseStatusCounts.pending})` },
              { key: 'approved', label: `Approved (${expenseStatusCounts.approved})` },
              { key: 'rejected', label: `Rejected (${expenseStatusCounts.rejected})` }
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setExpenseStatusFilter(item.key)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  expenseStatusFilter === item.key
                    ? 'border-teal bg-teal text-white'
                    : 'border-[#dddddd] bg-white text-slate-700 hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 md:hidden">
          {filteredExpenses.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-[#dddddd] p-3 text-sm dark:border-[#444]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{entry.date} {entry.expense_time?.slice(0, 5) || '—'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{entry.project || '-'} · {entry.category}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-700 dark:text-slate-200">{entry.status}</span>
              </div>
              <p className="mt-2 font-semibold">₹{Number(entry.amount).toFixed(2)}</p>
              {entry.approval_comment ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{entry.approval_comment}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => openStatusAction(entry, 'approved')} disabled={entry.status === 'approved'}>Approve</button>
                <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => openStatusAction(entry, 'rejected')} disabled={entry.status === 'rejected'}>Reject</button>
                <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => openStatusAction(entry, 'pending')} disabled={entry.status === 'pending'}>Pending</button>
                <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(entry)}>History</button>
              </div>
            </div>
          ))}
          {!filteredExpenses.length ? <p className="text-sm text-slate-500">No expenses for this employee.</p> : null}
        </div>

        <table className="hidden w-full min-w-[1120px] text-sm md:table">
          <thead>
            <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
              <th className="py-2">Date</th>
              <th>Time</th>
              <th>Project</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Receipt</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses.map((entry) => (
              <tr key={entry.id} className="border-b border-[#f1f1f1] dark:border-[#444]">
                <td className="py-2">{entry.date}</td>
                <td>{entry.expense_time?.slice(0, 5) || '—'}</td>
                <td>{entry.project || '-'}</td>
                <td>{entry.category}</td>
                <td>₹{Number(entry.amount).toFixed(2)}</td>
                <td className="capitalize">
                  {entry.status}
                  {entry.approval_comment ? <p className="mt-1 max-w-[180px] truncate text-[11px] text-slate-500 dark:text-slate-400">{entry.approval_comment}</p> : null}
                </td>
                <td>{entry.notes || '—'}</td>
                <td>
                  {entry.receipt_url ? (
                    <button
                      type="button"
                      onClick={() => setReceiptPreview({
                        url: entry.receipt_url,
                        title: `${selectedEmployee?.name || 'Employee'} - ${entry.category} - ${entry.date}`
                      })}
                      className="inline-flex items-center gap-1 rounded-lg bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal hover:bg-teal/20 transition dark:bg-teal/20 dark:text-teal-300"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      View
                    </button>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary px-3 py-1 text-xs"
                      onClick={() => openStatusAction(entry, 'approved')}
                      disabled={entry.status === 'approved'}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1 text-xs"
                      onClick={() => openStatusAction(entry, 'rejected')}
                      disabled={entry.status === 'rejected'}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]"
                      onClick={() => openStatusAction(entry, 'pending')}
                      disabled={entry.status === 'pending'}
                    >
                      Pending
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]"
                      onClick={() => setHistoryPreview(entry)}
                    >
                      History
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!filteredExpenses.length ? (
              <tr>
                <td className="py-3 text-slate-500" colSpan={9}>No expenses for this employee.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto p-4 w-full">
        <h2 className="mb-3 font-semibold">Timelines for {selectedEmployee?.name}</h2>
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
              <th className="py-2">Date</th>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((entry) => (
              <tr key={entry.id} className="border-b border-[#f1f1f1] dark:border-[#444]">
                <td className="py-2">{entry.date}</td>
                <td>{entry.start_time?.slice(0, 5)}</td>
                <td>{entry.end_time?.slice(0, 5)}</td>
                <td>{Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time)).toFixed(2)}h</td>
                <td className="capitalize">{entry.type}</td>
                <td>{entry.description || '—'}</td>
              </tr>
            ))}
            {!timeline.length ? (
              <tr>
                <td className="py-3 text-slate-500" colSpan={6}>No timeline entries for this employee.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4 w-full">
          <h2 className="mb-3 font-semibold">Timeline Hours by Month</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perMonthHours}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="hours" fill="#04AA6D" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4 w-full">
          <h2 className="mb-3 font-semibold">Expense Category Wheel</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={summary.categoryData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={96} paddingAngle={3}>
                  {summary.categoryData.map((entry, index) => (
                    <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <Modal
        title={statusAction ? `Update Expense to ${statusAction.status}` : 'Update Expense Status'}
        open={Boolean(statusAction)}
        onClose={() => { setStatusAction(null); setStatusComment(''); }}
      >
        {statusAction ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
              <p><span className="font-semibold">Date:</span> {statusAction.entry.date}</p>
              <p><span className="font-semibold">Project:</span> {statusAction.entry.project || '-'}</p>
              <p><span className="font-semibold">Amount:</span> ₹{Number(statusAction.entry.amount || 0).toFixed(2)}</p>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Comment (optional)
              </label>
              <textarea
                rows={3}
                value={statusComment}
                onChange={(event) => setStatusComment(event.target.value)}
                placeholder="Add reason or context for this status update"
                className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setStatusAction(null); setStatusComment(''); }}>Cancel</button>
              <button type="button" className="btn-primary" onClick={updateStatus}>Save</button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={historyPreview ? `Status History - ${historyPreview.category}` : 'Status History'}
        open={Boolean(historyPreview)}
        onClose={() => setHistoryPreview(null)}
      >
        {historyPreview ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
              <p><span className="font-semibold">Date:</span> {historyPreview.date}</p>
              <p><span className="font-semibold">Project:</span> {historyPreview.project || '-'}</p>
              <p><span className="font-semibold">Amount:</span> ₹{Number(historyPreview.amount || 0).toFixed(2)}</p>
            </div>

            {normalizeStatusHistory(historyPreview.status_history).length ? (
              <ul className="space-y-2">
                {normalizeStatusHistory(historyPreview.status_history).map((event, index) => (
                  <li key={`${event.changed_at || index}-${event.status || 'status'}`} className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
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

      <Modal
        title={receiptPreview?.title || 'Receipt Preview'}
        open={Boolean(receiptPreview)}
        onClose={() => setReceiptPreview(null)}
      >
        {receiptPreview?.url ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-[#dddddd] dark:border-[#444]">
              <img src={receiptPreview.url} alt={receiptPreview.title || 'Receipt'} className="w-full object-contain" />
            </div>
            <a href={receiptPreview.url} target="_blank" rel="noreferrer" className="btn-primary inline-flex">
              Open Full Receipt
            </a>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
