import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { reportsAPI, errorMessage } from '../../api/client';
import { Card, downloadCsv, fmt, todayIso } from '../ui';

const TIMEFRAMES = [['daily', 'Today'], ['weekly', 'This Week'], ['monthly', 'This Month'], ['yearly', 'This Year'], ['all', 'All Time']];

export default function ReportsView({ showToast }) {
  const [timeframe, setTimeframe] = useState('monthly');
  const [report, setReport] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await reportsAPI.getShipments(timeframe);
      setReport(data);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load shipping report'), 'error');
    }
  }, [timeframe, showToast]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    downloadCsv(`shipping_report_${timeframe}_${todayIso()}.csv`, [
      ['Date', 'Customer', 'Invoice', 'Product', 'Quantity', 'Unit', 'Bags', 'Batches', 'Source', 'Allocation'],
      ...report.lines.map((l) => [
        l.shipped_at, l.customer_name, l.invoice_number, l.product_description || 'Unmapped item',
        l.quantity, l.unit_type || '', l.unit_type === 'box' ? l.quantity * 12 : l.quantity,
        l.batches, l.source, l.allocation_status
      ])
    ]);
  };

  const s = report?.summary;
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="bg-white rounded-2xl shadow-sm border p-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold text-slate-800">Shipping Reports &amp; Dispatches</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl" role="tablist">
            {TIMEFRAMES.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={timeframe === id} onClick={() => setTimeframe(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${timeframe === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={exportCsv} disabled={!report?.lines.length} className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-slate-900 text-white rounded-lg disabled:opacity-40">
            <Download size={14} /> Excel / CSV
          </button>
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Shipments', s.shipments], ['Customers', s.customers], ['Bags shipped', fmt(s.total_bags, 0)], ['Unallocated lines', s.unallocated_lines]].map(([label, value]) => (
            <div key={label} className={`bg-white border rounded-xl p-4 ${label === 'Unallocated lines' && value > 0 ? 'border-rose-300' : ''}`}>
              <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
              <div className="text-xl font-black text-slate-900 tabular-nums">{value}</div>
            </div>
          ))}
        </div>
      )}

      {s?.by_product.length > 0 && (
        <Card title="Shipped by product">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {s.by_product.map((p) => (
              <div key={p.product} className="flex justify-between bg-slate-50 rounded-lg px-3 py-2">
                <span className="font-bold">{p.product}</span>
                <span className="tabular-nums text-slate-600">{p.boxes} box · {p.bags} bag · <b>{p.total_bags} bags</b></span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b">
              <tr>
                <th className="px-6 py-3">Date</th><th className="px-6 py-3">Customer</th><th className="px-6 py-3">Invoice</th>
                <th className="px-6 py-3">Product</th><th className="px-6 py-3 text-right">Qty</th>
                <th className="px-6 py-3">Batches</th><th className="px-6 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report?.lines.map((l) => (
                <tr key={l.line_id} className="hover:bg-slate-50">
                  <td className="px-6 py-2.5 whitespace-nowrap">{l.shipped_at}</td>
                  <td className="px-6 py-2.5 font-bold">{l.customer_name}</td>
                  <td className="px-6 py-2.5 font-mono">{l.invoice_number}</td>
                  <td className="px-6 py-2.5">
                    {l.product_description || 'Unmapped item'}
                    {l.allocation_status !== 'allocated' && <span className="ml-1 text-[10px] font-bold text-rose-600 uppercase">{l.allocation_status}</span>}
                  </td>
                  <td className="px-6 py-2.5 text-right tabular-nums">{l.quantity} {l.unit_type || ''}</td>
                  <td className="px-6 py-2.5 font-mono text-slate-600">{l.batches || '—'}</td>
                  <td className="px-6 py-2.5 text-slate-500">{l.source}</td>
                </tr>
              ))}
              {report && report.lines.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400">No dispatches in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
