import { useEffect, useMemo, useState } from 'react';
import { reportsAPI, errorMessage } from '../../api/client';
import Icon from '../Icon';
import ExportDropdownMenu, { downloadCSV, todayStamp, usePageExport } from '../PageExport';
import { fmt, money } from '../ui';

const VARIANCE_TONE = {
  Balanced: 'bg-emerald-500/20 text-emerald-300 border-emerald-600/50',
  'Over-Yield': 'bg-amber-500/20 text-amber-300 border-amber-600/50',
  'Scrap / Loss': 'bg-rose-500/20 text-rose-300 border-rose-600/50'
};

const num = (v) => Number(v) || 0;
const lower = (v) => String(v ?? '').toLowerCase();

export default function WastageView({ showToast }) {
  const [data, setData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    reportsAPI.getWastage()
      .then((r) => setData(r.data))
      .catch((e) => showToast(errorMessage(e, 'Failed to load wastage log'), 'error'));
  }, [showToast]);

  const records = useMemo(() => {
    if (!data) return [];
    const term = searchTerm.toLowerCase().trim();
    return data.batches.filter((b) => {
      if (filter !== 'All' && b.variance_status !== filter) return false;
      if (!term) return true;
      return (
        lower(b.batch_number).includes(term) ||
        lower(b.recipe_name).includes(term) ||
        lower(b.production_date).includes(term) ||
        lower(b.status).includes(term) ||
        (b.ingredients || []).some((i) => lower(i.item_name).includes(term) || lower(i.item_code).includes(term))
      );
    });
  }, [data, searchTerm, filter]);

  const totals = useMemo(() => records.reduce((acc, b) => ({
    wastageKg: acc.wastageKg + num(b.wastage_kg),
    wastageCost: acc.wastageCost + num(b.wastage_cost),
    gross: acc.gross + num(b.gross_production_cost),
    net: acc.net + num(b.net_production_cost)
  }), { wastageKg: 0, wastageCost: 0, gross: 0, net: 0 }), [records]);

  const exportCSV = () => {
    const rows = [
      ['=== TOP SUMMARY ==='],
      ['Batches Audited', 'Total Ingredient Wastage (kg)', 'Total Wastage Cost ($)', 'Total Gross Production Cost ($)', 'Net Production Cost After Wastage Deduction ($)'],
      [records.length, totals.wastageKg.toFixed(2), totals.wastageCost.toFixed(2), totals.gross.toFixed(2), totals.net.toFixed(2)],
      [],
      ['=== PER-BATCH & PER-INGREDIENT WASTAGE BREAKDOWN ==='],
      ['Batch #', 'Production Date', 'Flavour / Formulation', 'Bins / Scale', 'Wastage %', 'Ingredient ID', 'Ingredient Name', 'Ingredient Used (kg)',
        'Unit Cost ($/kg)', 'Total Ingredient Cost ($)', 'Ingredient Wastage (kg)', 'Ingredient Wastage Cost ($)', 'Batch Total Wastage Cost ($)',
        'Gross Batch Production Cost ($)', 'Net Batch Production Cost ($)', 'Yield Delta (g)', 'Yield Variance']
    ];
    records.forEach((b) => {
      const head = [b.batch_number, String(b.production_date).slice(0, 10), b.recipe_name, `${num(b.bins_count)} bins (${fmt(b.multiplier, 2)} batches)`, `${b.wastage_percent}%`];
      const tail = [num(b.wastage_cost).toFixed(2), num(b.gross_production_cost).toFixed(2), num(b.net_production_cost).toFixed(2),
        b.packaged_at ? num(b.variance_delta_grams) : '', b.variance_status || 'Pending Packaging'];
      if (!b.ingredients.length) rows.push([...head, '', 'No Ingredients', 0, 0, 0, 0, 0, ...tail]);
      b.ingredients.forEach((i) => rows.push([
        ...head, i.item_code, i.item_name, num(i.used_kg).toFixed(2), num(i.cost_per_kg).toFixed(2), num(i.ingredient_cost).toFixed(2),
        num(i.wastage_kg).toFixed(3), num(i.wastage_cost).toFixed(2), ...tail
      ]));
    });
    downloadCSV(`Wastage_Batch_Ingredient_Cost_Report_${todayStamp()}.csv`, rows);
    showToast('Wastage & Batch Cost Deduction Report exported to Excel/CSV!');
  };
  usePageExport(exportCSV);

  const s = data?.summary;
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4 no-print">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Icon name="AlertTriangle" size={20} className="text-orange-600" />
              Wastage, Ingredient Scrap Cost &amp; Production Deduction Log
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Shows each Batch # and Flavour with ingredient-by-ingredient wastage weight &amp; cost, batch wastage total, and the automatic deduction applied in the Production tab. Yield variance: packaged grams minus theoretical dough grams, within ±50 g is balanced.
            </p>
          </div>
          <ExportDropdownMenu onExportExcel={exportCSV} onPrintPDF={() => window.print()} />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative max-w-md w-full">
            <input
              type="text"
              placeholder="Search Batch #, Flavour, Date, or Ingredient..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border-2 border-orange-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500 bg-orange-50/30"
            />
            <span className="absolute left-3 top-3 text-orange-600"><Icon name="Search" size={15} /></span>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl self-start">
            {['All', 'Balanced', 'Over-Yield', 'Scrap / Loss'].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === f ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>{f}</button>
            ))}
          </div>
        </div>
      </div>

      <div id="printable-audit-area" className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">Batches Audited</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{records.length} Batch(es)</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {s ? `${s.balanced} balanced · ${s.over_yield} over · ${s.scrap} scrap` : 'Active production runs'}
            </div>
          </div>
          <div className="bg-orange-50/70 p-5 rounded-2xl shadow-sm border border-orange-200">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-900 block">Total Ingredient Wastage</span>
            <div className="text-2xl font-black font-mono text-orange-700 mt-1">{fmt(totals.wastageKg, 2)} kg</div>
            <div className="text-[11px] text-orange-800/80 mt-0.5">{Math.round(totals.wastageKg * 1000).toLocaleString()} g total dough scrap</div>
          </div>
          <div className="bg-rose-50/70 p-5 rounded-2xl shadow-sm border border-rose-200">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-900 block">Total Wastage Cost (Deducted)</span>
            <div className="text-2xl font-black font-mono text-rose-700 mt-1">-{money(totals.wastageCost)}</div>
            <div className="text-[11px] text-rose-800/80 mt-0.5">Taken from ingredients &amp; deducted in Production</div>
          </div>
          <div className="bg-emerald-50/70 p-5 rounded-2xl shadow-sm border border-emerald-200">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900 block">Net Production Cost (After Deduction)</span>
            <div className="text-2xl font-black font-mono text-emerald-700 mt-1">{money(totals.net)}</div>
            <div className="text-[11px] text-emerald-800/80 mt-0.5">Gross: {money(totals.gross)} − {money(totals.wastageCost)}</div>
          </div>
        </div>

        {records.map((b) => (
          <div key={b.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-orange-500 text-white font-mono text-xs font-black">BATCH #{b.batch_number}</span>
                  <span className="text-sm sm:text-base font-extrabold text-white">Flavour: {b.recipe_name}</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-amber-300 border border-slate-700">
                    Wastage Rate: {b.wastage_percent}%
                  </span>
                  {b.variance_status && (
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${VARIANCE_TONE[b.variance_status]}`}>
                      Yield {num(b.variance_delta_grams) > 0 ? '+' : ''}{fmt(b.variance_delta_grams, 0)} g · {b.variance_status}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-300">
                  Production Date: <b className="text-white">{String(b.production_date).slice(0, 10)}</b> &bull; Scale:{' '}
                  <b className="text-white">{num(b.bins_count)} Bins ({fmt(b.multiplier, 2)} Batches)</b> &bull; Status: <b className="text-emerald-300">{b.status}</b>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700">
                  <span className="text-[10px] text-slate-400 uppercase block font-sans">Gross Production Cost</span>
                  <span className="font-bold text-white">{money(b.gross_production_cost)}</span>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-rose-950/80 border border-rose-700">
                  <span className="text-[10px] text-rose-300 uppercase block font-sans">Batch Wastage Total</span>
                  <span className="font-black text-rose-400">-{money(b.wastage_cost)} ({fmt(b.wastage_kg, 2)} kg)</span>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-700">
                  <span className="text-[10px] text-emerald-300 uppercase block font-sans">Net Production Cost</span>
                  <span className="font-black text-emerald-400">{money(b.net_production_cost)}</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3">Ingredient Name</th>
                    <th className="px-6 py-3 text-right">Batch Qty Used</th>
                    <th className="px-6 py-3 text-right">Ingredient Unit Cost</th>
                    <th className="px-6 py-3 text-right">Total Ingredient Cost</th>
                    <th className="px-6 py-3 text-center">Wastage %</th>
                    <th className="px-6 py-3 text-right text-orange-700">Wastage Qty (kg / g)</th>
                    <th className="px-6 py-3 text-right text-rose-700">Wastage Cost Taken ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {b.ingredients.map((i) => (
                    <tr key={i.item_id} className="hover:bg-slate-50/80 transition">
                      <td className="px-6 py-3 font-bold text-slate-900">
                        {i.item_name}
                        <span className="ml-2 text-[10px] font-mono text-slate-400">({i.item_code})</span>
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-semibold text-slate-700">
                        {fmt(i.used_kg, 2)} kg <span className="text-[10px] text-slate-400">({Math.round(num(i.used_kg) * 1000).toLocaleString()} g)</span>
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-slate-600">{money(i.cost_per_kg)}/kg</td>
                      <td className="px-6 py-3 text-right font-mono font-bold text-slate-800">{money(i.ingredient_cost)}</td>
                      <td className="px-6 py-3 text-center font-mono font-bold text-orange-700">{i.wastage_percent}%</td>
                      <td className="px-6 py-3 text-right font-mono font-bold text-orange-700">
                        {fmt(i.wastage_kg, 3)} kg <span className="text-[10px] text-orange-500">({Math.round(num(i.wastage_kg) * 1000).toLocaleString()} g)</span>
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-black text-rose-700">{money(i.wastage_cost)}</td>
                    </tr>
                  ))}
                  {b.ingredients.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-6 text-center text-slate-400">This batch's formulation has no baking ingredients.</td></tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs">
                  <tr>
                    <td className="px-6 py-3.5 text-slate-900 uppercase">Total for Batch #{b.batch_number} ({b.recipe_name})</td>
                    <td className="px-6 py-3.5 text-right font-mono text-slate-800">{fmt(b.ingredients.reduce((a, i) => a + num(i.used_kg), 0), 2)} kg</td>
                    <td className="px-6 py-3.5 text-right text-slate-400">—</td>
                    <td className="px-6 py-3.5 text-right font-mono text-slate-900">{money(b.total_ingredient_cost)}</td>
                    <td className="px-6 py-3.5 text-center font-mono text-orange-800">{b.wastage_percent}%</td>
                    <td className="px-6 py-3.5 text-right font-mono font-black text-orange-800">
                      {fmt(b.wastage_kg, 3)} kg ({Math.round(num(b.wastage_kg) * 1000).toLocaleString()} g)
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono font-black text-rose-700 text-sm">{money(b.wastage_cost)}</td>
                  </tr>
                  <tr className="bg-emerald-50/70 border-t border-emerald-200 text-emerald-950">
                    <td colSpan={4} className="px-6 py-3 font-extrabold uppercase text-[11px]">Production Cost Reconciliation (Deducted in Production Tab)</td>
                    <td colSpan={3} className="px-6 py-3 text-right font-mono text-xs">
                      Gross Production Cost: <b>{money(b.gross_production_cost)}</b>
                      {' '}&minus; Batch Wastage Total: <b className="text-rose-700">-{money(b.wastage_cost)}</b>
                      {' '}= <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-black">Net Production Cost: {money(b.net_production_cost)}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))}

        {data && records.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center text-slate-400 text-xs">
            {data.batches.length === 0
              ? 'No baked production batches yet.'
              : `No production batches found matching "${searchTerm}"${filter !== 'All' ? ` marked ${filter}` : ''}.`}
          </div>
        )}
      </div>
    </div>
  );
}
