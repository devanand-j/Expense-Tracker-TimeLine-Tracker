import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { exportReportAsPdfAndUpload, exportReportAsXlsxAndUpload } from '../lib/export';
import { buildRangeSummary } from '../lib/reporting';
import { supabase } from '../lib/supabaseClient';
import { calculateDurationHours } from '../lib/time';

function formatDownloadTime(dateValue) {
  const dt = new Date(dateValue);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = dt.toLocaleString('en-US', { month: 'long' });
  const year = dt.getFullYear();
  const hours12 = dt.getHours() % 12 || 12;
  const mins = String(dt.getMinutes()).padStart(2, '0');
  const suffix = dt.getHours() >= 12 ? 'PM' : 'AM';
  return `${day} - ${month} - ${year} ${String(hours12).padStart(2, '0')}:${mins}${suffix}`;
}

function toInputDate(dateValue) {
  const dt = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [timeline, setTimeline] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [rangeStart, setRangeStart] = useState(() => {
    const today = new Date();
    return toInputDate(new Date(today.getFullYear(), today.getMonth(), 1));
  });
  const [rangeEnd, setRangeEnd] = useState(() => toInputDate(new Date()));

  useEffect(() => {
    async function load() {
      const [timelineRes, expenseRes] = await Promise.all([
        supabase.from('timeline_entries').select('*').eq('user_id', user.id),
        supabase.from('expenses').select('*').eq('user_id', user.id)
      ]);
      setTimeline(timelineRes.data || []);
      setExpenses(expenseRes.data || []);
    }

    load();
  }, [user.id]);

  const monthlyReport = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const monthlyTimeline = timeline.filter((x) => new Date(x.date).getMonth() === month);
    const monthlyExpenses = expenses.filter((x) => new Date(x.date).getMonth() === month);

    const totalHours = monthlyTimeline.reduce(
      (sum, entry) => sum + Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time)),
      0
    );

    const totalExpenses = monthlyExpenses.reduce((sum, item) => sum + Number(item.amount), 0);

    const byCategory = monthlyExpenses.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + Number(item.amount);
      return acc;
    }, {});

    const byStatus = monthlyExpenses.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    return {
      totalHours: totalHours.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      byCategory,
      byStatus
    };
  }, [timeline, expenses]);

  const rangeSummary = useMemo(
    () => buildRangeSummary(timeline, expenses, rangeStart, rangeEnd),
    [timeline, expenses, rangeStart, rangeEnd]
  );

  const combinedTotals = useMemo(() => {
    const totalHours = rangeSummary.filteredTimeline.reduce(
      (sum, entry) => sum + Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time)),
      0
    );

    const totalExpenses = rangeSummary.filteredExpenses.reduce((sum, item) => sum + Number(item.amount), 0);

    return {
      totalHours: totalHours.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2)
    };
  }, [rangeSummary]);

  const handleResetRange = () => {
    const today = new Date();
    setRangeStart(toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)));
    setRangeEnd(toInputDate(new Date()));
  };

  const exportPdf = async () => {
    try {
      const rangeLabel = `${rangeStart || 'Start'} to ${rangeEnd || 'End'}`;
      const rows = [
        `Date Range: ${rangeLabel}`,
        `Total Working Hours: ${rangeSummary.totalHours}`,
        `Total Expenses: ₹${rangeSummary.totalExpenses}`,
        'Daily Totals:',
        ...rangeSummary.dailyRows.map((row) => `  ${row.date}: ${row.workingHours}h, ₹${row.expenses}`),
        'Category Totals:',
        ...rangeSummary.categoryRows.map((row) => `  ${row.category}: ₹${row.amount}`),
        `Monthly Hours: ${monthlyReport.totalHours}`,
        `Monthly Expenses: ₹${monthlyReport.totalExpenses}`,
        `Approval Status Breakdown: ${JSON.stringify(monthlyReport.byStatus)}`
      ];

      const url = await exportReportAsPdfAndUpload({
        title: 'Date Range Report',
        rows,
        fileName: 'date-range-report',
        userId: user.id
      });

      setDownloads((x) => [{ type: 'PDF', url, downloadedAt: new Date().toISOString() }, ...x]);
      toast.success('PDF exported and uploaded');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const exportXlsx = async () => {
    try {
      const url = await exportReportAsXlsxAndUpload({
        sheetName: 'Date Range Report',
        jsonData: rangeSummary.exportRows,
        fileName: 'date-range-report',
        userId: user.id
      });

      setDownloads((x) => [{ type: 'Excel', url, downloadedAt: new Date().toISOString() }, ...x]);
      toast.success('Excel exported and uploaded');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

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

          <button type="button" className="btn-secondary self-start lg:self-auto" onClick={handleResetRange}>
            Reset to This Month
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Selected Hours</p>
          <p className="mt-2 text-2xl font-bold">{combinedTotals.totalHours}h</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Selected Expenses</p>
          <p className="mt-2 text-2xl font-bold">₹{combinedTotals.totalExpenses}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Hours</p>
          <p className="mt-2 text-2xl font-bold">{monthlyReport.totalHours}h</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Expenses</p>
          <p className="mt-2 text-2xl font-bold">₹{monthlyReport.totalExpenses}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card overflow-x-auto p-4">
          <h2 className="mb-3 font-semibold">Daily Hours and Expenses</h2>
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                <th className="py-2">Date</th>
                <th>Working Hours</th>
                <th>Expenses</th>
              </tr>
            </thead>
            <tbody>
              {rangeSummary.dailyRows.map((row) => (
                <tr key={row.date} className="border-b border-[#f1f1f1] dark:border-[#444]">
                  <td className="py-2">{row.date}</td>
                  <td>{row.workingHours}h</td>
                  <td>₹{row.expenses}</td>
                </tr>
              ))}
              {!rangeSummary.dailyRows.length ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={3}>No records for the selected date range.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto p-4">
          <h2 className="mb-3 font-semibold">Expense Totals by Category</h2>
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                <th className="py-2">Category</th>
                <th>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {rangeSummary.categoryRows.map((row) => (
                <tr key={row.category} className="border-b border-[#f1f1f1] dark:border-[#444]">
                  <td className="py-2">{row.category}</td>
                  <td>₹{row.amount}</td>
                </tr>
              ))}
              {!rangeSummary.categoryRows.length ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={2}>No expense categories in the selected date range.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-3">
        <button className="btn-primary" onClick={exportPdf}>
          Export PDF
        </button>
        <button className="btn-secondary" onClick={exportXlsx}>
          Export Excel
        </button>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 font-semibold">Generated Files</h2>
        <ul className="space-y-2 text-sm">
          {downloads.map((item, idx) => (
            <li key={`${item.url}-${idx}`}>
              {item.type}: {formatDownloadTime(item.downloadedAt)} {'-'}{' '}
              <a href={item.url} target="_blank" rel="noreferrer" className="text-teal underline">
                Download
              </a>
            </li>
          ))}
          {!downloads.length ? <li>No generated files in this session yet.</li> : null}
        </ul>
      </div>
    </div>
  );
}
