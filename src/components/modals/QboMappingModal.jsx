import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { qboAPI, recipesAPI, inventoryAPI, errorMessage } from '../../api/client';
import { inputClass } from '../ui';

export default function QboMappingModal({ showToast, onClose }) {
  const [tab, setTab] = useState('items');
  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">QuickBooks Item Mapping</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
          {[['items', 'Products'], ['lines', 'Lines Needing Attention']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === id ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
        {tab === 'items' ? <ItemMapping showToast={showToast} /> : <OpenLines showToast={showToast} />}
      </div>
    </div>
  );
}

function ItemMapping({ showToast }) {
  const [items, setItems] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [search, setSearch] = useState('');
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);

  const load = useCallback(async () => {
    try {
      const [i, m, r] = await Promise.all([qboAPI.getItems(), qboAPI.getItemMappings(), recipesAPI.options()]);
      setItems(i.data);
      setMappings(m.data);
      setRecipes(r.data);
    } catch (e) {
      showToast(errorMessage(e, 'Could not load QuickBooks products'), 'error');
      setItems([]);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const mapByItem = useMemo(() => Object.fromEntries(mappings.map((m) => [m.qbo_item_id, m])), [mappings]);
  const draftFor = (item) => drafts[item.id] || {
    recipe_id: mapByItem[item.id]?.recipe_id || '',
    format: mapByItem[item.id]?.format || '575g',
    unit_type: mapByItem[item.id]?.unit_type || 'box'
  };
  const setDraft = (item, field, value) => setDrafts((d) => ({ ...d, [item.id]: { ...draftFor(item), [field]: value } }));

  const save = async (item) => {
    const d = draftFor(item);
    if (!d.recipe_id) { showToast('Pick the recipe this product is', 'error'); return; }
    try {
      const { data } = await qboAPI.createMapping({ qbo_item_id: item.id, qbo_item_name: item.name, ...d });
      showToast(data.applied.lines
        ? `${item.name} mapped; ${data.applied.allocated} waiting line(s) allocated${data.applied.still_open ? `, ${data.applied.still_open} still short of stock` : ''}`
        : `${item.name} mapped`);
      setDrafts((x) => { const n = { ...x }; delete n[item.id]; return n; });
      await load();
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the mapping'), 'error');
    }
  };

  const remove = async (item) => {
    const m = mapByItem[item.id];
    if (!m || !window.confirm(`Remove the mapping for ${item.name}? Lines already synced keep their batches.`)) return;
    try {
      await qboAPI.deleteMapping(m.id);
      showToast('Mapping removed');
      await load();
    } catch (e) {
      showToast(errorMessage(e, 'Could not remove the mapping'), 'error');
    }
  };

  if (items === null) return <p className="text-xs text-slate-500">Loading QuickBooks products…</p>;

  const q = search.trim().toLowerCase();
  const shown = items.filter((i) => (!onlyUnmapped || !mapByItem[i.id]) && (!q || i.name.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q)));

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Tell the ERP what each QuickBooks product is: which recipe, which size, and whether one unit on an invoice is a box of 12 or a single bag. Invoice lines for unmapped products are kept for review, never guessed.</p>
      <div className="flex flex-wrap gap-3 items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products or SKU" className={`${inputClass} max-w-xs`} aria-label="Search products" />
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={onlyUnmapped} onChange={(e) => setOnlyUnmapped(e.target.checked)} /> Unmapped only</label>
        <span className="text-xs text-slate-500">{mappings.length} of {items.length} mapped</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-y">
            <tr><th className="px-3 py-2">QuickBooks product</th><th className="px-3 py-2">Recipe</th><th className="px-3 py-2">Size</th><th className="px-3 py-2">1 unit is</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((item) => {
              const d = draftFor(item);
              const mapped = mapByItem[item.id];
              const dirty = Boolean(drafts[item.id]);
              return (
                <tr key={item.id} className={mapped ? '' : 'bg-amber-50/40'}>
                  <td className="px-3 py-2">
                    <div className="font-bold">{item.name}</div>
                    <div className="text-[10px] text-slate-500">{item.type}{item.sku ? ` · SKU ${item.sku}` : ''}{item.active ? '' : ' · inactive'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <select aria-label={`Recipe for ${item.name}`} value={d.recipe_id} onChange={(e) => setDraft(item, 'recipe_id', e.target.value)} className={inputClass}>
                      <option value="">Not a FoodTrace product</option>
                      {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select aria-label={`Size for ${item.name}`} value={d.format} onChange={(e) => setDraft(item, 'format', e.target.value)} className={inputClass}>
                      <option value="575g">575g</option><option value="312g">312g</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select aria-label={`Unit for ${item.name}`} value={d.unit_type} onChange={(e) => setDraft(item, 'unit_type', e.target.value)} className={inputClass}>
                      <option value="box">Box (12 bags)</option><option value="bag">Bag</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {(dirty || !mapped) && (
                      <button onClick={() => save(item)} disabled={!d.recipe_id} className="px-3 py-1.5 text-[11px] font-bold bg-slate-900 text-white rounded-lg disabled:opacity-30">Save</button>
                    )}
                    {mapped && (
                      <button onClick={() => remove(item)} className="ml-1 p-1 text-slate-400 hover:text-red-600" aria-label={`Remove mapping for ${item.name}`}><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No products match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OpenLines({ showToast }) {
  const [lines, setLines] = useState(null);
  const [batches, setBatches] = useState([]);
  const [picked, setPicked] = useState({});

  const load = useCallback(async () => {
    try {
      const [l, b] = await Promise.all([qboAPI.openLines(), inventoryAPI.batches()]);
      setLines(l.data);
      setBatches(b.data.filter((x) => x.shippable));
    } catch (e) {
      showToast(errorMessage(e, 'Could not load open lines'), 'error');
      setLines([]);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const allocate = async (line) => {
    try {
      const { data } = await qboAPI.allocateLine(line.id, picked[line.id]);
      showToast(data.status === 'allocated' ? 'Line allocated' : `Allocated ${data.allocated}; ${data.shortfall} still short of released stock`, data.status === 'allocated' ? 'success' : 'error');
      await load();
    } catch (e) {
      showToast(errorMessage(e, 'Could not allocate'), 'error');
    }
  };

  const release = async (line) => {
    if (!window.confirm('Undo this line\'s batch allocation so it can be re-allocated?')) return;
    try {
      await qboAPI.releaseLine(line.id);
      showToast('Allocation removed');
      await load();
    } catch (e) {
      showToast(errorMessage(e, 'Could not release'), 'error');
    }
  };

  if (lines === null) return <p className="text-xs text-slate-500">Loading…</p>;
  if (lines.length === 0) return <p className="text-xs text-slate-500">Every invoice line is mapped and allocated to batches.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-y">
          <tr><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2">Problem</th><th className="px-3 py-2">Fix</th></tr>
        </thead>
        <tbody className="divide-y">
          {lines.map((l) => {
            const options = batches.filter((b) => b.recipe_id === l.recipe_id && b.format === l.format);
            return (
              <tr key={l.id}>
                <td className="px-3 py-2 font-mono whitespace-nowrap">{l.invoice_number}<div className="text-[10px] text-slate-500">{l.shipped_at}</div></td>
                <td className="px-3 py-2">{l.customer_name}</td>
                <td className="px-3 py-2">{l.product_description}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.allocated}/{l.quantity} {l.unit_type || ''}</td>
                <td className="px-3 py-2 text-rose-700 font-bold">{l.recipe_id ? 'Not enough released stock' : 'Product not mapped'}</td>
                <td className="px-3 py-2">
                  {l.recipe_id ? (
                    <div className="flex flex-wrap gap-1 items-center">
                      <select aria-label="Batch" value={picked[l.id] || ''} onChange={(e) => setPicked((p) => ({ ...p, [l.id]: e.target.value }))} className={`${inputClass} !w-44 font-mono`}>
                        <option value="">Oldest batch first</option>
                        {options.map((b) => <option key={b.batch_id} value={b.batch_id}>{b.batch_number} ({b.boxes_on_hand} box · {b.bags_on_hand} bag)</option>)}
                      </select>
                      <button onClick={() => allocate(l)} className="px-2.5 py-1.5 text-[11px] font-bold bg-slate-900 text-white rounded-lg">Allocate</button>
                      {l.allocated > 0 && <button onClick={() => release(l)} className="px-2 py-1.5 text-[11px] font-bold text-slate-500">Undo</button>}
                    </div>
                  ) : (
                    <span className="text-slate-500">Map it on the Products tab</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
