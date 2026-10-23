import { useEffect, useState } from 'react';
import { Download, Printer, ShieldAlert } from 'lucide-react';
import { recallAPI, errorMessage } from '../../api/client';
import { Card, StatusPill, downloadCsv, fmt, todayIso, useDebounced } from '../ui';

const unit = (unitType) => (unitType === 'kg' ? 'kg' : 'units');

function Table({ head, rows, empty }) {
  return (
    <div className="overflow-x-auto -mx-6">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-y border-slate-200">
          <tr>{head.map((h) => <th key={h} className="px-6 py-2.5">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length ? rows : <tr><td colSpan={head.length} className="px-6 py-4 text-slate-400">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function RecallView({ showToast }) {
  const [mode, setMode] = useState('batch');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState({ batches: [], lots: [] });
  const [dossier, setDossier] = useState(null);
  const [elapsed, setElapsed] = useState(null);
  const [running, setRunning] = useState(false);
  const debounced = useDebounced(query.trim(), 250);

  useEffect(() => {
    if (!debounced) { setSuggestions({ batches: [], lots: [] }); return; }
    recallAPI.search(debounced).then((r) => setSuggestions(r.data)).catch(() => {});
  }, [debounced]);

  const run = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setRunning(true);
    const started = performance.now();
    try {
      const { data } = mode === 'batch' ? await recallAPI.byBatch(query.trim()) : await recallAPI.byLot(query.trim());
      setDossier(data);
      setElapsed((performance.now() - started) / 1000);
    } catch (err) {
      setDossier(null);
      showToast(errorMessage(err, 'Recall lookup failed'), 'error');
    } finally {
      setRunning(false);
    }
  };

  const exportCsv = () => {
    const d = dossier;
    const rows = [
      [`FSMA Mock Recall Dossier — ${d.mode === 'batch' ? 'Batch' : 'Lot'} ${d.query}`],
      ['Generated', d.generated_at],
      []
    ];
    if (d.mode === 'batch') {
      rows.push(['UPSTREAM INGREDIENT & PACKAGING LOTS'], ['Stage', 'Lot', 'Item', 'Quantity', 'Unit', 'Supplier', 'PO', 'Received', 'Expiry']);
      d.upstream_lots.forEach((l) => rows.push([l.stage, l.lot_number, l.item_name, Number(l.quantity), unit(l.unit_type), l.supplier_name, l.po_number, l.received_at, l.expiry_date]));
    } else {
      rows.push(['LOT'], ['Lot', 'Item', 'Supplier', 'PO', 'Received', 'Expiry', 'Received qty', 'Remaining']);
      d.lots.forEach((l) => rows.push([l.lot_number, l.item_name, l.supplier_name, l.po_number, l.received_at, l.expiry_date, Number(l.total_quantity), Number(l.remaining_quantity)]));
      rows.push([], ['AFFECTED BATCHES'], ['Batch', 'Recipe', 'Produced', 'Status']);
      d.batches.forEach((b) => rows.push([b.batch_number, b.recipe_name, b.production_date, b.status]));
    }
    rows.push([], ['DOWNSTREAM CUSTOMERS'], ['Shipped', 'Customer', 'Invoice', 'QuickBooks invoice', 'Batch', 'Product', 'Boxes', 'Bags']);
    d.shipments.forEach((s) => rows.push([s.shipped_at, s.customer_name, s.invoice_number, s.qbo_invoice_id, s.batch_number, s.product_description, s.boxes, s.bags]));
    rows.push([], ['STILL IN WAREHOUSE (QUARANTINE)'], ['Batch', 'Format', 'Status', 'Boxes', 'Loose bags']);
    d.on_hand.forEach((o) => rows.push([o.batch_number, o.format, o.status, o.boxes_on_hand, o.bags_on_hand]));
    downloadCsv(`recall_${d.mode}_${d.query}_${todayIso()}.csv`, rows);
  };

  const options = mode === 'batch' ? suggestions.batches : suggestions.lots;

  return (
    <div id="printable-audit-area" className="space-y-6 max-w-6xl">
      <Card title="FSMA Mock Recall Audit Dossier">
        <form onSubmit={run} className="flex flex-wrap gap-2 items-center no-print">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {[['batch', 'By Production Batch'], ['lot', 'By Ingredient Lot']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => { setMode(id); setDossier(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${mode === id ? 'bg-white shadow-sm text-rose-700' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>
          <input
            id="recall-query" list="recall-options" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'batch' ? 'Batch #, e.g. BATCH-261020-123' : 'Lot #, e.g. F-001'}
            className="flex-1 min-w-[200px] p-2.5 border rounded-xl text-xs font-mono"
          />
          <datalist id="recall-options">{options.map((o) => <option key={o} value={o} />)}</datalist>
          <button type="submit" disabled={running || !query.trim()} className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1">
            <ShieldAlert size={14} /> Run Recall
          </button>
        </form>
      </Card>

      {dossier && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-black text-sm text-rose-700 uppercase">Traceability report — {dossier.mode === 'batch' ? 'Batch' : 'Lot'} {dossier.query}</h4>
              <p className="text-[11px] text-slate-500">Generated {new Date(dossier.generated_at).toLocaleString()}{elapsed !== null && ` · completed in ${fmt(elapsed, 2)} s`}</p>
            </div>
            <div className="flex gap-2 no-print">
              <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-slate-900 text-white rounded-lg"><Download size={14} /> Excel / CSV</button>
              <button onClick={() => window.print()} className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-slate-100 border rounded-lg"><Printer size={14} /> Print / PDF</button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['Customers affected', dossier.summary.customers.length], ['Invoices', dossier.summary.invoices],
              ['Boxes shipped', dossier.summary.boxes_shipped], ['Loose bags shipped', dossier.summary.bags_shipped]].map(([label, value]) => (
              <div key={label} className="bg-white border rounded-xl p-4">
                <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
                <div className="text-xl font-black text-slate-900 tabular-nums">{value}</div>
              </div>
            ))}
          </div>

          {dossier.mode === 'batch' && (
            <>
              <Card title="Batch">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  <span><b>{dossier.batch.batch_number}</b> · {dossier.batch.recipe_name}</span>
                  <span>Produced {dossier.batch.production_date}</span>
                  <span>{Number(dossier.batch.bins_count)} bins</span>
                  <StatusPill status={dossier.batch.status} />
                </div>
              </Card>
              <Card title={`Upstream lots used (${dossier.upstream_lots.length})`}>
                <Table
                  head={['Stage', 'Lot', 'Item', 'Used', 'Supplier', 'Received', 'Expiry']}
                  empty="No lots recorded for this batch."
                  rows={dossier.upstream_lots.map((l) => (
                    <tr key={`${l.stage}-${l.lot_id}`}>
                      <td className="px-6 py-2 capitalize">{l.stage}</td>
                      <td className="px-6 py-2 font-mono font-bold">{l.lot_number}</td>
                      <td className="px-6 py-2">{l.item_name}</td>
                      <td className="px-6 py-2 tabular-nums">{fmt(l.quantity, 3)} {unit(l.unit_type)}</td>
                      <td className="px-6 py-2">{l.supplier_name || '—'}</td>
                      <td className="px-6 py-2">{l.received_at}</td>
                      <td className="px-6 py-2">{l.expiry_date || '—'}</td>
                    </tr>
                  ))}
                />
              </Card>
            </>
          )}

          {dossier.mode === 'lot' && (
            <>
              <Card title="Lot">
                <Table
                  head={['Lot', 'Item', 'Supplier', 'PO', 'Received', 'Expiry', 'Received qty', 'Remaining']}
                  empty=""
                  rows={dossier.lots.map((l) => (
                    <tr key={l.id}>
                      <td className="px-6 py-2 font-mono font-bold">{l.lot_number}</td>
                      <td className="px-6 py-2">{l.item_name}</td>
                      <td className="px-6 py-2">{l.supplier_name || '—'}</td>
                      <td className="px-6 py-2">{l.po_number || '—'}</td>
                      <td className="px-6 py-2">{l.received_at}</td>
                      <td className="px-6 py-2">{l.expiry_date || '—'}</td>
                      <td className="px-6 py-2 tabular-nums">{fmt(l.total_quantity, 3)} {unit(l.unit_type)}</td>
                      <td className="px-6 py-2 tabular-nums">{fmt(l.remaining_quantity, 3)} {unit(l.unit_type)}</td>
                    </tr>
                  ))}
                />
              </Card>
              <Card title={`Batches that used this lot (${dossier.batches.length})`}>
                <Table
                  head={['Batch', 'Recipe', 'Produced', 'Status', 'Used']}
                  empty="This lot has not been used in production."
                  rows={dossier.batches.map((b) => (
                    <tr key={b.id}>
                      <td className="px-6 py-2 font-mono font-bold">{b.batch_number}</td>
                      <td className="px-6 py-2">{b.recipe_name}</td>
                      <td className="px-6 py-2">{b.production_date}</td>
                      <td className="px-6 py-2"><StatusPill status={b.status} /></td>
                      <td className="px-6 py-2 tabular-nums">
                        {b.lot_usage.map((u) => {
                          const lot = dossier.lots.find((l) => l.id === u.lot_id);
                          return <div key={`${u.lot_id}-${u.stage}`}>{fmt(u.quantity, 3)} {unit(lot?.unit_type)} ({u.stage})</div>;
                        })}
                      </td>
                    </tr>
                  ))}
                />
              </Card>
            </>
          )}

          <Card title={`Downstream customers (${dossier.shipments.length} shipments)`}>
            <Table
              head={['Shipped', 'Customer', 'Invoice', 'Batch', 'Product', 'Qty', 'Source']}
              empty="Nothing from these batches has shipped."
              rows={dossier.shipments.map((s, i) => (
                <tr key={i}>
                  <td className="px-6 py-2">{s.shipped_at}</td>
                  <td className="px-6 py-2 font-bold">{s.customer_name}</td>
                  <td className="px-6 py-2 font-mono">{s.invoice_number}{s.qbo_invoice_id && <span className="text-slate-400"> (QBO {s.qbo_invoice_id})</span>}</td>
                  <td className="px-6 py-2 font-mono">{s.batch_number}</td>
                  <td className="px-6 py-2">{s.product_description}</td>
                  <td className="px-6 py-2 tabular-nums">{s.boxes ? `${s.boxes} box` : `${s.bags} bag`}</td>
                  <td className="px-6 py-2 text-slate-500">{s.source}</td>
                </tr>
              ))}
            />
          </Card>

          <Card title="Still in the warehouse (quarantine)">
            <Table
              head={['Batch', 'Format', 'Status', 'Boxes', 'Loose bags']}
              empty="No finished stock from these batches remains on hand."
              rows={dossier.on_hand.map((o) => (
                <tr key={`${o.batch_number}-${o.format}`}>
                  <td className="px-6 py-2 font-mono font-bold">{o.batch_number}</td>
                  <td className="px-6 py-2">{o.format}</td>
                  <td className="px-6 py-2"><StatusPill status={o.status} /></td>
                  <td className="px-6 py-2 tabular-nums">{o.boxes_on_hand}</td>
                  <td className="px-6 py-2 tabular-nums">{o.bags_on_hand}</td>
                </tr>
              ))}
            />
          </Card>
        </>
      )}
    </div>
  );
}
