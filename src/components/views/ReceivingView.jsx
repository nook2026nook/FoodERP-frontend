import { useCallback, useEffect, useMemo, useState } from 'react';
import { itemsAPI, lotsAPI, suppliersAPI, errorMessage } from '../../api/client';
import Icon from '../Icon';
import ExportDropdownMenu, { downloadCSV, todayStamp, usePageExport } from '../PageExport';
import { Field, inputClass, qty, todayIso } from '../ui';

const EDIT_ROLES = ['Administrator', 'Production Operator'];
const emptyRow = () => ({ item_id: '', packs_received: '', lot_number: '', expiry_date: '', spec_doc_name: '', spec_doc_size: '' });
const EPS = 0.0001;
const lower = (v) => String(v ?? '').toLowerCase();
const unitCostOf = (l) => (Number(l.unit_pack_size) > 0 ? Number(l.cost_per_pack) / Number(l.unit_pack_size) : 0);

export default function ReceivingView({ currentUserRole, showToast, onGoToIngredients }) {
  const canEdit = EDIT_ROLES.includes(currentUserRole);
  const isAdmin = currentUserRole === 'Administrator';
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [lots, setLots] = useState([]);

  const [supplierId, setSupplierId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [dockTemp, setDockTemp] = useState('');
  const [receivedAt, setReceivedAt] = useState(todayIso());
  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      itemsAPI.getAll(),
      suppliersAPI.getAll(),
      lotsAPI.getAll(false)
    ]);
    const [itemsResult, suppliersResult, lotsResult] = results;
    if (itemsResult.status === 'fulfilled') setItems(itemsResult.value.data);
    if (suppliersResult.status === 'fulfilled') setSuppliers(suppliersResult.value.data);
    if (lotsResult.status === 'fulfilled') setLots(lotsResult.value.data);

    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      showToast(
        failures.map((result) => errorMessage(result.reason, 'Failed to load receiving data')).join('; '),
        'error'
      );
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const updateRow = (idx, patch) =>
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const submit = async (e) => {
    e.preventDefault();
    if (!supplierId) { showToast('Select the supplier', 'error'); return; }
    const filled = rows.filter((r) => r.item_id || r.packs_received || r.lot_number);
    if (!filled.length) { showToast('Complete at least one line item', 'error'); return; }
    if (filled.some((r) => !r.item_id || !(parseFloat(r.packs_received) > 0) || !r.lot_number.trim())) {
      showToast('Each line needs an item, packs above 0 and a lot number', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await lotsAPI.receive({
        supplier_id: supplierId,
        po_number: poNumber.trim() || null,
        dock_temp: dockTemp.trim() || null,
        received_at: receivedAt,
        items: filled.map((r) => ({
          item_id: r.item_id,
          packs_received: parseFloat(r.packs_received),
          lot_number: r.lot_number.trim(),
          expiry_date: r.expiry_date || null,
          spec_doc_name: r.spec_doc_name || null,
          spec_doc_size: r.spec_doc_size || null
        }))
      });
      showToast(res.data.message || 'Inbound receiving confirmed');
      setRows([emptyRow()]);
      setPoNumber('');
      await load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to receive lots'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeLot = async (lot) => {
    if (!window.confirm(`Delete lot ${lot.lot_number}? Only lots never used in production can be deleted.`)) return;
    try {
      await lotsAPI.delete(lot.id);
      showToast(`Lot ${lot.lot_number} deleted`);
      await load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to delete lot'), 'error');
    }
  };

  // Lowest remaining first (so stock that needs reordering surfaces), depleted lots last.
  const sortedLots = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const list = lots.filter((l) => {
      if (filterCategory !== 'all' && l.category !== filterCategory) return false;
      if (!term) return true;
      return (
        lower(l.lot_number).includes(term) ||
        lower(l.item_name).includes(term) ||
        lower(l.supplier_name).includes(term) ||
        lower(l.category).includes(term) ||
        lower(l.received_at).includes(term) ||
        lower(l.expiry_date).includes(term) ||
        lower(l.po_number).includes(term) ||
        String(l.remaining_quantity).includes(term)
      );
    });
    const date = (l) => String(l.received_at || '').slice(0, 10);
    return list.sort((a, b) => {
      const aw = Number(a.remaining_quantity) || 0;
      const bw = Number(b.remaining_quantity) || 0;
      const aZero = aw <= EPS;
      const bZero = bw <= EPS;
      if (!aZero && bZero) return -1;
      if (aZero && !bZero) return 1;
      if (!aZero && !bZero) {
        if (Math.abs(aw - bw) > EPS) return aw - bw;
        return date(a).localeCompare(date(b));
      }
      return date(b).localeCompare(date(a));
    });
  }, [lots, searchTerm, filterCategory]);

  const activeLotsCount = lots.filter((l) => (Number(l.remaining_quantity) || 0) > EPS).length;
  const zeroLotsCount = lots.length - activeLotsCount;

  const effectivePageSize = pageSize === 'all' ? (sortedLots.length || 1) : parseInt(pageSize, 10);
  const totalPages = Math.max(1, Math.ceil(sortedLots.length / effectivePageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLots = pageSize === 'all'
    ? sortedLots
    : sortedLots.slice((safePage - 1) * effectivePageSize, safePage * effectivePageSize);

  const exportCSV = () => {
    const rows = [[
      'Lot Number', 'Item ID', 'Ingredient Name', 'Category', 'Supplier', 'Date Received', 'Expiry Date',
      'Initial Qty', 'Remaining Qty', 'Unit', 'Unit Cost ($)', 'Remaining Lot Value ($)', 'PO / Slip #', 'Dock Temp (C)', 'Spec Document', 'Status'
    ]];
    sortedLots.forEach((l) => {
      const rem = Number(l.remaining_quantity) || 0;
      const unitCost = unitCostOf(l);
      const lowLimit = 10;
      rows.push([
        l.lot_number, l.item_code || '', l.item_name, l.category, l.supplier_name || '',
        String(l.received_at || '').slice(0, 10), String(l.expiry_date || '').slice(0, 10),
        (Number(l.total_quantity) || 0).toFixed(2), rem.toFixed(2), l.unit_type, unitCost.toFixed(4), (rem * unitCost).toFixed(2),
        l.po_number || '', l.dock_temp || '', l.spec_doc_name || '',
        rem <= EPS ? 'Depleted' : (rem < lowLimit ? 'Low Stock' : 'In Stock')
      ]);
    });
    downloadCSV(`Receive_Ingredients_Lots_Report_${todayStamp()}.csv`, rows);
    showToast('Warehouse Lots & Pricing exported to Excel/CSV!');
  };
  usePageExport(exportCSV);

  return (
    <div className="space-y-6 max-w-6xl">
      {canEdit && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 no-print">
          <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
            <Icon name="Download" size={18} className="text-emerald-600" />
            Receive Ingredients (Dock Inbound)
          </h3>
          {items.length === 0 ? (
            <p className="text-xs text-slate-500">
              No items in the catalog yet.{' '}
              <button type="button" onClick={onGoToIngredients} className="font-bold text-emerald-700 underline">
                Add ingredients first
              </button>
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Field label="Supplier *" htmlFor="rcv-supplier">
                  <select id="rcv-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
                    <option value="">Select Supplier...</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="Date Received *" htmlFor="rcv-date">
                  <input id="rcv-date" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className={`${inputClass} font-semibold`} required />
                </Field>
                <Field label="PO / Slip #" htmlFor="rcv-po">
                  <input id="rcv-po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className={inputClass} maxLength={100} placeholder="PO / Slip #" />
                </Field>
                <Field label="Dock Temp (°C)" htmlFor="rcv-temp">
                  <input id="rcv-temp" type="number" step="0.1" value={dockTemp} onChange={(e) => setDockTemp(e.target.value)} className={inputClass} placeholder="Dock Temp °C" />
                </Field>
              </div>

              <div className="space-y-2 pt-2">
                <label className="block text-[11px] font-bold text-slate-600 uppercase">Line Items to Inbound</label>
                {rows.map((row, idx) => {
                  const item = itemById[row.item_id];
                  const total = item && parseFloat(row.packs_received) > 0
                    ? parseFloat(row.packs_received) * Number(item.unit_pack_size) : null;
                  return (
                    <div key={idx} className="flex flex-wrap sm:flex-nowrap gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <select aria-label="Item" value={row.item_id} onChange={(e) => updateRow(idx, { item_id: e.target.value })} className="flex-1 min-w-[200px] p-2 border border-slate-200 rounded-lg text-xs bg-white">
                        <option value="">Select Item from Catalog...</option>
                        {['Baking', 'Packaging'].map((cat) => (
                          <optgroup key={cat} label={cat}>
                            {items.filter((i) => i.category === cat).map((i) => (
                              <option key={i.id} value={i.id}>{i.name} ({cat} - {Number(i.unit_pack_size)} {i.unit_type}/pack)</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <input aria-label="Packs" type="number" step="any" min="0" placeholder="Packs" value={row.packs_received} onChange={(e) => updateRow(idx, { packs_received: e.target.value })} className="w-24 p-2 border border-slate-200 rounded-lg text-xs font-bold" />
                      <input aria-label="Lot number" placeholder="Lot #" value={row.lot_number} onChange={(e) => updateRow(idx, { lot_number: e.target.value })} className="w-32 p-2 border border-slate-200 rounded-lg text-xs font-mono font-bold" maxLength={100} />
                      <input aria-label="Expiry date" type="date" title="Expiry Date" value={row.expiry_date} onChange={(e) => updateRow(idx, { expiry_date: e.target.value })} className="w-36 p-2 border border-slate-200 rounded-lg text-xs" />
                      <div className="flex items-center gap-1.5">
                        <label className="cursor-pointer px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm">
                          <Icon name="Paperclip" size={13} />
                          <span className="truncate max-w-[100px]">{row.spec_doc_name || 'Attach Spec Doc'}</span>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.jpg,.png,.txt"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files[0];
                              if (f) updateRow(idx, { spec_doc_name: f.name.slice(0, 255), spec_doc_size: `${(f.size / 1024).toFixed(1)} KB` });
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {row.spec_doc_name && (
                          <button type="button" onClick={() => updateRow(idx, { spec_doc_name: '', spec_doc_size: '' })} className="text-rose-500 hover:text-rose-700 p-1" title="Remove attached doc">
                            <Icon name="X" size={14} />
                          </button>
                        )}
                      </div>
                      {total !== null && <span className="text-[11px] text-slate-500 whitespace-nowrap">= {qty(total, item.unit_type)}</span>}
                      {rows.length > 1 && (
                        <button type="button" onClick={() => setRows(rows.filter((_, i) => i !== idx))} className="p-2 text-rose-500 hover:text-rose-700" aria-label="Remove line">
                          <Icon name="Trash2" size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button type="button" onClick={() => setRows([...rows, emptyRow()])} className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
                  <Icon name="Plus" size={14} />
                  <span>Add Another Line Item</span>
                </button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-60">
                  {saving ? 'Saving…' : 'Confirm Inbound Intake'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <div id="printable-audit-area" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h4 className="font-extrabold text-sm uppercase text-slate-800 flex items-center gap-2">
              <Icon name="Archive" size={18} className="text-emerald-600" />
              Warehouse Lots Inventory &amp; Pricing ({sortedLots.length} of {lots.length})
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Showing <b>lower remaining weight first</b> with date received &bull; depleted lots placed at bottom / last page.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg font-bold border border-emerald-200">
              {activeLotsCount} In Stock
            </span>
            <span className="text-[11px] bg-slate-100 text-slate-600 px-3 py-1 rounded-lg font-bold border border-slate-200">
              {zeroLotsCount} Depleted
            </span>
            <ExportDropdownMenu onExportExcel={exportCSV} onPrintPDF={() => window.print()} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs no-print">
          <div className="sm:col-span-6 relative">
            <input
              type="text"
              placeholder="Search lot #, ingredient, supplier, date received, or weight..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-8 pr-3 py-2 border-2 border-emerald-200 rounded-xl bg-emerald-50/20 focus:bg-white focus:outline-none transition font-semibold"
            />
            <span className="absolute left-2.5 top-2.5 text-emerald-600">
              <Icon name="Search" size={14} />
            </span>
          </div>
          <div className="sm:col-span-3">
            <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }} className="w-full py-2 px-3 border border-slate-200 rounded-xl bg-white font-semibold">
              <option value="all">All Categories</option>
              <option value="Baking">🌾 Baking Only</option>
              <option value="Packaging">📦 Packaging Only</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <select value={pageSize} onChange={(e) => { setPageSize(e.target.value); setCurrentPage(1); }} className="w-full py-2 px-3 border border-slate-200 rounded-xl bg-white font-semibold">
              <option value="10">Show 10 per page</option>
              <option value="25">Show 25 per page</option>
              <option value="50">Show 50 per page</option>
              <option value="all">Show All on 1 page</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white text-xs">
          {paginatedLots.map((l) => {
            const remaining = Number(l.remaining_quantity) || 0;
            const isZero = remaining <= EPS;
            const unitCost = unitCostOf(l);
            const lotValue = remaining * unitCost;
            const unit = l.unit_type === 'kg' ? 'kg' : 'units';
            return (
              <div
                key={l.id}
                className={`p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition ${
                  isZero ? 'bg-slate-50/70 hover:bg-slate-100/60 opacity-70' : 'hover:bg-slate-50'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-black text-slate-800 text-sm">#{l.lot_number}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${l.category === 'Packaging' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                      {l.category === 'Packaging' ? '📦 Packaging' : '🌾 Baking'}
                    </span>
                    {isZero && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Depleted</span>}
                    {!isZero && remaining < 10 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Low Remaining Weight</span>
                    )}
                  </div>

                  <div className="text-slate-700 font-semibold text-xs">
                    {l.item_name}
                    {l.supplier_name && <span className="text-slate-400 font-normal ml-2">&bull; {l.supplier_name}</span>}
                  </div>

                  <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
                    <span className="font-medium flex items-center gap-1 text-slate-600">
                      <Icon name="Calendar" size={13} className="text-slate-400" />
                      <b>Date Received:</b> {String(l.received_at || '').slice(0, 10) || 'N/A'}
                    </span>
                    {l.expiry_date && <span className="text-slate-400">Exp: {String(l.expiry_date).slice(0, 10)}</span>}
                    {(l.po_number || l.dock_temp) && (
                      <span className="text-slate-400">{[l.po_number, l.dock_temp && `${l.dock_temp} °C`].filter(Boolean).join(' · ')}</span>
                    )}
                    <span className="font-mono text-slate-600">
                      Unit Cost: <b>${unitCost.toFixed(2)}/{l.unit_type === 'kg' ? 'kg' : 'unit'}</b> &bull; Lot Value: <b>${lotValue.toFixed(2)}</b>
                    </span>
                    {l.spec_doc_name ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]" title={`Specification Document: ${l.spec_doc_name} (${l.spec_doc_size || ''})`}>
                        <Icon name="FileText" size={12} className="text-blue-600" />
                        <span className="truncate max-w-[140px]">{l.spec_doc_name}</span>
                        {l.spec_doc_size && <span className="text-slate-400 font-normal">({l.spec_doc_size})</span>}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">No Spec Doc Attached</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right">
                    <div className={`text-sm font-black font-mono ${isZero ? 'text-slate-400 line-through' : 'text-emerald-700'}`}>
                      {remaining.toFixed(1)} {unit}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">
                      {isZero ? `0.0 ${unit} (At Bottom / Last Page)` : `of ${qty(l.total_quantity, l.unit_type)}`}
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => removeLot(l)}
                      className="no-print p-1.5 text-slate-300 hover:text-rose-600 rounded-lg transition"
                      title="Delete Lot"
                      aria-label={`Delete lot ${l.lot_number}`}
                    >
                      <Icon name="Trash2" size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {sortedLots.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-xs">
              {lots.length === 0 ? 'No lots received yet.' : 'No warehouse lots found matching search criteria.'}
            </div>
          )}
        </div>

        {pageSize !== 'all' && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs no-print">
            <div className="text-slate-500 text-[11px]">
              Showing page <b>{safePage}</b> of <b>{totalPages}</b> ({sortedLots.length} total lots)
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setCurrentPage(1)} disabled={safePage === 1} className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-700" title="First Page (Lowest Weight Lots)">
                &laquo; First
              </button>
              <button onClick={() => setCurrentPage(Math.max(1, safePage - 1))} disabled={safePage === 1} className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-700">
                Prev
              </button>
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-bold">Page {safePage}</span>
              <button onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages} className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-700">
                Next
              </button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages} className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-700" title="Last Page (depleted lots at bottom)">
                Last &raquo;
              </button>
              {zeroLotsCount > 0 && safePage !== totalPages && (
                <button onClick={() => setCurrentPage(totalPages)} className="ml-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition flex items-center gap-1">
                  <span>Go to Depleted Lots (Page {totalPages}) &rarr;</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
