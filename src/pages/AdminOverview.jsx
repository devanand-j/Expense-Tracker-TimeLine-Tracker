import React, { useMemo, useState } from 'react';

function getMonthName(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function toInputDate(dateValue) {
  const dt = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AdminOverview({
  selectedEmployee,
  activeProjects,
  selectedProjectIds,
  setSelectedProjectIds,
  saveProjectAssignments,
  summary,
  rangeStart,
  rangeEnd,
  setRangeStart,
  setRangeEnd,
  resetRange,
  exportEmployeePdf,
  exportEmployeeXlsx,
  rangeSummary,
  reimbursements,
  setReimbursementAction,
  setReimbursementForm,
  reimbursementForm,
  weeklySheets = []
}) {
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(new Date().getMonth());
  const [selectedYearForTimeline, setSelectedYearForTimeline] = useState(new Date().getFullYear());

  // Calculate 12-month data summary
  const monthlyData = useMemo(() => {
    const months = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Generate data for past 12 months
    for (let i = 11; i >= 0; i--) {
      let year = currentYear;
      let month = currentMonth - i;
      if (month < 0) {
        year -= 1;
        month += 12;
      }

      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      const startKey = toInputDate(monthStart);
      const endKey = toInputDate(monthEnd);

      // Calculate hours for this month from weekly_timesheets
      let monthlyHours = 0;
      const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      weeklySheets.forEach((sheet) => {
        if (sheet.status !== 'approved') return;
        if (!sheet.week_start || !Array.isArray(sheet.rows)) return;

        DAY_KEYS.forEach((dayKey, idx) => {
          const date = new Date(`${sheet.week_start}T00:00:00`);
          date.setDate(date.getDate() + idx);
          const dateKey = toInputDate(date);
          if (dateKey >= startKey && dateKey <= endKey) {
            const dayHours = sheet.rows.reduce((sum, row) => sum + Number(row[dayKey] || 0), 0);
            monthlyHours += dayHours;
          }
        });
      });

      months.push({
        year,
        month,
        label: getMonthName(year, month),
        startDate: startKey,
        endDate: endKey,
        hours: Number(monthlyHours.toFixed(2)),
        isPast: new Date(year, month, 1) < new Date(currentYear, currentMonth, 1),
        isCurrent: year === currentYear && month === currentMonth
      });
    }
    return months;
  }, [weeklySheets]);

  const selectedMonthData = useMemo(() => {
    return monthlyData.find((m) => m.month === selectedMonthIndex && m.year === selectedYearForTimeline) || monthlyData[monthlyData.length - 1];
  }, [monthlyData, selectedMonthIndex, selectedYearForTimeline]);

  const handleSelectMonth = (monthData) => {
    setRangeStart(monthData.startDate);
    setRangeEnd(monthData.endDate);
    setSelectedMonthIndex(monthData.month);
    setSelectedYearForTimeline(monthData.year);
  };
  return (
    <div className="space-y-6">
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

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <svg className="h-5 w-5 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              12-Month Timeline
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Click any month to view historical data</p>
          </div>
          <button
            type="button"
            onClick={resetRange}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Current Month
          </button>
        </div>

        {/* Month Timeline Grid */}
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-2 min-w-max">
            {monthlyData.map((month) => {
              const isSelected = month.month === selectedMonthIndex && month.year === selectedYearForTimeline;
              const hasData = month.hours > 0;
              return (
                <button
                  key={`${month.year}-${month.month}`}
                  onClick={() => handleSelectMonth(month)}
                  className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200 ${
                    isSelected
                      ? 'bg-teal text-white shadow-lg shadow-teal/30 scale-105'
                      : hasData
                      ? 'bg-gradient-to-br from-teal/10 to-cyan/10 border border-teal/20 hover:border-teal/50 hover:from-teal/20 hover:to-cyan/20 dark:from-teal/5 dark:to-cyan/5 dark:border-teal/10 dark:hover:border-teal/30'
                      : 'bg-slate-100 border border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="text-xs font-bold">{month.label.split(' ')[0]}</span>
                  <span className={`text-xs font-semibold ${isSelected ? 'text-white' : hasData ? 'text-teal' : 'text-slate-500'}`}>
                    {month.hours > 0 ? `${month.hours}h` : '—'}
                  </span>
                  {hasData && !isSelected && (
                    <div className="h-1 w-1 rounded-full bg-teal"></div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Month Details */}
        {selectedMonthData && (
          <div className="mt-4 rounded-xl bg-gradient-to-r from-teal/5 to-cyan/5 border border-teal/20 p-4 dark:from-teal/10 dark:to-cyan/10 dark:border-teal/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Selected Period</p>
                <p className="mt-1 text-lg font-bold text-ink dark:text-white">{selectedMonthData.label}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {selectedMonthData.startDate} to {selectedMonthData.endDate}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Total Hours</p>
                <p className="mt-1 text-3xl font-bold text-teal">{selectedMonthData.hours}h</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card p-4">
        <h2 className="text-lg font-semibold">Assign Projects</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage which projects this employee can see and use in expenses and timesheets.</p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {activeProjects.map((project) => (
            <label key={project.id} className="flex items-center gap-2 rounded-lg border border-[#dddddd] px-3 py-2 text-sm dark:border-[#444]">
              <input
                type="checkbox"
                checked={selectedProjectIds.includes(project.id)}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelectedProjectIds((current) => {
                    const next = new Set(current);
                    if (checked) next.add(project.id);
                    else next.delete(project.id);
                    return [...next];
                  });
                }}
              />
              <span>{project.name}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button type="button" className="btn-primary" onClick={saveProjectAssignments}>Save Assignments</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Weekly Hours</p>
          <p className="mt-2 text-2xl font-bold">{summary.weeklyHours}h</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Weekly Approved Expenses</p>
          <p className="mt-2 text-2xl font-bold">₹{summary.weeklyExpenseTotal}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Hours</p>
          <p className="mt-2 text-2xl font-bold">{summary.monthlyHours}h</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Approved Expenses</p>
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
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Range Approved Expenses</p>
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
                  <th>Approved Expenses</th>
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
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-[#dddddd] p-4 dark:border-[#444]">
            <h3 className="mb-2 font-semibold">Reimbursement Ledger for {selectedEmployee?.name}</h3>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Approved vs Paid tracking</p>

            <div className="space-y-3 md:hidden">
              {reimbursements.map((entry, idx) => (
                <div key={entry.id} className="rounded-lg border border-[#dddddd] p-2 text-xs dark:border-[#444]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">EXP-{String(idx + 1).padStart(3, '0')}</p>
                      <p className="text-slate-500">₹{Number(entry.approved_amount || 0).toFixed(2)}</p>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700 dark:bg-slate-700 dark:text-slate-200">{entry.payment_status || 'pending'}</span>
                  </div>
                  <button type="button" className="btn-primary mt-2 w-full px-3 py-1 text-xs" onClick={() => { setReimbursementAction(entry); setReimbursementForm({ payment_mode: entry.payment_mode || 'bank_transfer', transaction_reference: entry.transaction_reference || '' }); }} disabled={entry.payment_status === 'paid'}>Mark Paid</button>
                </div>
              ))}
              {!reimbursements.length ? <p className="text-xs text-slate-500">No reimbursements yet.</p> : null}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                    <th className="py-2 pr-4">Expense ID</th>
                    <th className="pr-4">Approved Amount</th>
                    <th className="pr-4">Due Date</th>
                    <th className="pr-4">Status</th>
                    <th className="pr-4">Paid Date</th>
                    <th className="pr-4">Payment Mode</th>
                    <th className="pr-4">Transaction Ref</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reimbursements.map((entry, idx) => (
                    <tr key={entry.id} className="border-b border-[#f1f1f1] dark:border-[#444]">
                      <td className="py-2 pr-4 font-mono font-semibold text-teal">EXP-{String(idx + 1).padStart(3, '0')}</td>
                      <td className="pr-4">₹{Number(entry.approved_amount || 0).toFixed(2)}</td>
                      <td className="pr-4">{entry.due_date || '—'}</td>
                      <td className="pr-4 capitalize">{entry.payment_status || 'pending'}</td>
                      <td className="pr-4">{entry.paid_date || '—'}</td>
                      <td className="pr-4 capitalize">{entry.payment_mode ? entry.payment_mode.replace(/_/g, ' ') : '—'}</td>
                      <td className="pr-4">{entry.transaction_reference || '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-primary px-3 py-1 text-xs disabled:opacity-50"
                          onClick={() => { setReimbursementAction(entry); setReimbursementForm({ payment_mode: entry.payment_mode || 'bank_transfer', transaction_reference: entry.transaction_reference || '' }); }}
                          disabled={entry.payment_status === 'paid'}
                        >
                          Mark Paid
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!reimbursements.length ? (
                    <tr><td colSpan={8} className="py-3 text-slate-500">No reimbursements yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
