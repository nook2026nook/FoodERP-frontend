import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Search, Trash2 } from 'lucide-react';
import { inventoryAPI, shipmentsAPI, errorMessage } from '../../api/client';
import { Card, Field, downloadCsv, inputClass, todayIso } from '../ui';
import QuickBooksPanel from '../QuickBooksPanel';
import ExportDropdownMenu, { usePageExport } from '../PageExport';

const EDIT_ROLES = ['Administrator', 'Shipping Clerk'];
const emptyLine = () => ({ product: '', unit_type: 'box', quantity: '', batch_id: '' });
const noFilters = { search: '', from: '', to: '', source: '', attention: false };
const needsAttention = (s) => s.lines.some((l) => l.allocation_status !== 'allocated');
const unitLabel = (n, unitType) => (unitType === 'bag' ? (n === 1 ? 'bag' : 'bags') : (n === 1 ? 'box' : 'boxes'));
const lineFlavor = (l) => (l.recipe_name ? `${l.recipe_name}${l.format ? ` ${l.format}` : ''}` : l.product_description) || 'Unmapped product';
const LINE_STATUS = {
  allocated: ['Mapped', 'text-emerald-700 bg-emerald-50'],
  partial: ['Partial', 'text-amber-700 bg-amber-50'],
  unallocated: ['Unmapped', 'text-rose-700 bg-rose-50']
};

