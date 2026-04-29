import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { categoryShareRows } from '../lib/expenseCategories';
import { supabase } from '../lib/supabaseClient';
import { calculateDurationHours } from '../lib/time';

function ChartTooltip({ active, payload, label, dark }) {
  if (!active || !payload?.length) return null;

  return (
    <div className={`rounded-xl border px-3 py-2 shadow-lg ${dark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-sm font-bold">₹{Number(payload[0].value).toFixed(2)}</p>
    </div>
  );
}

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

function toDateKey(value) {
  const dt = value instanceof Date ? value : new Date(value);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildMonthCalendar(dateValue) {
  const base = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
  const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const start = new Date(monthStart);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(monthEnd);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return { monthStart, monthEnd, days };
}

function dayCellTone({ hours, approvedExpense, isLeave, pendingCount }) {
  if (isLeave) return 'bg-violet-100 text-violet-800 dark:bg-violet-700/60 dark:text-violet-100';
  if (pendingCount > 0) return 'bg-amber-100 text-amber-800 dark:bg-amber-600/60 dark:text-amber-100';
  if (approvedExpense > 0 && hours > 0) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-600/60 dark:text-emerald-100';
  if (hours >= 8) return 'bg-teal-100 text-teal-800 dark:bg-teal-600/60 dark:text-teal-100';
  if (hours > 0) return 'bg-sky-100 text-sky-800 dark:bg-sky-600/60 dark:text-sky-100';
  if (approvedExpense > 0) return 'bg-lime-100 text-lime-800 dark:bg-lime-600/60 dark:text-lime-100';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300';
}

function isMissingSchemaTable(error, tableName) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('could not find the table') && msg.includes(String(tableName || '').toLowerCase());
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const [timeline, setTimeline] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [weeklySheets, setWeeklySheets] = useState([]);

  const chartColors = dark
    ? ['#2dd4bf', '#60a5fa', '#f9a8d4', '#fbbf24', '#34d399']
    : ['#0f766e', '#fb7185', '#94a3b8', '#22c55e', '#f59e0b'];

  useEffect(() => {
    async function load() {
      const [timelineRes, expenseRes, leaveRes, weeklyRes] = await Promise.all([
        supabase
          .from('timeline_entries')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false }),
        supabase
          .from('expenses')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false }),
        supabase
          .from('leave_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('start_date', { ascending: false }),
        supabase
          .from('weekly_timesheets')
          .select('*')
          .eq('user_id', user.id)
          .order('week_start', { ascending: false })
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

      if (leaveRes.error) {
        if (!isMissingSchemaTable(leaveRes.error, 'public.leave_requests')) {
          toast.error(leaveRes.error.message);
        }
        setLeaveRequests([]);
      } else {
        setLeaveRequests(leaveRes.data || []);
      }

      if (weeklyRes.error) {
        if (!isMissingSchemaTable(weeklyRes.error, 'public.weekly_timesheets')) {
          toast.error(weeklyRes.error.message);
        }
        setWeeklySheets([]);
      } else {
        setWeeklySheets(weeklyRes.data || []);
      }
    }

    load();
  }, [user.id]);

  const metrics = useMemo(() => {
    const weeklyTimeline = timeline.filter((x) => inCurrentWeek(x.date));
    const weeklyExpenses = expenses.filter((x) => x.status === 'approved' && inCurrentWeek(x.date));
    const month = new Date().getMonth();

    const monthlyTimeline = timeline.filter((x) => new Date(x.date).getMonth() === month);
    const monthlyExpenses = expenses.filter((x) => x.status === 'approved' && new Date(x.date).getMonth() === month);

    const weeklyHours = weeklyTimeline.reduce(
      (sum, entry) => sum + (entry.duration || calculateDurationHours(entry.start_time, entry.end_time)),
      0
    );

    const monthlyHours = monthlyTimeline.reduce(
      (sum, entry) => sum + (entry.duration || calculateDurationHours(entry.start_time, entry.end_time)),
      0
    );

    const weeklyExpenseTotal = weeklyExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
    const monthlyExpenseTotal = monthlyExpenses.reduce((sum, item) => sum + Number(item.amount), 0);

    const byCategory = monthlyExpenses.reduce((acc, item) => {
      categoryShareRows(item).forEach((row) => {
        acc[row.category] = (acc[row.category] || 0) + row.amount;
      });
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

  const heatmap = useMemo(() => {
    const now = new Date();
    const { monthStart, monthEnd, days } = buildMonthCalendar(now);
    const inMonth = (dateKey) => dateKey >= toDateKey(monthStart) && dateKey <= toDateKey(monthEnd);

    const dayMap = new Map(
      days.map((date) => [toDateKey(date), {
        dateKey: toDateKey(date),
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === now.getMonth(),
        hours: 0,
        approvedExpense: 0,
        isLeave: false,
        pendingCount: 0
      }])
    );

    timeline.forEach((entry) => {
      const dateKey = String(entry.date || '').slice(0, 10);
      const target = dayMap.get(dateKey);
      if (!target || !inMonth(dateKey)) return;
      target.hours += Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time));
    });

    expenses.forEach((entry) => {
      const dateKey = String(entry.date || '').slice(0, 10);
      const target = dayMap.get(dateKey);
      if (!target || !inMonth(dateKey)) return;
      if (entry.status === 'approved') target.approvedExpense += Number(entry.amount || 0);
      if (entry.status === 'pending') target.pendingCount += 1;
    });

    leaveRequests.forEach((entry) => {
      const start = entry.start_date;
      const end = entry.end_date;
      if (!start || !end) return;
      const cursor = new Date(`${start}T00:00:00`);
      const stop = new Date(`${end}T00:00:00`);
      while (cursor <= stop) {
        const dateKey = toDateKey(cursor);
        const target = dayMap.get(dateKey);
        if (target && inMonth(dateKey)) {
          if (entry.status === 'approved') target.isLeave = true;
          if (entry.status === 'pending') target.pendingCount += 1;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    weeklySheets.forEach((sheet) => {
      if (!['submitted', 'under_review'].includes(sheet.status)) return;
      const start = sheet.week_start;
      const end = sheet.week_end;
      if (!start || !end) return;
      const cursor = new Date(`${start}T00:00:00`);
      const stop = new Date(`${end}T00:00:00`);
      while (cursor <= stop) {
        const dateKey = toDateKey(cursor);
        const target = dayMap.get(dateKey);
        if (target && inMonth(dateKey)) target.pendingCount += 1;
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    const cells = days.map((date) => {
      const dateKey = toDateKey(date);
      const entry = dayMap.get(dateKey);
      return {
        ...entry,
        hours: Number(entry.hours.toFixed(2)),
        approvedExpense: Number(entry.approvedExpense.toFixed(2))
      };
    });

    return {
      monthLabel: monthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      cells
    };
  }, [timeline, expenses, leaveRequests, weeklySheets]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Your activity overview for {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Weekly Hours" value={`${metrics.weeklyHours}h`} accent="teal"
          icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Weekly Approved Expenses" value={`₹${metrics.weeklyExpenseTotal}`} accent="coral"
          icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>} />
        <StatCard title="Monthly Hours" value={`${metrics.monthlyHours}h`} accent="blue"
          icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
        <StatCard title="Monthly Approved Expenses" value={`₹${metrics.monthlyExpenseTotal}`} accent="amber"
          icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} />
      </div>

      <div className="card p-5">
        <div className="section-header">
          <h2 className="section-title">Monthly Category Breakdown</h2>
          {metrics.categoryData.length === 0 && <span className="text-xs text-slate-400">No approved expenses this month</span>}
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                {chartColors.map((color, index) => (
                  <linearGradient key={color} id={`pie-gradient-${index}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={dark ? 0.98 : 0.92} />
                    <stop offset="100%" stopColor={color} stopOpacity={dark ? 0.7 : 0.78} />
                  </linearGradient>
                ))}
              </defs>
              <Pie
                data={metrics.categoryData}
                dataKey="value"
                nameKey="name"
                outerRadius={104}
                innerRadius={54}
                paddingAngle={3}
                stroke={dark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255,255,255,0.96)'}
                strokeWidth={2}
              >
                {metrics.categoryData.map((entry, index) => (
                  <Cell key={entry.name} fill={`url(#pie-gradient-${index % chartColors.length})`} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip dark={dark} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-5">
        <div className="section-header">
          <h2 className="section-title">Activity Heatmap</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">{heatmap.monthLabel}</span>
        </div>

        {/* Legend */}
        <div className="mb-4 flex flex-wrap gap-3 text-xs">
          {[
            { color: 'bg-teal-100 dark:bg-teal-600/60', label: '8h+ worked' },
            { color: 'bg-sky-100 dark:bg-sky-600/60', label: 'Partial hours' },
            { color: 'bg-emerald-100 dark:bg-emerald-600/60', label: 'Hours + expense' },
            { color: 'bg-violet-100 dark:bg-violet-700/60', label: 'Leave' },
            { color: 'bg-amber-100 dark:bg-amber-600/60', label: 'Pending' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded ${l.color}`} />
              <span className="text-slate-500 dark:text-slate-400">{l.label}</span>
            </div>
          ))}
        </div>

        <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="py-1">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {heatmap.cells.map((cell) => (
            <div
              key={cell.dateKey}
              className={`min-h-[68px] rounded-xl p-2 text-xs transition-all duration-150 hover:scale-105 hover:shadow-md cursor-default ${
                cell.inCurrentMonth
                  ? dayCellTone(cell)
                  : 'bg-slate-50 text-slate-200 dark:bg-slate-800/30 dark:text-slate-700'
              }`}
              title={`${cell.dateKey} | ${cell.hours}h | ₹${cell.approvedExpense} | Leave: ${cell.isLeave ? 'Yes' : 'No'}`}
            >
              <div className="font-bold">{cell.day}</div>
              {cell.inCurrentMonth && (
                <>
                  <div className="mt-0.5 opacity-80">{cell.hours > 0 ? `${cell.hours}h` : ''}</div>
                  <div className="opacity-80">{cell.approvedExpense > 0 ? `₹${cell.approvedExpense}` : ''}</div>
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {cell.isLeave ? <span className="rounded bg-violet-300/80 px-1 py-0.5 text-[9px] font-bold dark:bg-violet-500/60 dark:text-white">L</span> : null}
                    {cell.pendingCount > 0 ? <span className="rounded bg-amber-300/80 px-1 py-0.5 text-[9px] font-bold dark:bg-amber-500/60 dark:text-white">P{cell.pendingCount}</span> : null}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
