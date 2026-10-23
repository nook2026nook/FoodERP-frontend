// Small shared building blocks for the data-entry screens.
import { useEffect, useState } from 'react';

export const inputClass =
  'w-full text-xs px-3 py-2.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400';

export const fmt = (n, digits = 2) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const money = (n, digits = 2) => `$${fmt(n, digits)}`;

/** Quantity with the unit an item is stocked in. */
export const qty = (n, unitType) => (unitType === 'kg' ? `${fmt(n, 3)} kg` : `${fmt(n, 0)} units`);

export function Card({ title, actions, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4 ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className="font-bold text-sm text-slate-800">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Field({ label, htmlFor, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

const STATUS_STYLES = {
  Planned: 'bg-slate-100 text-slate-700',
  'In Production': 'bg-amber-100 text-amber-800',
  Completed: 'bg-sky-100 text-sky-800',
  'Quality Hold': 'bg-rose-100 text-rose-800',
  Released: 'bg-emerald-100 text-emerald-800',
  'Partially Shipped': 'bg-indigo-100 text-indigo-800',
  'Fully Shipped': 'bg-slate-800 text-white',
  Cancelled: 'bg-slate-200 text-slate-500 line-through'
};

export function StatusPill({ status }) {
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  );
}

/** value, but only after it has stopped changing for `ms`. */
export function useDebounced(value, ms = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Download rows (array of arrays) as a CSV file that Excel opens directly. */
export function downloadCsv(filename, rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Local calendar date as YYYY-MM-DD (toISOString would give the UTC date).
export const todayIso = () => new Date().toLocaleDateString('en-CA');