export default function ShippingView({ currentUserRole, showToast }) {
  const canEdit = EDIT_ROLES.includes(currentUserRole);
  const isAdmin = currentUserRole === 'Administrator';
  const [busyLine, setBusyLine] = useState(null);
  const [stock, setStock] = useState([]);       // per-batch finished stock
  const [shipments, setShipments] = useState([]);
  const [customer, setCustomer] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [shippedAt, setShippedAt] = useState(todayIso());
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState(noFilters);
  const setFilter = (field, value) => setFilters((f) => ({ ...f, [field]: value }));

  const load = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([inventoryAPI.batches(), shipmentsAPI.getAll()]);
      setStock(b.data.filter((row) => row.shippable));
      setShipments(s.data);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load shipping data'), 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  // Products that have released stock, as "recipeId|format".
  const products = [...new Map(stock.map((s) => [`${s.recipe_id}|${s.format}`, s])).values()];
  const available = (product) => stock
    .filter((s) => `${s.recipe_id}|${s.format}` === product)
    .reduce((acc, s) => ({ boxes: acc.boxes + s.boxes_on_hand, bags: acc.bags + s.bags_on_hand }), { boxes: 0, bags: 0 });

  const updateLine = (idx, field, value) => setLines((ls) => ls.map((l, i) => {
    if (i !== idx) return l;
    return field === 'product' ? { ...l, product: value, batch_id: '' } : { ...l, [field]: value };
  }));

  const submit = async (e) => {
    e.preventDefault();
    const filled = lines.filter((l) => l.product || l.quantity);
    if (!filled.length || filled.some((l) => !l.product || !(parseInt(l.quantity, 10) > 0))) {
      showToast('Each line needs a product and a quantity above 0', 'error');
      return;
    }
    setSaving(true);
    try {
      await shipmentsAPI.create({
        customer_name: customer.trim(),
        invoice_number: invoiceNumber.trim(),
        shipped_at: shippedAt,
        lines: filled.map((l) => {
          const [recipeId, format] = l.product.split('|');
          return {
            recipe_id: recipeId, format, unit_type: l.unit_type,
            quantity: parseInt(l.quantity, 10), batch_id: l.batch_id || null
          };
        })
      });
      showToast('Shipment logged');
      setCustomer(''); setInvoiceNumber(''); setLines([emptyLine()]);
      await load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to record shipment'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Dispatch list filters (date range, source, search), applied in the browser.
  const visible = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return shipments.filter((s) => {
      if (filters.from && s.shipped_at < filters.from) return false;
      if (filters.to && s.shipped_at > filters.to) return false;
      if (filters.source && s.source !== filters.source) return false;
      if (filters.attention && !needsAttention(s)) return false;
      if (!term) return true;
      return [s.customer_name, s.invoice_number, s.shipped_at, s.source,
        ...s.lines.map((l) => l.product_description),
        ...s.lines.flatMap((l) => l.allocations.map((a) => a.batch_number))]
        .some((v) => String(v || '').toLowerCase().includes(term));
    });
  }, [shipments, filters]);
  const filtered = JSON.stringify(filters) !== JSON.stringify(noFilters);
  const qboCount = shipments.filter((s) => s.source === 'QuickBooks API').length;
  const attentionCount = shipments.filter(needsAttention).length;

  const totalLines = visible.reduce((n, s) => n + s.lines.length, 0);
  const mappedLines = visible.reduce((n, s) => n + s.lines.filter((l) => l.allocation_status === 'allocated').length, 0);

  const exportCsv = () => {
    downloadCsv(`dispatches_${filters.from || 'all'}_to_${filters.to || todayIso()}.csv`, [
      ['Invoice', 'Customer', 'Date', 'QuickBooks Item', 'Flavor (Product)', 'Quantity', 'Unit', 'Mapped Batch #', 'Mapping Status', 'Source'],
      ...visible.flatMap((s) => s.lines.map((l) => [
        s.invoice_number, s.customer_name, String(s.shipped_at).slice(0, 10), l.product_description, lineFlavor(l),
        l.quantity, l.unit_type || '',
        l.allocations.map((a) => `${a.batch_number} (${a.boxes ? `${a.boxes} box` : `${a.bags} bag`})`).join('; '),
        LINE_STATUS[l.allocation_status]?.[0] || l.allocation_status, s.source
      ]))
    ]);
  };

  // Batch options per line: released batch stock as "batchId|format".
  const batchChoices = (l) => {
    const options = stock.map((b) => ({
      value: `${b.batch_id}|${b.format}`,
      label: `${b.batch_number} — ${b.recipe_name} ${b.format} (${b.boxes_on_hand} box · ${b.bags_on_hand} bag)`,
      match: l.recipe_id ? b.recipe_id === l.recipe_id && (!l.format || b.format === l.format) : false
    }));
    // Keep batches the line already uses visible even when they have no stock left.
    for (const a of l.allocations) {
      const value = `${a.batch_id}|${l.format}`;
      if (!options.some((o) => o.value === value)) {
        options.unshift({ value, label: `${a.batch_number} — ${lineFlavor(l)} (allocated)`, match: true });
      }
    }
    // A line whose flavor is known only lists that flavor and size; the server refuses others.
    if (l.recipe_id) return { matching: options.filter((o) => o.match), other: [] };
    return { matching: [], other: options };
  };
  const currentChoice = (l) => {
    const ids = [...new Set(l.allocations.map((a) => a.batch_id))];
    if (ids.length === 1) return `${ids[0]}|${l.format}`;
    return ids.length > 1 ? 'multiple' : '';
  };

  const mapBatch = async (l, value) => {
    if (!value || value === 'multiple') return;
    const [batchId, format] = value.split('|');
    setBusyLine(l.id);
    try {
      const { data } = await shipmentsAPI.mapLineBatch(l.id, { batch_id: batchId, format });
      let msg = `Mapped ${data.recipe_name} ${format} to Batch #${data.batch_number}`;
      if (data.shortfall > 0) msg += ` — ${data.shortfall} ${unitLabel(data.shortfall, l.unit_type)} still need a batch`;
      if (data.remembered) msg += `. QuickBooks item remembered${data.applied?.allocated ? `; ${data.applied.allocated} other line(s) mapped` : ''}`;
      showToast(msg, data.shortfall > 0 ? 'error' : undefined);
      await load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to map batch'), 'error');
    } finally {
      setBusyLine(null);
    }
  };

  const unmapLine = async (l) => {
    setBusyLine(l.id);
    try {
      await shipmentsAPI.releaseLine(l.id);
      showToast('Batch mapping removed; stock returned to the batch');
      await load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to remove mapping'), 'error');
    } finally {
      setBusyLine(null);
    }
  };

  // Oldest-batch-first for every open line of an invoice that already has a product.
  const autoMap = async (s) => {
    const open = s.lines.filter((l) => l.allocation_status !== 'allocated' && l.recipe_id);
    if (!open.length) { showToast('Choose a batch for each line first; these items have no product mapping yet', 'error'); return; }
    let failed = 0;
    for (const l of open) {
      try {
        const { data } = await shipmentsAPI.allocateLine(l.id);
        if (data.status !== 'allocated') failed++;
      } catch { failed++; }
    }
    showToast(failed ? `${open.length - failed} line(s) mapped, ${failed} without released stock` : `${open.length} line(s) mapped oldest batch first`, failed ? 'error' : undefined);
    await load();
  };

  usePageExport(exportCsv);

  const remove = async (s) => {
    if (!window.confirm(`Delete shipment ${s.invoice_number} to ${s.customer_name}? Its stock goes back to the batches.`)) return;
    try {
      await shipmentsAPI.delete(s.id);
      showToast('Shipment deleted');
      await load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to delete shipment'), 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <QuickBooksPanel currentUserRole={currentUserRole} showToast={showToast} onSynced={load} />

      {canEdit && (
        <Card title="Log Customer Shipment">
          {products.length === 0 ? (
            <p className="text-xs text-slate-500">No released stock to ship. Batches appear here once QA releases them.</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Customer *" htmlFor="sh-customer">
                  <input id="sh-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} className={inputClass} maxLength={255} required />
                </Field>
                <Field label="Invoice # *" htmlFor="sh-invoice">
                  <input id="sh-invoice" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputClass} maxLength={100} required />
                </Field>
                <Field label="Ship Date" htmlFor="sh-date">
                  <input id="sh-date" type="date" value={shippedAt} onChange={(e) => setShippedAt(e.target.value)} className={inputClass} />
                </Field>
              </div>

              <div className="space-y-2">
                {lines.map((l, idx) => {
                  const avail = l.product ? available(l.product) : null;
                  const batchOptions = stock.filter((s) => `${s.recipe_id}|${s.format}` === l.product);
                  return (
                    <div key={idx} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center">
                      <select aria-label="Product" value={l.product} onChange={(e) => updateLine(idx, 'product', e.target.value)} className={`${inputClass} col-span-2 sm:col-span-4`}>
                        <option value="">Select product…</option>
                        {products.map((p) => <option key={`${p.recipe_id}|${p.format}`} value={`${p.recipe_id}|${p.format}`}>{p.recipe_name} — {p.format}</option>)}
                      </select>
                      <select aria-label="Unit" value={l.unit_type} onChange={(e) => updateLine(idx, 'unit_type', e.target.value)} className={`${inputClass} sm:col-span-2`}>
                        <option value="box">Boxes (12 bags)</option>
                        <option value="bag">Bags</option>
                      </select>
                      <input aria-label="Quantity" type="number" min="1" step="1" placeholder="Qty" value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} className={`${inputClass} sm:col-span-1`} />
                      <select aria-label="Batch" value={l.batch_id} onChange={(e) => updateLine(idx, 'batch_id', e.target.value)} className={`${inputClass} font-mono col-span-2 sm:col-span-3`} disabled={!l.product}>
                        <option value="">Auto: oldest batch first</option>
                        {batchOptions.map((b) => <option key={b.batch_id} value={b.batch_id}>{b.batch_number} ({b.boxes_on_hand} box · {b.bags_on_hand} bag)</option>)}
                      </select>
                      <div className="col-span-2 sm:col-span-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span>{avail ? `${avail.boxes} box · ${avail.bags} bag in stock` : ''}</span>
                        {lines.length > 1 && (
                          <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-red-500" aria-label="Remove line"><Trash2 size={15} /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">Bags come from loose bags first; if a batch runs out, a box is opened automatically.</p>
              <button type="button" onClick={() => setLines([...lines, emptyLine()])} className="text-xs font-bold text-emerald-700">+ Add Line</button>
              <button type="submit" disabled={saving} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold disabled:opacity-60">Record Dispatch</button>
            </form>
          )}
        </Card>
      )}

      <Card
        id="printable-audit-area"
        title={filtered ? `Dispatches & QuickBooks Invoices (${visible.length} of ${shipments.length})` : `Dispatches & QuickBooks Invoices (${shipments.length})`}
        actions={(
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">{qboCount} from QuickBooks</span>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">{shipments.length - qboCount} manual</span>
            {attentionCount > 0 && <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700">{attentionCount} need attention</span>}
            <ExportDropdownMenu onExportExcel={exportCsv} onPrintPDF={() => window.print()} excelDisabled={!visible.length} />
          </div>
        )}
      >
        <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
          <Field label="Search" htmlFor="df-search" className="col-span-2 sm:col-span-4">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input id="df-search" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="Customer, invoice #, product, batch…" className={`${inputClass} pl-8`} />
            </div>
          </Field>
          <Field label="From" htmlFor="df-from" className="sm:col-span-2">
            <input id="df-from" type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className={inputClass} />
          </Field>
          <Field label="To" htmlFor="df-to" className="sm:col-span-2">
            <input id="df-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter('to', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Source" htmlFor="df-source" className="sm:col-span-2">
            <select id="df-source" value={filters.source} onChange={(e) => setFilter('source', e.target.value)} className={inputClass}>
              <option value="">All</option>
              <option value="QuickBooks API">QuickBooks</option>
              <option value="Manual">Manual</option>
            </select>
          </Field>
          <div className="col-span-2 sm:col-span-2 flex items-center gap-2 pb-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={filters.attention} onChange={(e) => setFilter('attention', e.target.checked)} className="w-3.5 h-3.5 rounded" />
              Needs attention
            </label>
            {filtered && (
              <button type="button" onClick={() => setFilters(noFilters)} className="ml-auto text-xs font-bold text-emerald-700">Reset</button>
            )}
          </div>
        </div>
        <div className="-mx-6 px-6 py-3 border-y border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h4 className="font-bold text-xs uppercase text-slate-800">
              QuickBooks Invoices &amp; Product Flavor Lines ({visible.length} {visible.length === 1 ? 'Invoice' : 'Invoices'} &bull; {totalLines} Total Lines)
            </h4>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Source:</span>
              <Database size={13} className="text-emerald-600" aria-hidden="true" />
              <span className="font-extrabold text-slate-800">Nature&apos;s Mix (QuickBooks Online)</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold">
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">{mappedLines} Lines Mapped</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{totalLines - mappedLines} Need Batch # in View</span>
          </div>
        </div>
        <div className="overflow-x-auto -mx-6 -mt-4">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold tracking-wider border-b text-[10px]">
              <tr>
                <th className="p-3.5 w-10 text-center">#</th>
                <th className="p-3.5">Invoice # / Line Items</th>
                <th className="p-3.5">Customer / Flavor (Product)</th>
                <th className="p-3.5">Date</th>
                <th className="p-3.5 text-right">Quantity</th>
                <th className="p-3.5">Mapped Batch #</th>
                <th className="p-3.5 text-center">QB Status</th>
                {canEdit && <th className="p-3.5 text-center no-print">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visible.map((s, invIdx) => {
                const units = [...new Set(s.lines.map((l) => l.unit_type || 'box'))];
                const totalQty = s.lines.reduce((n, l) => n + Number(l.quantity || 0), 0);
                const fromQbo = s.source === 'QuickBooks API';
                const open = needsAttention(s);
                const single = s.lines.length === 1 ? s.lines[0] : null;
                return (
                  <Fragment key={s.id}>
                    {/* Invoice row */}
                    <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold">
                      <td className="p-3 text-slate-400 font-mono text-[11px] text-center">{invIdx + 1}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-xs font-mono tracking-wide">{s.invoice_number}</span>
                        <span className="ml-2 text-[10px] text-slate-500 font-semibold">({s.lines.length} {s.lines.length === 1 ? 'flavor' : 'flavors'})</span>
                      </td>
                      <td className="p-3 font-black text-slate-800">{s.customer_name}</td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">{String(s.shipped_at).slice(0, 10)}</td>
                      <td className="p-3 text-right font-mono font-black text-slate-900 text-sm whitespace-nowrap">
                        {totalQty} <span className="text-[10px] text-slate-400 font-normal">{units.length === 1 ? unitLabel(totalQty, units[0]) : 'units'}</span>
                      </td>
                      <td className="p-3 text-[11px] text-slate-500 italic">
                        {single
                          ? (single.allocations.length ? `Batch #${single.allocations.map((a) => a.batch_number).join(', ')}` : 'Batch # not mapped')
                          : 'See flavors below'}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {fromQbo ? (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">✓ QB Synced</span>
                        ) : (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Manual</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="p-3 text-center whitespace-nowrap no-print">
                          {s.source === 'Manual' ? (
                            <button onClick={() => remove(s)} className="text-slate-400 hover:text-red-600" aria-label={`Delete shipment ${s.invoice_number}`}><Trash2 size={15} /></button>
                          ) : open && isAdmin ? (
                            <button type="button" onClick={() => autoMap(s)} title="Map open lines to the oldest released batch of their product"
                              className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white">
                              Auto-map Batches
                            </button>
                          ) : null}
                        </td>
                      )}
                    </tr>

                    {/* Flavor lines under the invoice */}
                    {s.lines.map((l, lineIdx) => {
                      const { matching, other } = batchChoices(l);
                      const value = currentChoice(l);
                      const [statusLabel, statusClass] = LINE_STATUS[l.allocation_status] || [l.allocation_status, 'text-slate-600 bg-slate-50'];
                      return (
                        <tr key={l.id} className="bg-white hover:bg-emerald-50/50 border-l-4 border-l-emerald-500 align-top">
                          <td className="p-2.5 text-slate-300 text-center font-mono text-[10px]">↳</td>
                          <td className="p-2.5 pl-6 font-mono text-[11px] text-slate-500">
                            <span className="text-slate-400">Line #{lineIdx + 1}</span>
                            {l.qbo_line_id && <span>: QB-{l.qbo_line_id}</span>}
                          </td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${l.allocation_status === 'allocated' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                              <span className="font-extrabold text-slate-800">{lineFlavor(l)}</span>
                            </div>
                            {l.recipe_name && l.product_description && (
                              <div className="pl-3.5 text-[10px] text-slate-400">QB item: {l.product_description}</div>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-400 text-[11px] whitespace-nowrap">{String(s.shipped_at).slice(0, 10)}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            {l.quantity} <span className="text-[10px] text-slate-400 font-normal">{unitLabel(Number(l.quantity), l.unit_type || 'box')}</span>
                          </td>
                          <td className="p-2.5">
                            {canEdit ? (
                              <select
                                aria-label={`Batch for ${lineFlavor(l)} on invoice ${s.invoice_number}`}
                                value={value}
                                disabled={busyLine === l.id}
                                onChange={(e) => mapBatch(l, e.target.value)}
                                className="w-full min-w-[220px] px-2.5 py-1 border border-slate-300 rounded-lg text-[11px] font-mono bg-white focus:outline-none focus:border-emerald-500 font-semibold text-slate-700 disabled:opacity-60"
                              >
                                <option value="">Map Batch #...</option>
                                {value === 'multiple' && <option value="multiple" disabled>Multiple batches</option>}
                                {l.recipe_id && matching.length === 0 && (
                                  <option value="" disabled>No released {lineFlavor(l)} stock</option>
                                )}
                                {matching.length > 0 && (
                                  <optgroup label={`${lineFlavor(l)} batches`}>
                                    {matching.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </optgroup>
                                )}
                                {other.length > 0 && (
                                  <optgroup label="Released batches">
                                    {other.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </optgroup>
                                )}
                              </select>
                            ) : null}
                            {l.allocations.length > 0 && (
                              <div className="mt-1 font-mono text-[10px] text-slate-500">
                                {l.allocations.map((a) => `${a.batch_number}: ${a.boxes ? `${a.boxes} box` : `${a.bags} bag`}`).join(' · ')}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 text-center whitespace-nowrap">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusClass}`}>{statusLabel}</span>
                          </td>
                          {canEdit && (
                            <td className="p-2.5 text-center whitespace-nowrap no-print">
                              {isAdmin && l.allocations.length > 0 && (
                                <button type="button" onClick={() => unmapLine(l)} disabled={busyLine === l.id}
                                  className="text-[10px] text-slate-400 hover:text-rose-600 font-medium underline">
                                  unmap
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={canEdit ? 8 : 7} className="text-center py-8 text-slate-400">
                  {shipments.length === 0 ? 'No dispatches recorded yet.' : 'No dispatches match these filters.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
