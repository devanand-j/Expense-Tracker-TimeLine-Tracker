import { useEffect, useRef, useState } from 'react';

function pad(n) { return String(n).padStart(2, '0'); }

function parse24(str) {
  if (!str) return { h: 9, m: 0, ampm: 'AM' };
  const [hh, mm] = str.split(':').map(Number);
  const ampm = hh < 12 ? 'AM' : 'PM';
  const h = hh % 12 || 12;
  return { h, m: mm, ampm };
}

function to24(h, m, ampm) {
  let hh = h % 12;
  if (ampm === 'PM') hh += 12;
  return `${pad(hh)}:${pad(m)}`;
}

function ScrollCol({ items, selected, onSelect }) {
  const ref = useRef(null);
  const ITEM_H = 40;

  useEffect(() => {
    const idx = items.indexOf(selected);
    if (ref.current && idx >= 0) {
      ref.current.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
    }
  }, [selected, items]);

  return (
    <div
      ref={ref}
      className="no-scrollbar h-[120px] overflow-y-auto scroll-smooth"
      style={{ scrollSnapType: 'y mandatory' }}
    >
      {items.map((item) => (
        <div
          key={item}
          onClick={() => onSelect(item)}
          style={{ scrollSnapAlign: 'start', height: ITEM_H }}
          className={`flex cursor-pointer items-center justify-center rounded-xl text-sm font-semibold transition
            ${selected === item
              ? 'bg-teal text-white shadow shadow-teal/30'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
        >
          {pad(item)}
        </div>
      ))}
    </div>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

export default function TimePicker({ value, onChange, placeholder = 'Select time' }) {
  const [open, setOpen] = useState(false);
  const { h, m, ampm } = parse24(value);
  const [selH, setSelH] = useState(h);
  const [selM, setSelM] = useState(m);
  const [selAP, setSelAP] = useState(ampm);
  const ref = useRef(null);

  useEffect(() => {
    const { h: ph, m: pm, ampm: pap } = parse24(value);
    setSelH(ph); setSelM(pm); setSelAP(pap);
  }, [value]);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const commit = (h, m, ap) => {
    onChange(to24(h, m, ap));
  };

  const display = value
    ? `${pad(selH)}:${pad(selM)} ${selAP}`
    : '';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="field flex items-center justify-between text-left"
      >
        <span className={display ? 'text-ink dark:text-white' : 'text-slate-400'}>
          {display || placeholder}
        </span>
        <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-800 animate-dp-in">
          <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-slate-400">Pick Time</p>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">Hour</p>
              <ScrollCol items={HOURS} selected={selH} onSelect={(v) => { setSelH(v); commit(v, selM, selAP); }} />
            </div>
            <span className="text-xl font-bold text-slate-300">:</span>
            <div className="flex-1">
              <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">Min</p>
              <ScrollCol items={MINUTES} selected={selM} onSelect={(v) => { setSelM(v); commit(selH, v, selAP); }} />
            </div>
            <div className="flex flex-col gap-2">
              {['AM', 'PM'].map((ap) => (
                <button
                  key={ap}
                  type="button"
                  onClick={() => { setSelAP(ap); commit(selH, selM, ap); }}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition
                    ${selAP === ap ? 'bg-teal text-white shadow shadow-teal/30' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'}`}
                >
                  {ap}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full rounded-xl bg-teal py-2 text-xs font-bold text-white transition hover:bg-teal/90"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
