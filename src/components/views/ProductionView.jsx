import { useCallback, useEffect, useState } from 'react';
import { Trash2, Pencil, Package, ShieldCheck, ShieldAlert, Ban } from 'lucide-react';
import { batchesAPI, recipesAPI, errorMessage } from '../../api/client';
import { Card, Field, StatusPill, inputClass, fmt, money, qty, todayIso, useDebounced } from '../ui';

const EDIT_ROLES = ['Administrator', 'Production Operator'];
const QUALITY_ROLES = ['Administrator', 'Quality Assurance (QA)'];
const BAKING_EDITABLE = ['Planned', 'In Production', 'Completed', 'Quality Hold'];
const PACKAGING_EDITABLE = ['In Production', 'Completed', 'Quality Hold'];
const CANCELLABLE = ['Planned', 'In Production', 'Completed', 'Quality Hold'];
const EMPTY_COUNTS = { boxes_575g: '', bags_575g: '', boxes_312g: '', bags_312g: '' };

const multiplierFor = (basis, bins) => (basis === 'bin' ? bins : bins / 2);

/** {item_id: [{lot_id, quantity}]} from the server's suggested FIFO splits. */
const splitsFromSuggestions = (requirements) => Object.fromEntries(
  requirements.map((r) => [r.item_id, r.splits.length
    ? r.splits.map((s) => ({ lot_id: s.lot_id, quantity: String(s.quantity) }))
    : [{ lot_id: '', quantity: String(r.required) }]])
);

/** Flatten editable splits to the API shape. */
const splitsPayload = (splits) => Object.entries(splits).flatMap(([itemId, rows]) =>
  rows.filter((r) => r.lot_id && parseFloat(r.quantity) > 0)
    .map((r) => ({ item_id: itemId, lot_id: r.lot_id, quantity: parseFloat(r.quantity) })));

