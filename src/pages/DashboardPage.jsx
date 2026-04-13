import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
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

export default function DashboardPage() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const [timeline, setTimeline] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const chartColors = dark
    ? ['#2dd4bf', '#60a5fa', '#f9a8d4', '#fbbf24', '#34d399']
    : ['#0f766e', '#fb7185', '#94a3b8', '#22c55e', '#f59e0b'];

  useEffect(() => {
    async function load() {
      const [timelineRes, expenseRes] = await Promise.all([
        supabase
          .from('timeline_entries')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false }),
        supabase
          .from('expenses')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
      ]);

      setTimeline(timelineRes.data || []);
      setExpenses(expenseRes.data || []);
    }

    load();
  }, [user.id]);

  const metrics = useMemo(() => {
    const weeklyTimeline = timeline.filter((x) => inCurrentWeek(x.date));
    const weeklyExpenses = expenses.filter((x) => inCurrentWeek(x.date));
    const month = new Date().getMonth();

    const monthlyTimeline = timeline.filter((x) => new Date(x.date).getMonth() === month);
    const monthlyExpenses = expenses.filter((x) => new Date(x.date).getMonth() === month);

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
      acc[item.category] = (acc[item.category] || 0) + Number(item.amount);
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Employee Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Weekly Hours" value={`${metrics.weeklyHours}h`} accent="teal"
          icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Weekly Expenses" value={`₹${metrics.weeklyExpenseTotal}`} accent="coral"
          icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>} />
        <StatCard title="Monthly Hours" value={`${metrics.monthlyHours}h`} accent="blue"
          icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
        <StatCard title="Monthly Expenses" value={`₹${metrics.monthlyExpenseTotal}`} accent="amber"
          icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} />
      </div>

      <div className="card p-4">
        <h2 className="mb-4 text-lg font-semibold">Monthly Category Breakdown</h2>
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
    </div>
  );
}
