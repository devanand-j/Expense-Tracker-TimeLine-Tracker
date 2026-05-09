import { useEffect, useRef, useState } from 'react';
import { formatDate } from '../lib/time';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmt(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  required,
  minDate,
  maxDate,
  disabledDates = [],
  isDateDisabled,
  dayToneMap = {}
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDate(value);
  const today = new Date();
  const [view, setView] = useState(() => selected || new Date());
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => setView(new Date(year, month - 1, 1));
  const nextMonth = () => setView(new Date(year, month + 1, 1));

  const disabledSet = new Set(disabledDates || []);

  const isDateBlocked = (date) => {
    const dateKey = fmt(date);
    if (minDate && dateKey < minDate) return true;
    if (maxDate && dateKey > maxDate) return true;
    if (disabledSet.has(dateKey)) return true;
    if (typeof isDateDisabled === 'function' && isDateDisabled(dateKey)) return true;
    return false;
  };

  const select = (d) => {
    const picked = new Date(year, month, d);
    if (isDateBlocked(picked)) return;
    onChange(fmt(picked));
    setOpen(false);
  };

  const displayValue = selected ? formatDate(selected) : '';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="field flex items-center justify-between text-left"
      >
        <span className={displayValue ? 'text-ink dark:text-white' : 'text-slate-400'}>
          {displayValue || placeholder}
        </span>
        <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-800 animate-dp-in">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-sm font-bold text-ink dark:text-white">{MONTHS[month]} {year}</span>
            <button type="button" onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="mb-1 grid grid-cols-7 text-center">
            {DAYS.map((d) => (
              <span key={d} className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{d}</span>
            ))}
          </div>

          {/* Cells */}
          <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
            {cells.map((d, i) => {
              if (!d) return <span key={`e-${i}`} />;
              const cellDate = new Date(year, month, d);
              const isBlocked = isDateBlocked(cellDate);
              const tone = dayToneMap?.[fmt(cellDate)] || null;
              const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const isSelected = selected && d === selected.getDate() && month === selected.getMonth() && year === selected.getFullYear();
              const toneClass = tone === 'green'
                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800'
                : tone === 'red'
                  ? 'bg-red-100 text-red-700 ring-1 ring-red-200 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-800'
                  : '';
              return (
                <button
                  key={d}
                  type="button"
                  disabled={isBlocked}
                  onClick={() => select(d)}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition
                    ${isSelected ? 'bg-teal text-white shadow-md shadow-teal/30' : ''}
                    ${isToday && !isSelected ? 'border border-teal text-teal' : ''}
                    ${toneClass}
                    ${isBlocked ? 'cursor-not-allowed hover:bg-transparent' : ''}
                    ${isBlocked && tone !== 'red' ? 'text-slate-300 line-through dark:text-slate-600' : ''}
                    ${!isSelected && !isToday ? 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700' : ''}
                  `}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Today shortcut */}
          <button
            type="button"
            disabled={isDateBlocked(today)}
            onClick={() => { onChange(fmt(today)); setOpen(false); }}
            className="mt-3 w-full rounded-xl bg-teal/10 py-1.5 text-xs font-semibold text-teal transition hover:bg-teal/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:bg-teal/20 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
          >
            Today
          </button>
        </div>
      )}
    </div>
  );
}
