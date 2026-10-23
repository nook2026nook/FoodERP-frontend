import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, KeyRound, Pencil, Trash2 } from 'lucide-react';
import {
  itemsAPI, recipesAPI, vaultAPI, setVaultToken, hasVaultToken, errorMessage
} from '../../api/client';
import { Card, Field, inputClass, money, fmt, useDebounced } from '../ui';

const EDIT_ROLES = ['Administrator', 'Production Operator'];
const ASSIGNMENTS = [
  ['bag575', 'Bag 575g'], ['box575', 'Box 575g'], ['bag312', 'Bag 312g'], ['box312', 'Box 312g'], ['batch', 'Batch']
];

const emptyForm = () => ({
  name: '',
  scale_basis: 'batch',
  wastage_percent: '2.5',
  labor_cost_per_batch: '150.00',
  manufacturer_margin_percent: '40',
  distributor_margin_percent: '20',
  retailer_margin_percent: '35',
  items: [{ item_id: '', grams_per_batch: '' }],
  packaging: [{ packaging_id: '', amount: '', assignment: 'bag575' }]
});

const isVaultLocked = (e) => e?.response?.data?.code === 'VAULT_LOCKED';

export default function RecipesView({ currentUserRole, showToast }) {
  const [unlocked, setUnlocked] = useState(hasVaultToken());

  const lock = useCallback((message) => {
    setVaultToken(null);
    setUnlocked(false);
    if (message) showToast(message, 'error');
  }, [showToast]);

  if (!unlocked) {
    return <VaultGate isAdmin={currentUserRole === 'Administrator'} showToast={showToast} onUnlock={() => setUnlocked(true)} />;
  }
  return <Formulations currentUserRole={currentUserRole} showToast={showToast} onLock={lock} />;
}

