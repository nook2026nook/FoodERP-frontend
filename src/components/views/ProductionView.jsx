import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Pencil, ShieldCheck, ShieldAlert, Ban } from 'lucide-react';
import { batchesAPI, recipesAPI, errorMessage } from '../../api/client';
import { Card, Field, StatusPill, inputClass, fmt, money, qty, todayIso, useDebounced } from '../ui';
import Icon from '../Icon';
import ExportDropdownMenu, { downloadCSV, todayStamp, usePageExport } from '../PageExport';

const EDIT_ROLES = ['Administrator', 'Production Operator'];
const QUALITY_ROLES = ['Administrator', 'Quality Assurance (QA)'];
const BAKING_EDITABLE = ['Planned', 'In Production', 'Completed', 'Quality Hold'];
const PACKAGING_EDITABLE = ['In Production', 'Completed', 'Quality Hold'];
const CANCELLABLE = ['Planned', 'In Production', 'Completed', 'Quality Hold'];
const EMPTY_COUNTS = { boxes_575g: '', bags_575g: '', boxes_312g: '', bags_312g: '' };

/**
 * FIFO over the server's lot list (oldest first), skipping what the other flavor rows in this
 * form already take from each lot, so a lot used up by one flavor isn't suggested again.
 */
const splitsAfterOthers = (requirements, otherRuns = []) => {
  const used = {};
  otherRuns.forEach((run) => Object.values(run.splits || {}).flat().forEach((s) => {
    if (s.lot_id) used[s.lot_id] = (used[s.lot_id] || 0) + (parseFloat(s.quantity) || 0);
  }));
  return Object.fromEntries(requirements.map((r) => {
    let need = Number(r.required) || 0;
    const rows = [];
    for (const lot of r.lots || []) {
      if (need <= 0.0001) break;
      const take = Math.min(need, Number(lot.available) - (used[lot.lot_id] || 0));
      if (take > 0.0001) {
        rows.push({ lot_id: lot.lot_id, quantity: String(Math.round(take * 1e4) / 1e4) });
        need -= take;
      }
    }
    return [r.item_id, rows.length ? rows : [{ lot_id: '', quantity: String(r.required) }]];
  }));
};

/** Flatten editable splits to the API shape. */
const splitsPayload = (splits) => Object.entries(splits).flatMap(([itemId, rows]) =>
  rows.filter((r) => r.lot_id && parseFloat(r.quantity) > 0)
    .map((r) => ({ item_id: itemId, lot_id: r.lot_id, quantity: parseFloat(r.quantity) })));

