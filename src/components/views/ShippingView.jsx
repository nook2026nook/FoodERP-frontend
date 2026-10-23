import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { inventoryAPI, shipmentsAPI, errorMessage } from '../../api/client';
import { Card, Field, inputClass, todayIso } from '../ui';
import QuickBooksPanel from '../QuickBooksPanel';

const EDIT_ROLES = ['Administrator', 'Shipping Clerk'];
const emptyLine = () => ({ product: '', unit_type: 'box', quantity: '', batch_id: '' });

export default function ShippingView({ currentUserRole, showToast }) {
  const canEdit = EDIT_ROLES.includes(currentUserRole);
  const [stock, setStock] = useState([]);       // per-batch finished stock
  const [shipments, setShipments] = useState([]);
  const [customer, setCustomer] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [shippedAt, setShippedAt] = useState(todayIso());
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);

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

      <Card title={`Dispatches (${shipments.length})`}>
        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-y border-slate-200">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Invoice</th>
                <th className="px-6 py-3">Products</th>
                <th className="px-6 py-3">From batches</th>
                <th className="px-6 py-3">Source</th>
                {canEdit && <th className="px-6 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shipments.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 align-top">
                  <td className="px-6 py-2.5 whitespace-nowrap">{s.shipped_at}</td>
                  <td className="px-6 py-2.5 font-bold text-slate-800">{s.customer_name}</td>
                  <td className="px-6 py-2.5 font-mono">{s.invoice_number}</td>
                  <td className="px-6 py-2.5">
                    {s.lines.map((l) => (
                      <div key={l.id}>
                        {l.quantity} {l.unit_type === 'box' ? 'box' : 'bag'}{l.quantity === 1 ? '' : (l.unit_type === 'box' ? 'es' : 's')} · {l.product_description}
                        {l.allocation_status !== 'allocated' && <span className="ml-1 text-[10px] font-bold text-rose-600 uppercase">{l.allocation_status}</span>}
                      </div>
                    ))}
                  </td>
                  <td className="px-6 py-2.5 font-mono text-slate-600">
                    {s.lines.flatMap((l) => l.allocations).map((a) => (
                      <div key={`${a.line_id}-${a.batch_id}`}>{a.batch_number}: {a.boxes ? `${a.boxes} box` : `${a.bags} bag`}</div>
                    ))}
                  </td>
                  <td className="px-6 py-2.5 text-slate-500">{s.source}</td>
                  {canEdit && (
                    <td className="px-6 py-2.5 text-right">
                      {s.source === 'Manual' && (
                        <button onClick={() => remove(s)} className="text-slate-400 hover:text-red-600" aria-label={`Delete shipment ${s.invoice_number}`}><Trash2 size={15} /></button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {shipments.length === 0 && (
                <tr><td colSpan={canEdit ? 7 : 6} className="text-center py-8 text-slate-400">No dispatches recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
