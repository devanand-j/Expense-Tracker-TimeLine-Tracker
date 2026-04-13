export default function StatCard({ title, value, note, icon, accent = 'teal' }) {
  const accents = {
    teal: 'bg-teal/10 text-teal',
    coral: 'bg-coral/10 text-coral',
    blue: 'bg-blue-100 text-blue-600',
    amber: 'bg-amber-100 text-amber-600'
  };

  return (
    <div className="card stat-card group p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
        {icon && (
          <span className={`rounded-xl p-2 text-sm ${accents[accent] || accents.teal}`}>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink">{value}</p>
      {note && <p className="mt-1.5 text-xs text-slate-400">{note}</p>}
    </div>
  );
}
