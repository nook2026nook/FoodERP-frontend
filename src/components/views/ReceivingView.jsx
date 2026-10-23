import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { itemsAPI, lotsAPI, suppliersAPI, errorMessage } from '../../api/client';
import { Card, Field, inputClass, qty, todayIso } from '../ui';

const EDIT_ROLES = ['Administrator', 'Production Operator'];
const emptyRow = () => ({ item_id: '', packs_received: '', lot_number: '', expiry_date: '' });

export default function ReceivingView({ currentUserRole, showToast, onGoToIngredients }) {
  const canEdit = EDIT_ROLES.includes(currentUserRole);
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [lots, setLots] = useState([]);
  const [showEmpty, setShowEmpty] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [dockTemp, setDockTemp] = useState('');
  const [receivedAt, setReceivedAt] = useState(todayIso());
  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [i, s, l] = await Promise.all([itemsAPI.getAll(), suppliersAPI.getAll(), lotsAPI.getAll(false)]);
      setItems(i.data);
      setSuppliers(s.data);
      setLots(l.data);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load receiving data'), 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const updateRow = (idx, field, value) =>
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));

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
          expiry_date: r.expiry_date || null
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

  const visibleLots = showEmpty ? lots : lots.filter((l) => Number(l.remaining_quantity) > 0);

  return (
    <div className="space-y-6 max-w-6xl">
      {canEdit && (
        <Card title="Receive Ingredients (Dock Inbound)">
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
                    <option value="">Select supplier…</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="PO / Slip #" htmlFor="rcv-po">
                  <input id="rcv-po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className={inputClass} maxLength={100} />
                </Field>
                <Field label="Dock Temp °C" htmlFor="rcv-temp">
                  <input id="rcv-temp" type="number" step="0.1" value={dockTemp} onChange={(e) => setDockTemp(e.target.value)} className={inputClass} />
                </Field>
                <Field label="Received On" htmlFor="rcv-date">
                  <input id="rcv-date" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className={inputClass} />
                </Field>
              </div>

              <div className="space-y-2">
                {rows.map((row, idx) => {
                  const item = itemById[row.item_id];
                  const total = item && parseFloat(row.packs_received) > 0
                    ? parseFloat(row.packs_received) * Number(item.unit_pack_size) : null;
                  return (
                    <div key={idx} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center">
                      <select aria-label="Item" value={row.item_id} onChange={(e) => updateRow(idx, 'item_id', e.target.value)} className={`${inputClass} col-span-2 sm:col-span-4`}>
                        <option value="">Select item…</option>
                        {['Baking', 'Packaging'].map((cat) => (
                          <optgroup key={cat} label={cat}>
                            {items.filter((i) => i.category === cat).map((i) => (
                              <option key={i.id} value={i.id}>{i.name} ({Number(i.unit_pack_size)} {i.unit_type}/pack)</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <input aria-label="Packs" type="number" step="any" min="0" placeholder="Packs" value={row.packs_received} onChange={(e) => updateRow(idx, 'packs_received', e.target.value)} className={`${inputClass} sm:col-span-2`} />
                      <input aria-label="Lot number" placeholder="Lot #" value={row.lot_number} onChange={(e) => updateRow(idx, 'lot_number', e.target.value)} className={`${inputClass} font-mono sm:col-span-2`} maxLength={100} />
                      <input aria-label="Expiry date" type="date" title="Expiry date" value={row.expiry_date} onChange={(e) => updateRow(idx, 'expiry_date', e.target.value)} className={`${inputClass} sm:col-span-2`} />
                      <div className="flex items-center justify-between gap-2 sm:col-span-2 text-[11px] text-slate-500">
                        <span>{total !== null ? `= ${qty(total, item.unit_type)}` : ''}</span>
                        {rows.length > 1 && (
                          <button type="button" onClick={() => setRows(rows.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700" aria-label="Remove line">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => setRows([...rows, emptyRow()])} className="text-xs font-bold text-emerald-700">+ Add Line Item</button>
              <button type="submit" disabled={saving} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold disabled:opacity-60">
                {saving ? 'Saving…' : 'Confirm Receiving'}
              </button>
            </form>
          )}
        </Card>
      )}

      <Card
        title={`Warehouse Lots (${visibleLots.length})`}
        actions={(
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
            Show used-up lots
          </label>
        )}
      >
        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-y border-slate-200">
              <tr>
                <th className="px-6 py-3">Lot #</th>
                <th className="px-6 py-3">Item</th>
                <th className="px-6 py-3 text-right">Remaining</th>
                <th className="px-6 py-3">Supplier</th>
                <th className="px-6 py-3">Received</th>
                <th className="px-6 py-3">Expiry</th>
                <th className="px-6 py-3">PO / Temp</th>
                {canEdit && <th className="px-6 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleLots.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-6 py-2.5 font-mono font-bold text-slate-800">{l.lot_number}</td>
                  <td className="px-6 py-2.5">
                    {l.item_name}
                    <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${l.category === 'Baking' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{l.category}</span>
                  </td>
                  <td className="px-6 py-2.5 text-right font-bold text-emerald-700 tabular-nums">
                    {qty(l.remaining_quantity, l.unit_type)}
                    <div className="text-[10px] font-normal text-slate-400">of {qty(l.total_quantity, l.unit_type)}</div>
                  </td>
                  <td className="px-6 py-2.5 text-slate-600">{l.supplier_name || '—'}</td>
                  <td className="px-6 py-2.5 text-slate-600">{l.received_at?.slice(0, 10)}</td>
                  <td className="px-6 py-2.5 text-slate-600">{l.expiry_date?.slice(0, 10) || '—'}</td>
                  <td className="px-6 py-2.5 text-slate-500">{[l.po_number, l.dock_temp && `${l.dock_temp} °C`].filter(Boolean).join(' · ') || '—'}</td>
                  {canEdit && (
                    <td className="px-6 py-2.5 text-right">
                      <button onClick={() => removeLot(l)} className="text-slate-400 hover:text-red-600" aria-label={`Delete lot ${l.lot_number}`}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {visibleLots.length === 0 && (
                <tr><td colSpan={canEdit ? 8 : 7} className="text-center py-8 text-slate-400">No lots received yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
