import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon';

/**
 * Page-level export. The header's Export button is global; each view registers
 * its own CSV exporter with usePageExport() while it is mounted.
 */
const PageExportContext = createContext({ register: () => {}, run: () => false, has: false });

export function PageExportProvider({ children }) {
  const handlerRef = useRef(null);
  const [has, setHas] = useState(false);

  const value = useRef({
    register: (fn) => {
      handlerRef.current = fn;
      setHas(Boolean(fn));
    },
    run: () => {
      if (typeof handlerRef.current !== 'function') return false;
      handlerRef.current();
      return true;
    }
  }).current;

  return (
    <PageExportContext.Provider value={{ ...value, has }}>
      {children}
    </PageExportContext.Provider>
  );
}

/** Register the CSV exporter for the mounted view. `fn` is read at click time, so it may close over fresh data. */
export function usePageExport(fn) {
  const { register } = useContext(PageExportContext);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    register(() => fnRef.current && fnRef.current());
    return () => register(null);
  }, [register]);
}

export function usePageExportContext() {
  return useContext(PageExportContext);
}

export { downloadCsv as downloadCSV } from './ui';

export const todayStamp = () => new Date().toISOString().slice(0, 10);

export default function ExportDropdownMenu({ onExportExcel, onPrintPDF, label = 'Export', excelDisabled = false }) {
  const [open, setOpen] = useState(false);

  const handleExcel = () => {
    setOpen(false);
    if (typeof onExportExcel === 'function') onExportExcel();
  };

  const handlePrint = () => {
    setOpen(false);
    setTimeout(() => {
      if (typeof onPrintPDF === 'function') onPrintPDF();
      else window.print();
    }, 50);
  };

  return (
    <div className="relative inline-block text-left no-print">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm border border-slate-700"
        title="Export to Excel/CSV or Print / Save PDF"
      >
        <Icon name="Download" size={13} className="text-emerald-400" />
        <span>{label}</span>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={13} className="text-slate-300" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-50 text-xs text-slate-800">
            <div className="px-3 py-1 border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Export Options
            </div>
            <button
              type="button"
              onClick={handleExcel}
              disabled={excelDisabled}
              className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-2.5 font-bold text-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="FileSpreadsheet" size={14} className="text-emerald-600" />
              <span>Export Excel / CSV</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center gap-2.5 font-bold text-slate-700 transition"
            >
              <Icon name="Printer" size={14} className="text-slate-700" />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
