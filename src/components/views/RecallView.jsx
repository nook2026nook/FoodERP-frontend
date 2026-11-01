import { useEffect, useState } from 'react';
import { Download, Printer, ShieldAlert } from 'lucide-react';
import { recallAPI, errorMessage } from '../../api/client';
import { Card, StatusPill, downloadCsv, fmt, todayIso, useDebounced } from '../ui';
import Icon from '../Icon';
import ExportDropdownMenu, { usePageExport } from '../PageExport';

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

function RecallDossier({ showToast }) {
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

  usePageExport(() => { if (dossier) exportCsv(); else showToast('Run a recall first, then export it', 'error'); });

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

const unitLabel = (u) => (u === 'kg' ? 'kg' : 'units');
const dateOnly = (d) => (d ? String(d).slice(0, 10) : '—');

/** End-to-end table: lot -> batch used -> customer -> invoice, live search over all lots. */
function TraceabilityTable({ showToast }) {
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [allLots, setAllLots] = useState([]);
  const debounced = useDebounced(search.trim(), 250);

  useEffect(() => {
    recallAPI.traceability(debounced)
      .then((r) => { setData(r.data); if (!debounced) setAllLots(r.data.rows.map((x) => x.lot)); })
      .catch((e) => showToast(errorMessage(e, 'Failed to load the traceability table'), 'error'));
  }, [debounced, showToast]);

  const pills = [...new Map(allLots.map((l) => [l.lot_number, l])).values()].slice(0, 6);
  const rows = data?.rows || [];

  const exportCsv = () => {
    const out = [
      ['FSMA MOCK RECALL AUDIT DOSSIER & FULL TRACEABILITY REPORT'],
      ['Search filter', search.trim() || 'All Warehouse Lots'], ['Generated', data.generated_at], [],
      ['Lot Number', 'Item ID', 'Ingredient', 'Supplier', 'Received Date', 'Received', 'Used in Batch', 'Unit', 'Batch Number', 'Formulation',
        'Customer Sold To', 'Invoice Number', 'Invoice Date', 'Qty Shipped', 'In Hand', 'Spec Document']
    ];
    rows.forEach((r) => out.push([
      r.lot.lot_number, r.lot.item_code, r.lot.item_name, r.lot.supplier_name || 'N/A', dateOnly(r.lot.received_at),
      Number(r.lot.total_quantity), r.used, r.lot.unit_type,
      r.batch ? r.batch.batch_number : 'Not Used Yet', r.batch ? r.batch.recipe_name : '',
      r.shipment ? r.shipment.customer_name : (r.batch ? 'In Warehouse (Unshipped)' : ''),
      r.shipment ? r.shipment.invoice_number : '', r.shipment ? dateOnly(r.shipment.shipped_at) : '',
      r.shipment ? (r.shipment.boxes ? `${r.shipment.boxes} box` : `${r.shipment.bags} bag`) : '',
      Number(r.lot.remaining_quantity), r.lot.spec_doc_name || ''
    ]));
    downloadCsv(`FSMA_Recall_Audit_Report_${search.trim() || 'All_Lots'}_${todayIso()}.csv`, out);
    showToast('Recall audit table exported to Excel/CSV successfully!');
  };
  usePageExport(() => data && exportCsv());

  const totals = data?.totals || {};
  const cards = Object.entries(totals);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-4 no-print">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Icon name="ShieldAlert" size={20} className="text-rose-600" />
              FSMA Mock Recall Audit Dossier &amp; Lot Traceability
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Search any Lot # to view total received, quantity used per batch #, customer sold to, invoice # &amp; invoice date, and remaining stock in hand.
            </p>
          </div>
          <ExportDropdownMenu onExportExcel={exportCsv} onPrintPDF={() => window.print()} excelDisabled={!data} />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search Lot # (e.g. HNY-204, OATS-901), Ingredient, or Supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 border-2 border-rose-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-rose-500 bg-rose-50/40"
            />
            <span className="absolute left-3 top-3 text-rose-600"><Icon name="Search" size={15} /></span>
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600" title="Clear Search">
                <Icon name="X" size={15} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">Quick Select Lot:</span>
            {pills.map((l) => (
              <button
                key={l.lot_id}
                type="button"
                onClick={() => setSearch(search === l.lot_number ? '' : l.lot_number)}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold border transition ${
                  search.toLowerCase() === l.lot_number.toLowerCase()
                    ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                #{l.lot_number}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div id="printable-audit-area" className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 font-mono text-xs font-black self-start">
              {search.trim() ? `LOT FILTER: ${search.trim().toUpperCase()}` : `ALL LOTS (${data?.lots_count ?? 0})`}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">Audit Date: {todayIso()}</span>
          </div>

          {cards.map(([unit, t]) => (
            <div key={unit} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">Received ({unitLabel(unit)})</span>
                  <Icon name="Download" size={16} className="text-slate-600" />
                </div>
                <div className="text-2xl font-black font-mono text-slate-900">{fmt(t.received, 2)} {unitLabel(unit)}</div>
                <div className="text-[11px] text-slate-500 mt-1">Across {data.lots_count} inbound lot(s)</div>
              </div>
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
                <div className="flex items-center justify-between text-amber-900 mb-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">Used in Below Batches</span>
                  <Icon name="Cpu" size={16} className="text-amber-600" />
                </div>
                <div className="text-2xl font-black font-mono text-amber-800">{fmt(t.used, 2)} {unitLabel(unit)}</div>
                <div className="text-[11px] text-amber-900/80 mt-1">{data.batches_count} batch(es) consumed these lots</div>
              </div>
              <div className={`p-4 rounded-2xl border ${t.in_hand <= 0.001 ? 'bg-rose-50/70 border-rose-200' : 'bg-emerald-50/70 border-emerald-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] font-extrabold uppercase tracking-wider ${t.in_hand <= 0.001 ? 'text-rose-800' : 'text-emerald-800'}`}>In Hand (Remaining)</span>
                  <Icon name="PackageCheck" size={16} className={t.in_hand <= 0.001 ? 'text-rose-600' : 'text-emerald-600'} />
                </div>
                <div className={`text-2xl font-black font-mono ${t.in_hand <= 0.001 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(t.in_hand, 2)} {unitLabel(unit)}</div>
                <div className={`text-[11px] font-semibold mt-1 ${t.in_hand <= 0.001 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {t.in_hand <= 0.001 ? 'Depleted (nothing in warehouse)' : 'Available in warehouse stock'}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="font-extrabold text-xs uppercase text-slate-800 flex items-center gap-2">
                <Icon name="Table" size={16} className="text-rose-600" />
                End-to-End Lot Recall Traceability Table (Lot # &rarr; Batch Used &rarr; Customer &amp; Invoice)
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Quantity received, used per production batch #, customer sold to, invoice #, invoice date, and quantity in hand.</p>
            </div>
            <span className="text-[11px] font-mono font-bold text-slate-500">{rows.length} Record(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/80 text-slate-600 font-extrabold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5">Lot # &amp; Ingredient</th>
                  <th className="px-4 py-3.5 text-right">Received</th>
                  <th className="px-4 py-3.5 text-right">Used</th>
                  <th className="px-4 py-3.5">Used in Batch #</th>
                  <th className="px-4 py-3.5">Customer Sold To</th>
                  <th className="px-4 py-3.5">Invoice #</th>
                  <th className="px-4 py-3.5">Invoice Date</th>
                  <th className="px-4 py-3.5 text-right">In Hand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => {
                  const u = unitLabel(r.lot.unit_type);
                  const inHand = Number(r.lot.remaining_quantity);
                  return (
                    <tr key={`${r.lot.lot_id}-${r.batch?.batch_number}-${i}`} className="hover:bg-slate-50/90 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-black text-slate-900 text-xs">#{r.lot.lot_number}</div>
                        <div className="font-semibold text-slate-700 text-[11px]">{r.lot.item_name}</div>
                        <div className="text-[10px] text-slate-400">Rec: {dateOnly(r.lot.received_at)} &bull; {r.lot.supplier_name || 'N/A'}</div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-800">{fmt(r.lot.total_quantity, 2)} {u}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-amber-800">{fmt(r.used, 2)} {u}</td>
                      <td className="px-4 py-3.5">
                        {r.batch ? (
                          <div>
                            <span className="inline-block font-mono font-black text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">#{r.batch.batch_number}</span>
                            <div className="text-[11px] font-semibold text-slate-700 mt-0.5">{r.batch.recipe_name}</div>
                            <div className="text-[10px] text-slate-400">Prod Date: {dateOnly(r.batch.production_date)}</div>
                          </div>
                        ) : <span className="text-slate-400 italic text-[11px]">Not used in any batch</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {r.shipment ? (
                          <div>
                            <div className="font-black text-slate-900 text-xs">{r.shipment.customer_name}</div>
                            <div className="text-[10px] text-emerald-700 font-mono font-bold">Qty Sold: {r.shipment.boxes ? `${r.shipment.boxes} box` : `${r.shipment.bags} bag`}</div>
                          </div>
                        ) : r.batch ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">In Finished Goods Warehouse (Not Sold Yet)</span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-bold text-indigo-700">{r.shipment ? r.shipment.invoice_number : <span className="text-slate-400 font-normal">—</span>}</td>
                      <td className="px-4 py-3.5 font-mono font-semibold text-slate-700">{r.shipment ? dateOnly(r.shipment.shipped_at) : <span className="text-slate-400 font-normal">—</span>}</td>
                      <td className="px-4 py-3.5 text-right font-mono">
                        <span className={`px-2.5 py-1 rounded-lg font-black text-xs border ${inHand <= 0.001 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                          {fmt(inHand, 2)} {u}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {data && rows.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-10 text-center text-slate-400 text-xs">
                    {search.trim() ? `No lots found matching "${search.trim()}".` : 'No lots received yet.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RecallView({ showToast }) {
  const [view, setView] = useState('trace');
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-slate-200 gap-2 no-print">
        {[['trace', 'Lot Traceability Table'], ['dossier', 'Run Recall Dossier (by Batch / Lot)']].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition ${view === id ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            {label}
          </button>
        ))}
      </div>
      {view === 'trace' ? <TraceabilityTable showToast={showToast} /> : <RecallDossier showToast={showToast} />}
    </div>
  );
}
