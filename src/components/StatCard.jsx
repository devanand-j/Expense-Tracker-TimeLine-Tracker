export default function StatCard({ title, value, note, icon, accent = 'teal', trend }) {
  const accents = {
    teal:   { icon: 'bg-gradient-teal text-white shadow-teal-sm', bar: 'bg-teal' },
    coral:  { icon: 'bg-gradient-to-br from-rose-400 to-red-500 text-white shadow-sm shadow-rose-200', bar: 'bg-rose-400' },
    blue:   { icon: 'bg-gradient-sky text-white shadow-sm shadow-sky-200', bar: 'bg-sky-500' },
    amber:  { icon: 'bg-gradient-amber text-white shadow-sm shadow-amber-200', bar: 'bg-amber-400' },
    violet: { icon: 'bg-gradient-violet text-white shadow-sm shadow-violet-200', bar: 'bg-violet-500' }
  };

  const a = accents[accent] || accents.teal;

  return (
    <div className="card stat-card-enter group relative overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-md">
      {/* Accent bar */}
      <div className={`absolute left-0 top-0 h-full w-1 rounded-l-2xl ${a.bar}`} />

      <div className="flex items-start justify-between pl-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{title}</p>
          <p className="mt-2.5 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{value}</p>
          {note && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{note}</p>}
          {trend !== undefined && (
            <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend >= 0
                ? <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                : <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              }
              {Math.abs(trend)}% vs last week
            </div>
          )}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${a.icon}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
