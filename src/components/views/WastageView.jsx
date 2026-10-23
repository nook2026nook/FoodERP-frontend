import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { reportsAPI, errorMessage } from '../../api/client';
import { StatusPill, downloadCsv, fmt, money, todayIso } from '../ui';

const VARIANCE_TONE = {
  Balanced: 'bg-emerald-100 text-emerald-800',
  'Over-Yield': 'bg-amber-100 text-amber-800',
  'Scrap / Loss': 'bg-rose-100 text-rose-800'
};

export default function WastageView({ showToast }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    reportsAPI.getWastage()
      .then((r) => setData(r.data))
      .catch((e) => showToast(errorMessage(e, 'Failed to load wastage log'), 'error'));
  }, [showToast]);

  const rows = !data ? [] : filter === 'All' ? data.batches : data.batches.filter((b) => b.variance_status === filter);

  const exportCsv = () => downloadCsv(`wastage_variance_${todayIso()}.csv`, [
    ['Batch', 'Recipe', 'Date', 'Status', 'Theoretical g', 'Packaged g', 'Delta g', 'Variance', 'Packaging cost'],
    ...rows.map((b) => [b.batch_number, b.recipe_name, b.production_date, b.status, Number(b.theoretical_dough_grams),
      Number(b.packaged_weight_grams), Number(b.variance_delta_grams), b.variance_status, Number(b.total_pkg_cost)])
  ]);

  const s = data?.summary;
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="bg-white rounded-2xl shadow-sm border p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">Wastage &amp; Yield Variance Log</h3>
          <p className="text-xs text-slate-500">Packaged grams minus theoretical dough grams. Within ±50 g is balanced.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {['All', 'Balanced', 'Over-Yield', 'Scrap / Loss'].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === f ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>{f}</button>
            ))}
          </div>
          <button onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-slate-900 text-white rounded-lg disabled:opacity-40">
            <Download size={14} /> Excel / CSV
          </button>
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Batches packaged', s.batches, `${s.balanced} balanced · ${s.over_yield} over · ${s.scrap} scrap`],
            ['Scrap / loss', `${fmt(-s.scrap_grams / 1000, 2)} kg`, 'Dough not packed'],
            ['Over-yield', `${fmt(s.over_grams / 1000, 2)} kg`, 'Packed above theory'],
            ['Packaging cost', money(s.packaging_cost), `${fmt(s.packaged_grams / 1000, 1)} kg packed`]
          ].map(([label, value, note]) => (
            <div key={label} className="bg-white border rounded-xl p-4">
              <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
              <div className="text-xl font-black text-slate-900 tabular-nums">{value}</div>
              <div className="text-[11px] text-slate-500">{note}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b">
              <tr>
                <th className="px-6 py-3">Batch</th><th className="px-6 py-3">Recipe</th><th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Status</th><th className="px-6 py-3 text-right">Theoretical</th>
                <th className="px-6 py-3 text-right">Packaged</th><th className="px-6 py-3 text-right">Delta</th>
                <th className="px-6 py-3">Variance</th><th className="px-6 py-3 text-right">Pkg cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-6 py-2.5 font-mono font-bold">{b.batch_number}</td>
                  <td className="px-6 py-2.5">{b.recipe_name}</td>
                  <td className="px-6 py-2.5 whitespace-nowrap">{b.production_date}</td>
                  <td className="px-6 py-2.5"><StatusPill status={b.status} /></td>
                  <td className="px-6 py-2.5 text-right tabular-nums">{fmt(b.theoretical_dough_grams, 0)} g</td>
                  <td className="px-6 py-2.5 text-right tabular-nums">{fmt(b.packaged_weight_grams, 0)} g</td>
                  <td className="px-6 py-2.5 text-right tabular-nums font-bold">{Number(b.variance_delta_grams) > 0 ? '+' : ''}{fmt(b.variance_delta_grams, 0)} g</td>
                  <td className="px-6 py-2.5"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${VARIANCE_TONE[b.variance_status]}`}>{b.variance_status}</span></td>
                  <td className="px-6 py-2.5 text-right tabular-nums">{money(b.total_pkg_cost)}</td>
                </tr>
              ))}
              {data && rows.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-slate-400">No packaged batches{filter !== 'All' ? ` marked ${filter}` : ''} yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