export default function ProductionView({ currentUserRole, showToast }) {
  const canEdit = EDIT_ROLES.includes(currentUserRole);
  const canQuality = QUALITY_ROLES.includes(currentUserRole);
  const [tab, setTab] = useState('baking');
  const [recipes, setRecipes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [packagingBatchId, setPackagingBatchId] = useState('');
  const [bakingPrefill, setBakingPrefill] = useState(null);

  const loadBatches = useCallback(async () => {
    try {
      const { data } = await batchesAPI.getAll();
      setBatches(data);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load batches'), 'error');
    }
  }, [showToast]);

  useEffect(() => {
    recipesAPI.options()
      .then((r) => setRecipes(r.data))
      .catch((e) => showToast(errorMessage(e, 'Failed to load recipes'), 'error'));
    loadBatches();
  }, [loadBatches, showToast]);

  const openPackaging = (batchId) => {
    setPackagingBatchId(batchId);
    setTab('packaging');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const editBaking = (batch) => {
    setBakingPrefill({ ...batch, key: Date.now() });
    setTab('baking');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const changeStatus = async (batch, status) => {
    const prompts = {
      'Quality Hold': `Put batch ${batch.batch_number} on quality hold?`,
      Released: `Release batch ${batch.batch_number} for shipping?`,
      Cancelled: `Cancel batch ${batch.batch_number}? All lot stock it used will be put back.`
    };
    if (!window.confirm(prompts[status])) return;
    try {
      await batchesAPI.setStatus(batch.id, status);
      showToast(`Batch ${batch.batch_number} is now ${status}`);
      await loadBatches();
    } catch (e) {
      showToast(errorMessage(e, 'Failed to change status'), 'error');
    }
  };

  const removeBatch = async (batch) => {
    if (!window.confirm(`Delete batch ${batch.batch_number}? All lot stock it used will be put back.`)) return;
    try {
      await batchesAPI.delete(batch.id);
      showToast(`Batch ${batch.batch_number} deleted; inventory refunded`);
      if (packagingBatchId === batch.id) setPackagingBatchId('');
      await loadBatches();
    } catch (e) {
      showToast(errorMessage(e, 'Failed to delete batch'), 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-slate-200 gap-2">
        {[['baking', '🔥 Baking Screen', 'bg-amber-600'], ['packaging', '📦 Packaging Screen', 'bg-blue-600']].map(([id, label, active]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition ${tab === id ? `${active} text-white shadow-sm` : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'baking' && (
        <BakingScreen
          key={bakingPrefill?.key || 'new'}
          prefill={bakingPrefill}
          recipes={recipes}
          canEdit={canEdit}
          showToast={showToast}
          onSaved={async (batch, goToPackaging) => {
            setBakingPrefill(null);
            await loadBatches();
            if (goToPackaging) openPackaging(batch.id);
          }}
        />
      )}

      {tab === 'packaging' && (
        <PackagingScreen
          batches={batches}
          batchId={packagingBatchId}
          setBatchId={setPackagingBatchId}
          canEdit={canEdit}
          showToast={showToast}
          onSaved={loadBatches}
        />
      )}

      <BatchLog
        batches={batches}
        canEdit={canEdit}
        canQuality={canQuality}
        onEditBaking={editBaking}
        onPackaging={openPackaging}
        onStatus={changeStatus}
        onDelete={removeBatch}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lot split editor (shared by baking and packaging)
// ---------------------------------------------------------------------------

function SplitEditor({ requirement, rows, onChange, disabled }) {
  const unit = requirement.unit_type === 'kg' ? 'kg' : 'units';
  const total = rows.reduce((acc, r) => acc + (parseFloat(r.quantity) || 0), 0);
  const balanced = Math.abs(total - requirement.required) <= 0.01;
  const update = (idx, field, value) => onChange(rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

  return (
    <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-bold text-slate-800">{requirement.item_name}</span>
        <span className={`font-mono font-bold ${balanced ? 'text-emerald-700' : 'text-rose-600'}`}>
          {fmt(total, 3)} / {fmt(requirement.required, 3)} {unit}
        </span>
      </div>
      {requirement.shortfall > 0 && (
        <p className="text-[11px] font-bold text-rose-600">
          Not enough stock: short by {qty(requirement.shortfall, requirement.unit_type)}. Receive more before saving.
        </p>
      )}
      {rows.map((row, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <select aria-label={`Lot for ${requirement.item_name}`} value={row.lot_id} onChange={(e) => update(idx, 'lot_id', e.target.value)} className={`${inputClass} !w-auto min-w-0 flex-1 font-mono`} disabled={disabled}>
            <option value="">Select lot…</option>
            {requirement.lots.map((l) => (
              <option key={l.lot_id} value={l.lot_id}>
                {l.lot_number} — {qty(l.available, requirement.unit_type)} available{l.expiry_date ? ` · exp ${l.expiry_date}` : ''}
              </option>
            ))}
          </select>
          <input aria-label={`Quantity for ${requirement.item_name}`} type="number" step="any" min="0" value={row.quantity} onChange={(e) => update(idx, 'quantity', e.target.value)} className={`${inputClass} !w-28 shrink-0`} disabled={disabled} />
          <span className="text-[11px] text-slate-500 w-8">{unit}</span>
          {rows.length > 1 && !disabled && (
            <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== idx))} className="text-red-500" aria-label="Remove split"><Trash2 size={15} /></button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={() => onChange([...rows, { lot_id: '', quantity: '' }])} className="text-[11px] font-bold text-emerald-700">+ Split across another lot</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Baking screen
// ---------------------------------------------------------------------------

function BakingScreen({ prefill, recipes, canEdit, showToast, onSaved }) {
  const [batchNumber, setBatchNumber] = useState(prefill?.batch_number || '');
  const [productionDate, setProductionDate] = useState(prefill?.production_date || todayIso());
  const [recipeId, setRecipeId] = useState(prefill?.recipe_id || '');
  const [bins, setBins] = useState(prefill ? String(Number(prefill.bins_count)) : '40');
  const [basisOverride, setBasisOverride] = useState(prefill?.scale_basis || '');
  const [reqs, setReqs] = useState(null);
  const [reqError, setReqError] = useState('');
  const [splits, setSplits] = useState({});
  const [saving, setSaving] = useState(false);

  const recipe = recipes.find((r) => r.id === recipeId);
  const basis = basisOverride || recipe?.scale_basis || 'batch';
  const binsNum = parseFloat(bins) || 0;
  const query = useDebounced(JSON.stringify({ recipeId, binsNum, basis, batchNumber: batchNumber.trim() }));

  useEffect(() => {
    const q = JSON.parse(query);
    if (!q.recipeId || !(q.binsNum > 0)) { setReqs(null); setSplits({}); return; }
    batchesAPI.bakingRequirements({
      recipe_id: q.recipeId, bins_count: q.binsNum, scale_basis: q.basis, batch_number: q.batchNumber || undefined
    })
      .then(({ data }) => { setReqs(data); setSplits(splitsFromSuggestions(data.requirements)); setReqError(''); })
      .catch((e) => { setReqs(null); setReqError(errorMessage(e, 'Could not calculate ingredient needs')); });
  }, [query]);

  const generateNumber = () => {
    const dateCode = productionDate.replace(/-/g, '').slice(2);
    const generated = `BATCH-${dateCode}-${Math.floor(100 + Math.random() * 900)}`;
    setBatchNumber(generated);
    showToast(`Auto-generated Batch #${generated}`);
  };

  const base = () => ({
    batch_number: batchNumber.trim(),
    recipe_id: recipeId,
    production_date: productionDate,
    bins_count: binsNum,
    scale_basis: basis
  });

  const validateBase = () => {
    if (!batchNumber.trim()) { showToast('Enter a production batch number', 'error'); return false; }
    if (!recipeId) { showToast('Select a target formulation', 'error'); return false; }
    if (!(binsNum > 0)) { showToast('Enter the number of bins', 'error'); return false; }
    return true;
  };

  const save = async (goToPackaging) => {
    if (!validateBase()) return;
    setSaving(true);
    try {
      const { data } = await batchesAPI.saveBaking({ ...base(), splits: splitsPayload(splits) });
      showToast(`Baking batch #${data.batch_number} saved`);
      await onSaved(data, goToPackaging);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to save baking batch'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const plan = async () => {
    if (!validateBase()) return;
    setSaving(true);
    try {
      const { data } = await batchesAPI.plan(base());
      showToast(`Batch #${data.batch_number} reserved as Planned`);
      await onSaved(data, false);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to plan batch'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={prefill ? `Edit Baking — Batch ${prefill.batch_number}` : 'Baking Batch Entry'}>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        <Field label="Production Batch # *" htmlFor="bk-number" className="sm:col-span-2">
          <div className="flex gap-2">
            <input id="bk-number" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} className={`${inputClass} font-mono`} maxLength={100} disabled={!canEdit || Boolean(prefill)} />
            {canEdit && !prefill && (
              <button type="button" onClick={generateNumber} className="px-3 text-[11px] font-bold bg-slate-100 border rounded-lg whitespace-nowrap">Auto</button>
            )}
          </div>
        </Field>
        <Field label="Production Date" htmlFor="bk-date">
          <input id="bk-date" type="date" value={productionDate} onChange={(e) => setProductionDate(e.target.value)} className={inputClass} disabled={!canEdit} />
        </Field>
        <Field label="Target Formulation *" htmlFor="bk-recipe" className="sm:col-span-2">
          <select id="bk-recipe" value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className={inputClass} disabled={!canEdit}>
            <option value="">Select recipe…</option>
            {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Dough Bins" htmlFor="bk-bins">
          <input id="bk-bins" type="number" step="any" min="0.5" value={bins} onChange={(e) => setBins(e.target.value)} className={`${inputClass} font-bold`} disabled={!canEdit} />
        </Field>
        <Field label="Scale" htmlFor="bk-basis" className="sm:col-span-2">
          <select id="bk-basis" value={basisOverride} onChange={(e) => setBasisOverride(e.target.value)} className={inputClass} disabled={!canEdit}>
            <option value="">Recipe default ({recipe?.scale_basis === 'bin' ? 'per bin' : 'per batch'})</option>
            <option value="batch">Per commercial batch (2 bins)</option>
            <option value="bin">Per single dough bin</option>
          </select>
        </Field>
        <div className="sm:col-span-2 flex items-end text-xs text-slate-600">
          <span>
            Scale: <b>{fmt(multiplierFor(basis, binsNum), 2)}×</b> recipe
            {reqs && <> · Theoretical dough <b>{fmt(reqs.theoretical_dough_grams / 1000, 2)} kg</b></>}
          </span>
        </div>
      </div>

      {reqError && <p className="text-xs font-bold text-rose-600">{reqError}</p>}

      {reqs && (
        <div className="space-y-3 bg-amber-50/50 p-4 rounded-xl border">
          <span className="text-xs font-bold text-amber-900 uppercase">Ingredient lots (oldest first)</span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {reqs.requirements.map((r) => (
              <SplitEditor
                key={r.item_id}
                requirement={r}
                rows={splits[r.item_id] || []}
                onChange={(rows) => setSplits((s) => ({ ...s, [r.item_id]: rows }))}
                disabled={!canEdit}
              />
            ))}
          </div>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving || !reqs} onClick={() => save(false)} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold disabled:opacity-50">Save Baking Batch</button>
          <button type="button" disabled={saving || !reqs} onClick={() => save(true)} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-50">Save &amp; Go to Packaging</button>
          {!prefill && (
            <button type="button" disabled={saving} onClick={plan} className="px-4 py-2.5 bg-slate-100 border rounded-lg text-xs font-bold disabled:opacity-50">Reserve as Planned</button>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Packaging screen
// ---------------------------------------------------------------------------

const VARIANCE_STYLE = {
  Balanced: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  'Over-Yield': 'text-amber-800 bg-amber-50 border-amber-200',
  'Scrap / Loss': 'text-rose-700 bg-rose-50 border-rose-200'
};

function PackagingScreen({ batches, batchId, setBatchId, canEdit, showToast, onSaved }) {
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [result, setResult] = useState(null);
  const [splits, setSplits] = useState({});
  const [saving, setSaving] = useState(false);

  const eligible = batches.filter((b) => PACKAGING_EDITABLE.includes(b.status));
  const pending = eligible.filter((b) => !b.packaged_at);
  const packaged = eligible.filter((b) => b.packaged_at);
  const batch = batches.find((b) => b.id === batchId);

  // Load the saved counts when a packaged batch is opened.
  useEffect(() => {
    if (!batch?.packaged_at) { setCounts(EMPTY_COUNTS); return; }
    setCounts({
      boxes_575g: String(batch.boxes_575g ?? ''), bags_575g: String(batch.bags_575g ?? ''),
      boxes_312g: String(batch.boxes_312g ?? ''), bags_312g: String(batch.bags_312g ?? '')
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const numericCounts = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.max(0, parseInt(v, 10) || 0)]));
  const query = useDebounced(JSON.stringify({ batchId, ...numericCounts }));

  useEffect(() => {
    const { batchId: id, ...c } = JSON.parse(query);
    if (!id) { setResult(null); setSplits({}); return; }
    batchesAPI.packagingRequirements(id, c)
      .then(({ data }) => { setResult(data); setSplits(splitsFromSuggestions(data.requirements.filter((r) => r.required > 0))); })
      .catch((e) => { setResult(null); showToast(errorMessage(e, 'Could not calculate packaging'), 'error'); });
  }, [query, showToast]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await batchesAPI.savePackaging(batchId, { ...numericCounts, splits: splitsPayload(splits) });
      showToast(`Batch #${data.batch_number} packaging saved; awaiting QA release`);
      setBatchId('');
      await onSaved();
    } catch (e) {
      showToast(errorMessage(e, 'Failed to save packaging'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const setCount = (field) => (e) => setCounts((c) => ({ ...c, [field]: e.target.value }));
  const needed = result?.requirements.filter((r) => r.required > 0) || [];

  return (
    <Card title="Packaging Run">
      <Field label="Batch to package" htmlFor="pk-batch">
        <select id="pk-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)} className={`${inputClass} font-mono`}>
          <option value="">Select a baked batch…</option>
          {pending.length > 0 && (
            <optgroup label="Awaiting packaging">
              {pending.map((b) => <option key={b.id} value={b.id}>{b.batch_number} — {b.recipe_name} ({b.production_date}) [{Number(b.bins_count)} bins]</option>)}
            </optgroup>
          )}
          {packaged.length > 0 && (
            <optgroup label="Packaged — edit">
              {packaged.map((b) => <option key={b.id} value={b.id}>{b.batch_number} — {b.recipe_name} ({b.production_date}) [{b.status}]</option>)}
            </optgroup>
          )}
        </select>
      </Field>

      {!batch && eligible.length === 0 && <p className="text-xs text-slate-400">No baked batches waiting. Save a baking batch first.</p>}

      {batch && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[['575g', 'boxes_575g', 'bags_575g', 'bg-indigo-50 border-indigo-200'], ['312g', 'boxes_312g', 'bags_312g', 'bg-emerald-50 border-emerald-200']].map(([label, boxKey, bagKey, tone]) => (
              <div key={label} className={`p-4 rounded-xl border space-y-2 ${tone}`}>
                <span className="font-bold text-xs block">{label} Format (1 box = 12 bags)</span>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Full boxes" htmlFor={`pk-${boxKey}`}>
                    <input id={`pk-${boxKey}`} type="number" min="0" step="1" value={counts[boxKey]} onChange={setCount(boxKey)} className={inputClass} disabled={!canEdit} />
                  </Field>
                  <Field label="Loose bags" htmlFor={`pk-${bagKey}`}>
                    <input id={`pk-${bagKey}`} type="number" min="0" step="1" value={counts[bagKey]} onChange={setCount(bagKey)} className={inputClass} disabled={!canEdit} />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          {result && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-xl border text-xs space-y-1 ${VARIANCE_STYLE[result.variance_status]}`}>
                <div className="flex justify-between"><span>Theoretical dough</span><b className="tabular-nums">{fmt(result.theoretical_dough_grams, 0)} g</b></div>
                <div className="flex justify-between"><span>Packaged weight</span><b className="tabular-nums">{fmt(result.packaged_weight_grams, 0)} g</b></div>
                <div className="flex justify-between border-t border-current/20 pt-1 text-sm">
                  <span className="font-bold">Live delta</span>
                  <b className="tabular-nums">{result.variance_delta_grams > 0 ? '+' : ''}{fmt(result.variance_delta_grams, 0)} g · {result.variance_status}</b>
                </div>
                <p className="text-[10px] opacity-80">Within ±50 g counts as balanced.</p>
              </div>
              <div className="p-4 rounded-xl border bg-slate-50 text-xs space-y-1">
                <span className="font-bold uppercase text-[10px] text-slate-500">Actual packaging cost</span>
                {[['575g bags', result.cost.bag575, result.counts.total_bags_575g, 'bags'], ['575g boxes', result.cost.box575, result.counts.boxes_575g, 'boxes'],
                  ['312g bags', result.cost.bag312, result.counts.total_bags_312g, 'bags'], ['312g boxes', result.cost.box312, result.counts.boxes_312g, 'boxes'],
                  ['Batch materials', result.cost.other]].map(([label, cost, n, unit]) => (
                  <div key={label} className="flex justify-between">
                    <span>{label}{n !== undefined ? ` (${n} ${unit})` : ''}</span><span className="tabular-nums">{money(cost)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-black border-t pt-1"><span>Total</span><span className="tabular-nums">{money(result.cost.total)}</span></div>
              </div>
            </div>
          )}

          {needed.length > 0 && (
            <div className="space-y-3 bg-blue-50/50 p-4 rounded-xl border">
              <span className="text-xs font-bold text-blue-900 uppercase">Packaging material lots (oldest first)</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {needed.map((r) => (
                  <SplitEditor key={r.item_id} requirement={r} rows={splits[r.item_id] || []} onChange={(rows) => setSplits((s) => ({ ...s, [r.item_id]: rows }))} disabled={!canEdit} />
                ))}
              </div>
            </div>
          )}

          {canEdit && (
            <button type="button" disabled={saving || !result} onClick={save} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-50">
              Save Packaging &amp; Send to QA
            </button>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Batch log
// ---------------------------------------------------------------------------

function BatchLog({ batches, canEdit, canQuality, onEditBaking, onPackaging, onStatus, onDelete }) {
  const iconBtn = 'p-1 rounded hover:bg-slate-100';
  return (
    <Card title={`Production Batch Log (${batches.length})`}>
      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-y border-slate-200">
            <tr>
              <th className="px-6 py-3">Batch #</th>
              <th className="px-6 py-3">Recipe</th>
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">Bins</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-right">Packed</th>
              <th className="px-6 py-3 text-right">Delta</th>
              <th className="px-6 py-3 text-right">Pkg Cost</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-6 py-2.5 font-mono font-bold">{b.batch_number}</td>
                <td className="px-6 py-2.5">{b.recipe_name}</td>
                <td className="px-6 py-2.5 whitespace-nowrap">{b.production_date}</td>
                <td className="px-6 py-2.5 whitespace-nowrap">{Number(b.bins_count)} ({b.scale_basis === 'bin' ? 'per bin' : `${Number(b.bins_count) / 2} batches`})</td>
                <td className="px-6 py-2.5"><StatusPill status={b.status} /></td>
                <td className="px-6 py-2.5 text-right tabular-nums whitespace-nowrap">
                  {b.packaged_at ? (
                    <>
                      <div>575g: {b.boxes_575g} box · {b.bags_575g} bag</div>
                      <div className="text-slate-500">312g: {b.boxes_312g} box · {b.bags_312g} bag</div>
                    </>
                  ) : '—'}
                </td>
                <td className={`px-6 py-2.5 text-right tabular-nums font-bold ${b.variance_status === 'Balanced' ? 'text-emerald-700' : b.variance_status ? 'text-rose-600' : 'text-slate-400'}`}>
                  {b.packaged_at ? `${Number(b.variance_delta_grams) > 0 ? '+' : ''}${fmt(b.variance_delta_grams, 0)} g` : '—'}
                </td>
                <td className="px-6 py-2.5 text-right tabular-nums">{b.packaged_at ? money(b.total_pkg_cost) : '—'}</td>
                <td className="px-6 py-2.5">
                  <div className="flex justify-end gap-1 text-slate-500">
                    {canEdit && BAKING_EDITABLE.includes(b.status) && (
                      <button onClick={() => onEditBaking(b)} className={`${iconBtn} hover:text-amber-700`} title="Edit baking" aria-label={`Edit baking for ${b.batch_number}`}><Pencil size={15} /></button>
                    )}
                    {canEdit && PACKAGING_EDITABLE.includes(b.status) && (
                      <button onClick={() => onPackaging(b.id)} className={`${iconBtn} hover:text-blue-700`} title={b.packaged_at ? 'Edit packaging' : 'Package'} aria-label={`Packaging for ${b.batch_number}`}><Package size={15} /></button>
                    )}
                    {canQuality && b.status === 'Completed' && (
                      <button onClick={() => onStatus(b, 'Quality Hold')} className={`${iconBtn} hover:text-rose-700`} title="Quality hold" aria-label={`Hold ${b.batch_number}`}><ShieldAlert size={15} /></button>
                    )}
                    {canQuality && ['Completed', 'Quality Hold'].includes(b.status) && (
                      <button onClick={() => onStatus(b, 'Released')} className={`${iconBtn} hover:text-emerald-700`} title="Release for shipping" aria-label={`Release ${b.batch_number}`}><ShieldCheck size={15} /></button>
                    )}
                    {(canEdit || canQuality) && CANCELLABLE.includes(b.status) && (
                      <button onClick={() => onStatus(b, 'Cancelled')} className={`${iconBtn} hover:text-slate-900`} title="Cancel batch" aria-label={`Cancel ${b.batch_number}`}><Ban size={15} /></button>
                    )}
                    {canEdit && (
                      <button onClick={() => onDelete(b)} className={`${iconBtn} hover:text-red-600`} title="Delete batch" aria-label={`Delete ${b.batch_number}`}><Trash2 size={15} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-slate-400">No production batches yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