function VaultGate({ isAdmin, showToast, onUnlock }) {
  const [configured, setConfigured] = useState(null);
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    vaultAPI.status()
      .then((r) => setConfigured(r.data.configured))
      .catch((e) => showToast(errorMessage(e, 'Could not reach the formulation vault'), 'error'));
  }, [showToast]);

  const unlock = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await vaultAPI.unlock(passcode);
      setVaultToken(r.data.vaultToken);
      showToast('Formulations vault unlocked');
      onUnlock();
    } catch (err) {
      setError(errorMessage(err, 'Incorrect passcode'));
    } finally {
      setBusy(false);
    }
  };

  const createPasscode = async (e) => {
    e.preventDefault();
    if (passcode !== confirm) { setError('The two passcodes do not match'); return; }
    setBusy(true);
    setError('');
    try {
      await vaultAPI.changePasscode('', passcode);
      const r = await vaultAPI.unlock(passcode);
      setVaultToken(r.data.vaultToken);
      showToast('Vault passcode set');
      onUnlock();
    } catch (err) {
      setError(errorMessage(err, 'Could not set the passcode'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-6 bg-white rounded-3xl shadow-xl border p-7 text-center space-y-4">
      <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto"><Lock size={28} /></div>
      <h3 className="text-base font-black">Protected Formulation Vault</h3>
      {error && <div className="p-2 bg-rose-50 text-rose-700 text-xs font-bold rounded">{error}</div>}

      {configured === false && !isAdmin && (
        <p className="text-xs text-slate-500">No vault passcode has been set yet. Ask an administrator to set one.</p>
      )}

      {configured === false && isAdmin && (
        <form onSubmit={createPasscode} className="space-y-3 text-left">
          <p className="text-xs text-slate-500 text-center">Set the passcode staff will use to open recipes and costs. Use at least 8 characters.</p>
          <input id="vault-new" type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="New passcode" className={`${inputClass} text-sm`} minLength={8} required autoFocus />
          <input id="vault-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat passcode" className={`${inputClass} text-sm`} minLength={8} required />
          <button type="submit" disabled={busy} className="w-full py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold disabled:opacity-60">Set Passcode &amp; Unlock</button>
        </form>
      )}

      {configured && (
        <form onSubmit={unlock} className="space-y-3">
          <input id="vault-passcode" type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Vault passcode" className="w-full p-3 border rounded-xl text-center text-lg font-mono" autoFocus required />
          <button type="submit" disabled={busy} className="w-full py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold disabled:opacity-60">Unlock Vault</button>
        </form>
      )}
    </div>
  );
}

function ChangePasscodeModal({ onClose, showToast }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    try {
      await vaultAPI.changePasscode(current, next);
      showToast('Vault passcode updated');
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not change the passcode'));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={save} className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border space-y-3">
        <h4 className="text-xs font-bold uppercase">Change Vault Passcode</h4>
        {error && <div className="p-2 bg-rose-50 text-rose-700 text-xs font-bold rounded">{error}</div>}
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current passcode" className={inputClass} required autoFocus />
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New passcode (8+ characters)" className={inputClass} minLength={8} required />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs bg-slate-200 rounded-lg">Cancel</button>
          <button type="submit" className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg font-bold">Save</button>
        </div>
      </form>
    </div>
  );
}

/** Form state -> API payload; null while required numbers are missing. */
function toPayload(form) {
  const num = (v) => parseFloat(v);
  const items = form.items
    .filter((r) => r.item_id && num(r.grams_per_batch) > 0)
    .map((r) => ({ item_id: r.item_id, grams_per_batch: num(r.grams_per_batch) }));
  const packaging = form.packaging
    .filter((r) => r.packaging_id && num(r.amount) > 0)
    .map((r) => ({ packaging_id: r.packaging_id, amount: num(r.amount), measure: r.measure, assignment: r.assignment }));
  const fields = ['wastage_percent', 'labor_cost_per_batch', 'manufacturer_margin_percent', 'distributor_margin_percent', 'retailer_margin_percent'];
  if (fields.some((f) => Number.isNaN(num(form[f]))) || items.length === 0) return null;
  return {
    name: form.name.trim(),
    scale_basis: form.scale_basis,
    ...Object.fromEntries(fields.map((f) => [f, num(form[f])])),
    items,
    packaging
  };
}

function Formulations({ currentUserRole, showToast, onLock }) {
  const canEdit = EDIT_ROLES.includes(currentUserRole);
  const [recipes, setRecipes] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [changingPasscode, setChangingPasscode] = useState(false);

  const handleError = useCallback((e, fallback) => {
    if (isVaultLocked(e)) onLock('Vault session expired; unlock it again');
    else showToast(errorMessage(e, fallback), 'error');
  }, [onLock, showToast]);

  const load = useCallback(async () => {
    try {
      const [r, i] = await Promise.all([recipesAPI.getAll(), itemsAPI.getAll()]);
      setRecipes(r.data);
      setCatalog(i.data);
    } catch (e) {
      handleError(e, 'Failed to load formulations');
    }
  }, [handleError]);

  useEffect(() => { load(); }, [load]);

  const baking = catalog.filter((i) => i.category === 'Baking');
  const packagingItems = catalog.filter((i) => i.category === 'Packaging');
  const itemById = useMemo(() => Object.fromEntries(catalog.map((i) => [i.id, i])), [catalog]);

  // Measure follows how the material is stocked: kg items in grams, counted items in units.
  const formWithMeasures = useMemo(() => ({
    ...form,
    packaging: form.packaging.map((r) => ({ ...r, measure: itemById[r.packaging_id]?.unit_type === 'kg' ? 'grams' : 'units' }))
  }), [form, itemById]);

  const payload = useMemo(() => toPayload(formWithMeasures), [formWithMeasures]);
  const debouncedPayload = useDebounced(payload ? JSON.stringify(payload) : null);

  useEffect(() => {
    if (!debouncedPayload) { setPreview(null); return; }
    const body = JSON.parse(debouncedPayload);
    recipesAPI.preview({ ...body, name: body.name || 'Preview' })
      .then((r) => setPreview(r.data))
      .catch((e) => { setPreview(null); if (isVaultLocked(e)) onLock('Vault session expired; unlock it again'); });
  }, [debouncedPayload, onLock]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const updateRow = (list, idx, field, value) =>
    setForm((f) => ({ ...f, [list]: f[list].map((r, i) => (i === idx ? { ...r, [field]: value } : r)) }));
  const addRow = (list, row) => setForm((f) => ({ ...f, [list]: [...f[list], row] }));
  const removeRow = (list, idx) => setForm((f) => ({ ...f, [list]: f[list].filter((_, i) => i !== idx) }));

  const reset = () => { setForm(emptyForm()); setEditingId(null); };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Give the formula a name', 'error'); return; }
    if (!payload) { showToast('Add at least one baking ingredient with grams, and fill every cost field', 'error'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await recipesAPI.update(editingId, payload);
        showToast('Formulation updated');
      } else {
        await recipesAPI.create(payload);
        showToast('Formulation saved');
      }
      reset();
      await load();
    } catch (err) {
      handleError(err, 'Failed to save formulation');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      scale_basis: r.scale_basis,
      wastage_percent: String(Number(r.wastage_percent)),
      labor_cost_per_batch: String(Number(r.labor_cost_per_batch)),
      manufacturer_margin_percent: String(Number(r.manufacturer_margin_percent)),
      distributor_margin_percent: String(Number(r.distributor_margin_percent)),
      retailer_margin_percent: String(Number(r.retailer_margin_percent)),
      items: r.items.length ? r.items.map((i) => ({ item_id: i.item_id, grams_per_batch: String(Number(i.grams_per_batch)) })) : emptyForm().items,
      packaging: r.packaging.length
        ? r.packaging.map((p) => ({ packaging_id: p.packaging_id, amount: String(Number(p.amount)), assignment: p.assignment }))
        : emptyForm().packaging
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete formulation "${r.name}"?`)) return;
    try {
      await recipesAPI.delete(r.id);
      showToast('Formulation deleted');
      if (editingId === r.id) reset();
      await load();
    } catch (err) {
      handleError(err, 'Failed to delete formulation');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="bg-white rounded-2xl shadow-sm border p-4 flex items-center justify-between">
        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl">Vault Unlocked</span>
        <div className="flex gap-2">
          {currentUserRole === 'Administrator' && (
            <button onClick={() => setChangingPasscode(true)} className="px-3.5 py-1.5 text-xs font-bold bg-slate-100 rounded-xl border flex items-center gap-1">
              <KeyRound size={13} /><span>Change Passcode</span>
            </button>
          )}
          <button onClick={() => onLock()} className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl">Lock Vault</button>
        </div>
      </div>

      {changingPasscode && <ChangePasscodeModal onClose={() => setChangingPasscode(false)} showToast={showToast} />}

      {canEdit && (
        <Card
          title={editingId ? 'Edit Product Formulation' : 'Create New Product Formulation & BOM'}
          actions={editingId && <button onClick={reset} className="text-xs font-bold text-slate-500">Cancel Edit</button>}
        >
          <form onSubmit={save} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Field label="Formula Name *" htmlFor="rec-name" className="sm:col-span-2">
                <input id="rec-name" placeholder="e.g. Honey Almond Granola" value={form.name} onChange={set('name')} className={inputClass} maxLength={255} />
              </Field>
              <Field label="Default Scale" htmlFor="rec-basis">
                <select id="rec-basis" value={form.scale_basis} onChange={set('scale_basis')} className={inputClass}>
                  <option value="batch">Per commercial batch (2 bins)</option>
                  <option value="bin">Per single dough bin</option>
                </select>
              </Field>
              <Field label="Wastage %" htmlFor="rec-wastage">
                <input id="rec-wastage" type="number" step="any" min="0" value={form.wastage_percent} onChange={set('wastage_percent')} className={inputClass} />
              </Field>
              <Field label="Labor Cost per Batch ($)" htmlFor="rec-labor">
                <input id="rec-labor" type="number" step="any" min="0" value={form.labor_cost_per_batch} onChange={set('labor_cost_per_batch')} className={inputClass} />
              </Field>
              <Field label="Manufacturer Margin %" htmlFor="rec-mfg">
                <input id="rec-mfg" type="number" step="any" min="0" max="100" value={form.manufacturer_margin_percent} onChange={set('manufacturer_margin_percent')} className={inputClass} />
              </Field>
              <Field label="Distributor Margin %" htmlFor="rec-dist">
                <input id="rec-dist" type="number" step="any" min="0" max="100" value={form.distributor_margin_percent} onChange={set('distributor_margin_percent')} className={inputClass} />
              </Field>
              <Field label="Retailer Margin %" htmlFor="rec-ret">
                <input id="rec-ret" type="number" step="any" min="0" max="100" value={form.retailer_margin_percent} onChange={set('retailer_margin_percent')} className={inputClass} />
              </Field>
            </div>

            <div className="space-y-3 bg-amber-50/50 p-4 rounded-xl border">
              <span className="text-xs font-bold text-amber-900 uppercase">🌾 Baking Ingredients (grams per batch)</span>
              {form.items.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select aria-label="Baking ingredient" value={row.item_id} onChange={(e) => updateRow('items', idx, 'item_id', e.target.value)} className={`${inputClass} flex-1`}>
                    <option value="">Select baking ingredient…</option>
                    {baking.map((i) => <option key={i.id} value={i.id}>{i.name} ({money(i.cost_per_pack)}/{Number(i.unit_pack_size)} kg)</option>)}
                  </select>
                  <input aria-label="Grams" type="number" step="any" min="0" placeholder="Grams (g)" value={row.grams_per_batch} onChange={(e) => updateRow('items', idx, 'grams_per_batch', e.target.value)} className={`${inputClass} w-32`} />
                  {form.items.length > 1 && (
                    <button type="button" onClick={() => removeRow('items', idx)} className="text-red-500" aria-label="Remove ingredient"><Trash2 size={16} /></button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => addRow('items', { item_id: '', grams_per_batch: '' })} className="text-xs font-bold text-amber-800">+ Add Ingredient</button>
            </div>

            <div className="space-y-3 bg-blue-50/50 p-4 rounded-xl border">
              <span className="text-xs font-bold text-blue-900 uppercase">📦 Packaging Bill of Materials (BOM)</span>
              {formWithMeasures.packaging.map((row, idx) => (
                <div key={idx} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center">
                  <select aria-label="Packaging material" value={row.packaging_id} onChange={(e) => updateRow('packaging', idx, 'packaging_id', e.target.value)} className={`${inputClass} col-span-2 sm:col-span-5`}>
                    <option value="">Select packaging material…</option>
                    {packagingItems.map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.cost_per_pack)}/{Number(p.unit_pack_size)} {p.unit_type})</option>)}
                  </select>
                  <input aria-label="Amount" type="number" step="any" min="0" placeholder="Amount" value={row.amount} onChange={(e) => updateRow('packaging', idx, 'amount', e.target.value)} className={`${inputClass} sm:col-span-2`} />
                  <span className="sm:col-span-2 text-xs text-slate-500">{row.packaging_id ? (row.measure === 'grams' ? 'grams' : 'units') : ''}</span>
                  <select aria-label="Assignment" value={row.assignment} onChange={(e) => updateRow('packaging', idx, 'assignment', e.target.value)} className={`${inputClass} sm:col-span-2`}>
                    {ASSIGNMENTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                  <div className="sm:col-span-1 text-right">
                    {form.packaging.length > 1 && (
                      <button type="button" onClick={() => removeRow('packaging', idx)} className="text-red-500" aria-label="Remove packaging"><Trash2 size={16} /></button>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => addRow('packaging', { packaging_id: '', amount: '', assignment: 'bag575' })} className="text-xs font-bold text-blue-800">+ Add Packaging Material</button>
            </div>

            <CostPreview preview={preview} />

            <button type="submit" disabled={saving} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-60">
              {editingId ? 'Update Formulation' : 'Save New Formulation'}
            </button>
          </form>
        </Card>
      )}

      <Card title={`Saved Recipes (${recipes.length})`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recipes.map((r) => (
            <div key={r.id} className={`p-4 border rounded-xl space-y-2 ${editingId === r.id ? 'bg-amber-50 border-amber-300' : 'bg-slate-50'}`}>
              <div className="flex justify-between items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">{r.name}</span>
                {canEdit && (
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(r)} className="text-slate-500 hover:text-emerald-700" aria-label={`Edit ${r.name}`}><Pencil size={15} /></button>
                    <button onClick={() => remove(r)} className="text-red-400 hover:text-red-600" aria-label={`Delete ${r.name}`}><Trash2 size={15} /></button>
                  </div>
                )}
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <div><b>Baking Ingredients:</b> {r.items.length} items ({fmt(r.total_baking_grams, 0)} g total)</div>
                <div><b>Packaging BOM:</b> {r.packaging.length} items · <b>Scale:</b> {r.scale_basis === 'bin' ? 'per bin' : 'per batch'}</div>
                <div><b>Estimated Batch Cost:</b> {money(r.cost_per_batch)}</div>
                <div><b>575g Cost / Mfg Price:</b> {money(r.cost_per_575g)} / {money(r.mfg_price_575g)}</div>
                <div><b>312g Cost / Mfg Price:</b> {money(r.cost_per_312g)} / {money(r.mfg_price_312g)}</div>
              </div>
            </div>
          ))}
          {recipes.length === 0 && <p className="text-xs text-slate-400">No formulations saved yet.</p>}
        </div>
      </Card>
    </div>
  );
}

function CostPreview({ preview }) {
  if (!preview) {
    return <p className="text-xs text-slate-400">Cost breakdown appears once at least one ingredient has grams.</p>;
  }
  const rows = [
    ['Baking ingredients', money(preview.doughCost)],
    ['Labor', money(preview.labor)],
    ['Wastage buffer', money(preview.wastage)],
    ['Shared batch packaging', money(preview.sharedMaterialCost)],
    ['Batch cost', money(preview.totalCost)]
  ];
  const formats = [
    ['575g', preview.units575, preview.costPer575g, preview.mfgPrice575g, preview.distPrice575g, preview.retailPrice575g],
    ['312g', preview.units312, preview.costPer312g, preview.mfgPrice312g, preview.distPrice312g, preview.retailPrice312g]
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 text-xs">
      <dl className="space-y-1">
        {rows.map(([label, value], i) => (
          <div key={label} className={`flex justify-between ${i === rows.length - 1 ? 'font-black border-t border-emerald-200 pt-1' : ''}`}>
            <dt className="text-slate-600">{label}</dt><dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <table className="w-full text-right tabular-nums">
        <thead className="text-[10px] uppercase text-slate-500">
          <tr><th className="text-left">Format</th><th>Units</th><th>Cost</th><th>Mfg</th><th>Dist</th><th>Retail</th></tr>
        </thead>
        <tbody>
          {formats.map(([f, units, cost, mfg, dist, ret]) => (
            <tr key={f}>
              <td className="text-left font-bold">{f}</td><td>{units}</td><td>{money(cost)}</td>
              <td>{money(mfg)}</td><td>{money(dist)}</td><td className="font-bold text-emerald-700">{money(ret)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