export default function ProductionView({ currentUserRole, showToast, transferredRuns, onTransferConsumed }) {
  const canEdit = EDIT_ROLES.includes(currentUserRole);
  const canQuality = QUALITY_ROLES.includes(currentUserRole);
  const [tab, setTab] = useState('baking');
  const [recipes, setRecipes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [packagingBatchId, setPackagingBatchId] = useState('');
  const [bakingPrefill, setBakingPrefill] = useState(null);
  const [bakingFormKey, setBakingFormKey] = useState(0);
  const pendingCount = batches.filter((b) => PACKAGING_EDITABLE.includes(b.status) && !b.packaged_at).length;
  const finalCount = batches.filter((b) => PACKAGING_EDITABLE.includes(b.status) && b.packaged_at).length;

  const loadBatches = useCallback(async () => {
    try {
      const { data } = await batchesAPI.getAll();
      setBatches(data);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load batches'), 'error');
    }
  }, [showToast]);

  // A plan sent from Production Planning opens as a new, unsaved baking batch.
  useEffect(() => {
    if (!transferredRuns?.runs?.length) return;
    setBakingPrefill({
      transferred: true,
      runs: transferredRuns.runs.map((run) => ({
        recipe_id: run.recipe_id,
        bins_count: run.bins_large + run.bins_small,
        bins_large_count: run.bins_large,
        bins_small_count: run.bins_small
      })),
      key: transferredRuns.key
    });
    setTab('baking');
    onTransferConsumed?.();
  }, [transferredRuns, onTransferConsumed]);

  useEffect(() => {
    recipesAPI.options()
      .then((r) => setRecipes(r.data))
      .catch((e) => showToast(errorMessage(e, 'Failed to load recipes'), 'error'));
    loadBatches();
  }, [loadBatches, showToast]);

  const openPackaging = (batchNumber) => {
    setPackagingBatchId(batchNumber);
    setTab('packaging');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const editBaking = async (batch) => {
    try {
      const group = batches.filter((item) => item.batch_number === batch.batch_number);
      const runs = await Promise.all(group.map(async (item) => (await batchesAPI.getById(item.id)).data));
      setBakingPrefill({
        batch_number: batch.batch_number,
        production_date: batch.production_date,
        baking_employees: batch.baking_employees || [],
        runs,
        key: Date.now()
      });
      setTab('baking');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load batch group'), 'error');
    }
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

  // One click for QA: release every Completed batch. Quality Hold stays held on purpose.
  const releasable = batches.filter((b) => b.status === 'Completed');
  const releaseAll = async () => {
    if (!window.confirm(`Release all ${releasable.length} Completed batch run(s) for shipping? Batches on Quality Hold are not included.`)) return;
    const failed = [];
    for (const b of releasable) {
      try { await batchesAPI.setStatus(b.id, 'Released'); } catch (e) { failed.push(`${b.batch_number} ${b.recipe_name}: ${errorMessage(e, 'failed')}`); }
    }
    await loadBatches();
    if (failed.length) showToast(`Released ${releasable.length - failed.length}; not released: ${failed.join('; ')}`, 'error');
    else showToast(`Released ${releasable.length} batch run(s) for shipping`);
  };

  const removeBatch = async (batch) => {
    if (!window.confirm(`Delete batch ${batch.batch_number}? All lot stock it used will be put back.`)) return;
    try {
      await batchesAPI.delete(batch.id);
      showToast(`Batch ${batch.batch_number} deleted; inventory refunded`);
      if (packagingBatchId === batch.batch_number) setPackagingBatchId('');
      await loadBatches();
    } catch (e) {
      showToast(errorMessage(e, 'Failed to delete batch'), 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-slate-200 gap-2">
        {[['baking', '🌾 1. Baking Screen (Batch #, Bins & Multi-Lot Splits)', 'bg-amber-600'],
          ['packaging', `📦 2. Packaging & Final Batch Editor (${pendingCount} pending, ${finalCount} final)`, 'bg-blue-600']].map(([id, label, active]) => (
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
          key={bakingPrefill?.key || bakingFormKey}
          prefill={bakingPrefill}
          recipes={recipes}
          canEdit={canEdit}
          showToast={showToast}
          onSaved={async (batch, goToPackaging) => {
            setBakingPrefill(null);
            setBakingFormKey((key) => key + 1);
            await loadBatches();
            if (goToPackaging) openPackaging(batch.batch_number);
          }}
        />
      )}

      {tab === 'packaging' && (
        <PackagingScreen
          batches={batches}
          batchNumber={packagingBatchId}
          setBatchNumber={setPackagingBatchId}
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
        releasableCount={canQuality ? releasable.length : 0}
        onReleaseAll={releaseAll}
        showToast={showToast}
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

const employeesFor = (values = []) => [...values.slice(0, 4), '', '', '', ''].slice(0, 4);

function splitsFromAllocations(allocations = []) {
  return allocations.reduce((result, allocation) => {
    const rows = result[allocation.item_id] || [];
    rows.push({ lot_id: allocation.lot_id, quantity: String(allocation.quantity) });
    result[allocation.item_id] = rows;
    return result;
  }, {});
}

function bakingRunFrom(batch) {
  const totalBins = Number(batch.bins_count) || 40;
  return {
    key: batch.id || `new-${Date.now()}-${Math.random()}`,
    id: batch.id,
    recipe_id: batch.recipe_id || '',
    bins_large: String(batch.bins_large_count ?? Math.floor(totalBins / 2)),
    bins_small: String(batch.bins_small_count ?? Math.ceil(totalBins / 2)),
    scale_basis: batch.scale_basis || '',
    splits: splitsFromAllocations(batch.baking_allocations),
    requirementsReady: false
  };
}

function BakingRunEditor({ row, recipes, selectedRecipeIds, canEdit, onChange, onRemove }) {
  const [requirements, setRequirements] = useState(null);
  const [reqError, setReqError] = useState('');
  const [loading, setLoading] = useState(false);
  const recipe = recipes.find((item) => item.id === row.recipe_id);
  const bins = (parseFloat(row.bins_large) || 0) + (parseFloat(row.bins_small) || 0);
  const basis = row.scale_basis || recipe?.scale_basis || 'batch';
  const requestSignature = JSON.stringify({ recipeId: row.recipe_id, bins, basis, batchId: row.id });
  const latestSignature = useRef(requestSignature);
  latestSignature.current = requestSignature;
  const query = useDebounced(requestSignature, 250);

  useEffect(() => {
    const q = JSON.parse(query);
    if (!q.recipeId || !(q.bins > 0)) {
      setRequirements(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    batchesAPI.bakingRequirements({
      recipe_id: q.recipeId, bins_count: q.bins, scale_basis: q.basis, batch_id: q.batchId || undefined
    })
      .then(({ data }) => {
        if (!active || latestSignature.current !== query) return;
        setRequirements(data);
        setReqError('');
        onChange((current, others) => ({
          ...current,
          requirementsReady: true,
          splits: Object.keys(current.splits || {}).length ? current.splits : splitsAfterOthers(data.requirements, others)
        }));
      })
      .catch((e) => {
        if (!active || latestSignature.current !== query) return;
        setRequirements(null);
        onChange((current) => ({ ...current, requirementsReady: false }));
        setReqError(errorMessage(e, 'Could not calculate ingredient needs'));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);

  const updateSplit = (itemId, splits) => onChange({
    ...row, splits: { ...row.splits, [itemId]: splits }
  });
  const updateBins = (field, value) => onChange({ ...row, [field]: value, splits: {}, requirementsReady: false });

  return (
    <tr className="align-top even:bg-amber-50/30">
      <td className="min-w-52 border-r p-3">
        <select
          aria-label="Flavor"
          value={row.recipe_id}
          onChange={(e) => onChange({ ...row, recipe_id: e.target.value, scale_basis: '', splits: {}, requirementsReady: false })}
          className={`${inputClass} min-w-48 font-semibold`}
          disabled={!canEdit}
        >
          <option value="">Select flavor…</option>
          {recipes.map((item) => (
            <option key={item.id} value={item.id} disabled={item.id !== row.recipe_id && selectedRecipeIds.has(item.id)}>
              {item.name}
            </option>
          ))}
        </select>
        {row.recipe_id && <div className="mt-1 text-[10px] text-slate-500">Scale: {basis === 'bin' ? 'per bin' : 'per 2-bin batch'}</div>}
        <button type="button" onClick={onRemove} disabled={!canEdit} className="mt-2 text-[11px] font-bold text-rose-600 disabled:opacity-50">
          Remove flavor
        </button>
      </td>
      <td className="min-w-[30rem] border-r p-3">
        {reqError && <p className="text-xs font-bold text-rose-600">{reqError}</p>}
        {loading && <p className="text-xs text-slate-500">Calculating ingredient needs…</p>}
        {requirements?.requirements.map((requirement) => (
          <div key={requirement.item_id} className="mb-2 last:mb-0">
            <SplitEditor
              requirement={requirement}
              rows={row.splits[requirement.item_id] || []}
              onChange={(splits) => updateSplit(requirement.item_id, splits)}
              disabled={!canEdit}
            />
          </div>
        ))}
        {requirements && <div className="mt-2 text-right text-[11px] font-bold text-slate-600">
          Dough: {fmt(requirements.theoretical_dough_grams / 1000, 2)} kg
        </div>}
      </td>
      <td className="w-36 border-r bg-indigo-50/30 p-3">
        <input aria-label="Bins for 575g products" type="number" step="any" min="0" value={row.bins_large}
          onChange={(e) => updateBins('bins_large', e.target.value)} className={`${inputClass} text-center font-bold`} disabled={!canEdit} />
        <span className="mt-1 block text-center text-[10px] text-indigo-800">575g products</span>
      </td>
      <td className="w-36 border-r bg-emerald-50/30 p-3">
        <input aria-label="Bins for 312g products" type="number" step="any" min="0" value={row.bins_small}
          onChange={(e) => updateBins('bins_small', e.target.value)} className={`${inputClass} text-center font-bold`} disabled={!canEdit} />
        <span className="mt-1 block text-center text-[10px] text-emerald-800">312g products</span>
      </td>
    </tr>
  );
}

function BakingScreen({ prefill, recipes, canEdit, showToast, onSaved }) {
  const [batchNumber, setBatchNumber] = useState(prefill?.batch_number || '');
  const [productionDate, setProductionDate] = useState(prefill?.production_date || todayIso());
  const [employees, setEmployees] = useState(() => employeesFor(prefill?.baking_employees || []));
  const [runs, setRuns] = useState(() => prefill?.runs?.length
    ? prefill.runs.map(bakingRunFrom)
    : [bakingRunFrom({})]);
  const [saving, setSaving] = useState(false);

  const selectedRecipeIds = new Set(runs.map((run) => run.recipe_id).filter(Boolean));
  // Functional updates also get the other rows, so lot suggestions can skip what they use.
  const updateRun = (index, next) => setRuns((current) => current.map((run, i) => (
    i === index ? (typeof next === 'function' ? next(run, current.filter((_, j) => j !== index)) : next) : run
  )));
  const updateEmployee = (index, value) => setEmployees((current) => current.map((name, i) => (i === index ? value : name)));

  const generateNumber = () => {
    const dateCode = productionDate.replace(/-/g, '').slice(2);
    const generated = `BATCH-${dateCode}-${Math.floor(100 + Math.random() * 900)}`;
    setBatchNumber(generated);
    showToast(`Auto-generated Batch #${generated}`);
  };

  const validEmployees = employees.map((name) => name.trim()).filter(Boolean);
  const save = async (goToPackaging) => {
    if (!batchNumber.trim()) { showToast('Enter a production batch number', 'error'); return; }
    if (!validEmployees.length) { showToast('Enter at least one employee name', 'error'); return; }
    if (!runs.length || runs.some((run) => !run.recipe_id)) { showToast('Select a flavor for every row', 'error'); return; }
    if (runs.some((run) => !run.requirementsReady)) { showToast('Wait for ingredient requirements to finish loading', 'error'); return; }
    if (new Set(runs.map((run) => run.recipe_id)).size !== runs.length) {
      showToast('Each flavor can only be listed once under a batch number', 'error'); return;
    }
    if (runs.some((run) => (parseFloat(run.bins_large) || 0) + (parseFloat(run.bins_small) || 0) <= 0)) {
      showToast('Enter at least one bin for every flavor', 'error'); return;
    }
    setSaving(true);
    try {
      const { data } = await batchesAPI.saveBakingGroup({
        batch_number: batchNumber.trim(),
        original_batch_number: prefill?.batch_number,
        production_date: productionDate,
        baking_employees: validEmployees,
        runs: runs.map((run) => ({
          id: run.id,
          recipe_id: run.recipe_id,
          bins_large: parseFloat(run.bins_large) || 0,
          bins_small: parseFloat(run.bins_small) || 0,
          scale_basis: run.scale_basis || recipes.find((recipe) => recipe.id === run.recipe_id)?.scale_basis || 'batch',
          splits: splitsPayload(run.splits)
        }))
      });
      showToast(`Batch #${data.batch_number} saved with ${data.runs.length} flavor(s)`);
      await onSaved(data, goToPackaging);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to save baking batch'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const plan = async () => {
    if (!batchNumber.trim()) { showToast('Enter a production batch number', 'error'); return; }
    if (runs.length !== 1 || !runs[0].recipe_id) { showToast('Reserve as Planned requires exactly one selected flavor', 'error'); return; }
    const binsCount = (parseFloat(runs[0].bins_large) || 0) + (parseFloat(runs[0].bins_small) || 0);
    setSaving(true);
    try {
      const { data } = await batchesAPI.plan({
        batch_number: batchNumber.trim(),
        recipe_id: runs[0].recipe_id,
        production_date: productionDate,
        bins_count: binsCount,
        scale_basis: runs[0].scale_basis || recipes.find((recipe) => recipe.id === runs[0].recipe_id)?.scale_basis || 'batch'
      });
      showToast(`Batch #${data.batch_number} reserved as Planned`);
      await onSaved({ batch_number: data.batch_number }, false);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to plan batch'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-600 px-6 py-3.5 text-white">
        <h3 className="text-sm font-black uppercase tracking-wide">
          {prefill?.batch_number ? `Edit Baking Batch #${prefill.batch_number}` : prefill?.transferred ? 'Production Baking Screen (from Production Plan)' : 'Production Baking Screen'}
        </h3>
        {prefill && <button type="button" onClick={() => onSaved(null, false)} className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-amber-900">{prefill.transferred ? 'Discard plan' : 'Cancel edit'}</button>}
      </div>
      <div className="space-y-4 border-b border-amber-200 bg-amber-50/70 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Batch # *" htmlFor="bk-number">
            <div className="flex gap-2">
              <input id="bk-number" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} className={`${inputClass} font-mono font-bold`} maxLength={100} disabled={!canEdit} required />
              {canEdit && <button type="button" onClick={generateNumber} className="whitespace-nowrap rounded-lg border bg-white px-3 text-xs font-bold">Auto-generate</button>}
            </div>
          </Field>
          <Field label="Production date *" htmlFor="bk-date">
            <input id="bk-date" type="date" value={productionDate} onChange={(e) => setProductionDate(e.target.value)} className={inputClass} disabled={!canEdit} required />
          </Field>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-extrabold uppercase text-amber-950">Employees who worked on this batch *</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            {employees.map((name, index) => (
              <input key={index} value={name} onChange={(e) => updateEmployee(index, e.target.value)}
                placeholder={`Employee ${index + 1}${index === 0 ? ' *' : ''}`} className={inputClass} disabled={!canEdit} />
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-slate-900 text-[10px] font-extrabold uppercase text-white">
            <tr>
              <th className="border-r border-slate-700 px-4 py-3">Flavor / formulation</th>
              <th className="border-r border-slate-700 px-4 py-3">Ingredients and lot splits</th>
              <th className="border-r border-slate-700 px-4 py-3 text-center">Bins for 575g</th>
              <th className="px-4 py-3 text-center">Bins for 312g</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {runs.map((run, index) => (
              <BakingRunEditor
                key={run.key}
                row={run}
                recipes={recipes}
                selectedRecipeIds={selectedRecipeIds}
                canEdit={canEdit}
                onChange={(next) => updateRun(index, next)}
                onRemove={() => setRuns((current) => current.filter((_, i) => i !== index))}
              />
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 p-4">
          <button type="button" onClick={() => setRuns((current) => [...current, bakingRunFrom({})])} className="rounded-xl border border-amber-300 bg-amber-100 px-4 py-2.5 text-xs font-extrabold text-amber-950">
            + Add another flavor
          </button>
          <div className="flex flex-wrap gap-2">
            {!prefill && <button type="button" disabled={saving} onClick={plan} className="rounded-lg border bg-white px-4 py-2.5 text-xs font-bold disabled:opacity-50">Reserve as Planned</button>}
            <button type="button" disabled={saving || runs.some((run) => !run.recipe_id || !run.requirementsReady)} onClick={() => save(false)} className="rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">Save Baking Batch</button>
            <button type="button" disabled={saving || runs.some((run) => !run.recipe_id || !run.requirementsReady)} onClick={() => save(true)} className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">Save &amp; Go to Packaging</button>
          </div>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Packaging screen
// ---------------------------------------------------------------------------

function packagingRunFrom(batch) {
  return {
    batch_id: batch.id,
    recipe_name: batch.recipe_name,
    bins_count: batch.bins_count,
    status: batch.status,
    boxes_575g: String(batch.boxes_575g ?? 0),
    bags_575g: String(batch.bags_575g ?? 0),
    boxes_312g: String(batch.boxes_312g ?? 0),
    bags_312g: String(batch.bags_312g ?? 0),
    splits: {},
    result: null
  };
}

function PackagingRunEditor({ row, onChange, canEdit }) {
  const [error, setError] = useState('');
  const counts = Object.fromEntries(Object.entries(EMPTY_COUNTS).map(([key]) =>
    [key, Math.max(0, parseInt(row[key], 10) || 0)]));
  const requestSignature = JSON.stringify({ id: row.batch_id, ...counts });
  const latestSignature = useRef(requestSignature);
  latestSignature.current = requestSignature;
  const query = useDebounced(requestSignature, 250);

  useEffect(() => {
    const { id, ...queryCounts } = JSON.parse(query);
    if (!id) return;
    let active = true;
    batchesAPI.packagingRequirements(id, queryCounts)
      .then(({ data }) => {
        if (!active || latestSignature.current !== query) return;
        setError('');
        onChange((current, others) => ({
          ...current,
          result: data,
          splits: Object.keys(current.splits || {}).length
            ? current.splits
            : splitsAfterOthers(data.requirements.filter((requirement) => requirement.required > 0), others)
        }));
      })
      .catch((e) => { if (active && latestSignature.current === query) setError(errorMessage(e, 'Could not calculate packaging')); });
    return () => { active = false; };
  }, [query]);

  const setCount = (field, value) => onChange({
    ...row, [field]: value, result: null, splits: {}
  });
  const requirements = row.result?.requirements.filter((requirement) => requirement.required > 0) || [];

  return (
    <tr className="align-top even:bg-blue-50/30">
      <td className="min-w-52 border-r p-3">
        <div className="font-extrabold text-slate-900">{row.recipe_name}</div>
        <div className="mt-1 text-[11px] text-slate-600">{Number(row.bins_count)} bins · {row.status}</div>
      </td>
      <td className="min-w-[30rem] border-r p-3">
        {error && <p className="mb-2 text-xs font-bold text-rose-600">{error}</p>}
        {requirements.map((requirement) => (
          <div key={requirement.item_id} className="mb-2 last:mb-0">
            <SplitEditor
              requirement={requirement}
              rows={row.splits[requirement.item_id] || []}
              onChange={(splits) => onChange({ ...row, splits: { ...row.splits, [requirement.item_id]: splits } })}
              disabled={!canEdit}
            />
          </div>
        ))}
        {row.result && !requirements.length && <span className="text-xs text-slate-400">No packaging materials required.</span>}
      </td>
      {[
        ['boxes_575g', 'bags_575g', 'border-r bg-indigo-50/30'],
        ['boxes_312g', 'bags_312g', 'bg-emerald-50/30']
      ].map(([boxesKey, bagsKey, tone]) => (
        <td key={boxesKey} className={`min-w-52 p-3 ${tone}`}>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-extrabold uppercase">
              Boxes
              <input aria-label={`${row.recipe_name} boxes`} type="number" min="0" step="1" value={row[boxesKey]}
                onChange={(e) => setCount(boxesKey, e.target.value)} className={`${inputClass} mt-1 text-center`} disabled={!canEdit} />
            </label>
            <label className="text-[10px] font-extrabold uppercase">
              Bags
              <input aria-label={`${row.recipe_name} loose bags`} type="number" min="0" step="1" value={row[bagsKey]}
                onChange={(e) => setCount(bagsKey, e.target.value)} className={`${inputClass} mt-1 text-center`} disabled={!canEdit} />
            </label>
          </div>
          <span className="mt-1 block text-center text-[10px] text-slate-500">1 box = 12 bags</span>
        </td>
      ))}
    </tr>
  );
}

function GroupReconciliationPanel({ batchNumber, runs }) {
  if (!runs.length || runs.some((run) => !run.result)) {
    return <div className="rounded-2xl bg-slate-900 p-5 text-xs text-slate-300">Calculating live packaging totals…</div>;
  }
  const sum = (getValue) => runs.reduce((total, run) => total + Number(getValue(run) || 0), 0);
  const theoretical = sum((run) => run.result.theoretical_dough_grams);
  const packaged = sum((run) => run.result.packaged_weight_grams);
  const delta = packaged - theoretical;
  const variance = delta > 50 ? 'Over-Yield' : delta < -50 ? 'Scrap / Loss' : 'Balanced';
  const varianceTone = variance === 'Balanced' ? 'border-emerald-800 bg-emerald-950/60 text-emerald-400'
    : variance === 'Over-Yield' ? 'border-rose-800 bg-rose-950/60 text-rose-400'
      : 'border-amber-800 bg-amber-950/60 text-amber-400';
  const grossMaterial = sum((run) => run.result.run_cost.gross_material_cost);
  const packagingCost = sum((run) => run.result.cost.total);
  const wastage = sum((run) => run.result.run_cost.wastage_cost);
  const net = grossMaterial + packagingCost - wastage;

  return (
    <section className="space-y-3 rounded-2xl bg-slate-900 p-5 text-white shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">Live Packaging Delta &amp; Cost Reconciliation — Batch #{batchNumber}</h4>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{runs.length} flavor run(s)</span>
      </div>
      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-3">
          <span className="block text-[10px] font-bold uppercase text-slate-400">Theoretical batch dough</span>
          <b className="text-base">{fmt(theoretical, 0)} g</b>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-3">
          <span className="block text-[10px] font-bold uppercase text-slate-400">Total packaged weight</span>
          <b className="text-base text-emerald-400">{fmt(packaged, 0)} g</b>
        </div>
        <div className={`rounded-xl border p-3 ${varianceTone}`}>
          <span className="block text-[10px] font-bold uppercase text-slate-400">Live variance</span>
          <b className="text-base">{delta > 0 ? '+' : ''}{fmt(delta, 0)} g · {variance}</b>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        {[['Gross material', grossMaterial], ['Packaging materials', packagingCost], ['Less wastage', -wastage], ['Net production cost', net]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
            <span className="block text-[10px] font-bold uppercase text-slate-400">{label}</span>
            <b className="font-mono">{money(value)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function PackagingScreen({ batches, batchNumber, setBatchNumber, canEdit, showToast, onSaved }) {
  const [packagingDate, setPackagingDate] = useState(todayIso());
  const [employees, setEmployees] = useState(['', '', '', '']);
  const [runs, setRuns] = useState([]);
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => {
    const grouped = new Map();
    batches.filter((batch) => PACKAGING_EDITABLE.includes(batch.status)).forEach((batch) => {
      const current = grouped.get(batch.batch_number) || [];
      current.push(batch);
      grouped.set(batch.batch_number, current);
    });
    return [...grouped.entries()].map(([number, rows]) => ({ number, rows }));
  }, [batches]);
  const selectedGroup = groups.find((group) => group.number === batchNumber);

  useEffect(() => {
    if (!selectedGroup) {
      setRuns([]);
      return;
    }
    const first = selectedGroup.rows[0];
    setPackagingDate(first.packaging_date ? String(first.packaging_date).slice(0, 10) : todayIso());
    setEmployees(employeesFor(first.packaging_employees || []));
    setRuns(selectedGroup.rows.map(packagingRunFrom));
  }, [batchNumber, batches]);

  // Functional updates also get the other rows, so lot suggestions can skip what they use.
  const updateRun = (index, next) => setRuns((current) => current.map((run, i) => (
    i === index ? (typeof next === 'function' ? next(run, current.filter((_, j) => j !== index)) : next) : run
  )));
  const updateEmployee = (index, value) => setEmployees((current) => current.map((name, i) => (i === index ? value : name)));

  const save = async (e) => {
    e.preventDefault();
    const validEmployees = employees.map((name) => name.trim()).filter(Boolean);
    if (!batchNumber || !runs.length) { showToast('Select a batch to package', 'error'); return; }
    if (!validEmployees.length) { showToast('Enter at least one employee name', 'error'); return; }
    if (runs.some((run) => !run.result)) { showToast('Wait for packaging requirements to finish loading', 'error'); return; }
    setSaving(true);
    try {
      const { data } = await batchesAPI.savePackagingGroup({
        batch_number: batchNumber,
        packaging_date: packagingDate,
        packaging_employees: validEmployees,
        runs: runs.map((run) => ({
          batch_id: run.batch_id,
          boxes_575g: parseInt(run.boxes_575g, 10) || 0,
          bags_575g: parseInt(run.bags_575g, 10) || 0,
          boxes_312g: parseInt(run.boxes_312g, 10) || 0,
          bags_312g: parseInt(run.bags_312g, 10) || 0,
          splits: splitsPayload(run.splits)
        }))
      });
      showToast(`Packaging saved for Batch #${data.batch_number} (${data.runs.length} flavor(s))`);
      await onSaved();
    } catch (e) {
      showToast(errorMessage(e, 'Failed to save packaging'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-blue-600 px-6 py-3.5 text-white">
        <h3 className="text-sm font-black uppercase tracking-wide">Production Packaging Screen</h3>
        <p className="mt-0.5 text-[11px] text-blue-100">Choose a baking batch to load all of its flavors and package them together.</p>
      </div>
      <div className="space-y-4 border-b border-blue-200 bg-blue-50/70 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Batch # (from Baking) *" htmlFor="pk-batch">
            <select id="pk-batch" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} className={`${inputClass} font-mono font-bold`}>
              <option value="">Select saved baking batch…</option>
              {groups.map((group) => (
                <option key={group.number} value={group.number}>
                  {group.number} ({group.rows.length} flavor{group.rows.length === 1 ? '' : 's'}: {group.rows.map((run) => run.recipe_name).join(', ')})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Packaging date *" htmlFor="pk-date">
            <input id="pk-date" type="date" value={packagingDate} onChange={(e) => setPackagingDate(e.target.value)} className={inputClass} disabled={!canEdit} required />
          </Field>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-extrabold uppercase text-blue-950">Employees who worked on packaging *</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            {employees.map((name, index) => (
              <input key={index} value={name} onChange={(e) => updateEmployee(index, e.target.value)}
                placeholder={`Employee ${index + 1}${index === 0 ? ' *' : ''}`} className={inputClass} disabled={!canEdit} />
            ))}
          </div>
        </div>
      </div>
      {selectedGroup && runs.length > 0 ? (
        <>
          <div className="m-5">
            <GroupReconciliationPanel batchNumber={batchNumber} runs={runs} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-900 text-[10px] font-extrabold uppercase text-white">
                <tr>
                  <th className="border-r border-slate-700 px-4 py-3">Flavors from baking</th>
                  <th className="border-r border-slate-700 px-4 py-3">Packaging materials and lot splits</th>
                  <th className="border-r border-slate-700 px-4 py-3 text-center">575g boxes / bags</th>
                  <th className="px-4 py-3 text-center">312g boxes / bags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {runs.map((run, index) => (
                  <PackagingRunEditor key={run.batch_id} row={run} canEdit={canEdit} onChange={(next) => updateRun(index, next)} />
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="flex justify-end border-t bg-slate-50 p-4">
              <button type="submit" disabled={saving || runs.some((run) => !run.result)} className="rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">
                Save Packaging for Batch #{batchNumber}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="p-10 text-center text-xs text-slate-500">
          {groups.length ? <>Select a saved <b>Batch #</b> above to load its baked flavors.</> : 'No baked batches waiting for packaging.'}
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Batch log
// ---------------------------------------------------------------------------

function BatchLog({ batches, canEdit, canQuality, onEditBaking, onPackaging, onStatus, onDelete, showToast, releasableCount = 0, onReleaseAll }) {
  const iconBtn = 'p-1 rounded hover:bg-slate-100';
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return batches;
    return batches.filter((b) => [
      b.batch_number, b.production_date, b.recipe_name, b.status, Number(b.bins_count), Number(b.bins_count) / 2
    ].some((v) => String(v ?? '').toLowerCase().includes(term)));
  }, [batches, searchTerm]);

  const exportCSV = () => {
    const rows = [[
      'Batch Number', 'Production Date', 'Formulation', 'Bins Count', 'Batches Count', '575g Boxes', '575g Bags', '312g Boxes', '312g Bags',
      'Gross Material Cost ($)', 'Packaging Cost ($)', 'Gross Production Cost ($)', 'Less Wastage Cost ($)', 'Net Production Cost ($)', 'Status'
    ]];
    filtered.forEach((b) => rows.push([
      b.batch_number, String(b.production_date).slice(0, 10), b.recipe_name, Number(b.bins_count), Number(b.bins_count) / 2,
      b.boxes_575g ?? 0, b.bags_575g ?? 0, b.boxes_312g ?? 0, b.bags_312g ?? 0,
      Number(b.gross_material_cost || 0).toFixed(2), Number(b.packaging_cost || 0).toFixed(2), Number(b.gross_production_cost || 0).toFixed(2),
      Number(b.wastage_cost || 0).toFixed(2), Number(b.net_production_cost || 0).toFixed(2), b.status
    ]));
    downloadCSV(`Production_Runs_Packaging_Delta_${todayStamp()}.csv`, rows);
    showToast('Production Runs & Live Packaging Delta exported to Excel/CSV!');
  };
  usePageExport(exportCSV);

  return (
    <div id="printable-audit-area" className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-slate-800 text-sm">Production Batches Registry ({filtered.length} of {batches.length})</h4>
          <p className="text-xs text-slate-500 mt-0.5">Search across batch #, formulation, production date, bin count, and packaging status.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          {releasableCount > 0 && (
            <button type="button" onClick={onReleaseAll} className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold">
              <ShieldCheck size={14} /> Release All for Shipment ({releasableCount})
            </button>
          )}
          <div className="relative">
            <input
              type="text"
              placeholder="Search batch #, formulation, date, status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64 pl-8 pr-3 py-2 border-2 border-emerald-200 rounded-xl text-xs font-semibold bg-emerald-50/30 focus:bg-white focus:outline-none"
            />
            <span className="absolute left-2.5 top-2.5 text-emerald-600"><Icon name="Search" size={14} /></span>
          </div>
          <ExportDropdownMenu onExportExcel={exportCSV} onPrintPDF={() => window.print()} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
            <tr>
              <th className="px-4 py-3.5">Batch # &amp; Date</th>
              <th className="px-4 py-3.5">Formulation (Flavour)</th>
              <th className="px-4 py-3.5">Bins / Scale</th>
              <th className="px-4 py-3.5 text-right">Gross Production Cost</th>
              <th className="px-4 py-3.5 text-right text-rose-600">Less Wastage Total</th>
              <th className="px-4 py-3.5 text-right text-emerald-700">Net Production Cost</th>
              <th className="px-4 py-3.5">Packaged Output</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-right no-print">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((b) => {
              const batchGroup = batches.filter((item) => item.batch_number === b.batch_number);
              const groupCanEdit = batchGroup.every((item) => BAKING_EDITABLE.includes(item.status));
              return (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-mono font-bold text-slate-900">{b.batch_number}</div>
                  <div className="text-[10px] text-slate-400">{String(b.production_date).slice(0, 10)}</div>
                  {batchGroup.length > 1 && <div className="text-[10px] font-bold text-amber-700">{batchGroup.length} formulations in batch</div>}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-800">{b.recipe_name}</td>
                <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">
                  {Number(b.bins_count)} bins ({b.scale_basis === 'bin' ? 'per bin' : `${Number(b.bins_count) / 2} batches`})
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700 whitespace-nowrap">
                  <div>{money(b.gross_production_cost)}</div>
                  <div className="text-[10px] text-slate-400 font-sans">
                    Mat: {money(b.gross_material_cost)}{b.packaged_at ? ` + Pkg: ${money(b.packaging_cost)}` : ''}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                  <div>-{money(b.wastage_cost)}</div>
                  <div className="text-[10px] text-rose-400 font-sans">{fmt(b.wastage_kg, 2)} kg ({b.wastage_percent}%)</div>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-black text-xs">
                    {money(b.net_production_cost)}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px] font-mono text-slate-600 whitespace-nowrap">
                  {b.packaged_at ? (
                    <>
                      <div>575g: {b.boxes_575g}bx/{b.bags_575g}bg &bull; 312g: {b.boxes_312g}bx/{b.bags_312g}bg</div>
                      <div className={`font-sans font-bold ${b.variance_status === 'Balanced' ? 'text-emerald-700' : 'text-rose-600'}`}>
                        Δ {Number(b.variance_delta_grams) > 0 ? '+' : ''}{fmt(b.variance_delta_grams, 0)} g · {b.variance_status}
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-400 italic">Pending Packaging</span>
                  )}
                </td>
                <td className="px-4 py-3"><StatusPill status={b.status} /></td>
                <td className="px-4 py-3 no-print">
                  <div className="flex justify-end gap-1 text-slate-500">
                    {canEdit && groupCanEdit && (
                      <button onClick={() => onEditBaking(b)} className={`${iconBtn} hover:text-amber-700`} title="Edit all formulations in this batch" aria-label={`Edit baking for ${b.batch_number}`}><Pencil size={15} /></button>
                    )}
                    {canEdit && PACKAGING_EDITABLE.includes(b.status) && (
                      <button onClick={() => onPackaging(b.batch_number)} className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-lg transition" title={b.packaged_at ? 'Edit packaging' : 'Package'} aria-label={`Packaging for ${b.batch_number}`}>
                        {b.packaged_at ? 'Edit Pkg' : 'Package'}
                      </button>
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
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-slate-400">
                  {batches.length === 0 ? 'No production batches yet.' : `No production batches found matching "${searchTerm}".`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
