import { useEffect, useMemo, useState } from 'react';
import { planningAPI, recipesAPI, errorMessage } from '../../api/client';
import { Card, Field, inputClass, fmt, qty, todayIso, useDebounced } from '../ui';
import Icon from '../Icon';
import { downloadCSV, todayStamp, usePageExport } from '../PageExport';

// Ported from the client's v60 prototype "Production Planning": customer box
// orders -> net boxes after released stock -> gross dough with wastage ->
// batches in half-batch steps (2 bins each) -> material pull list against live lot stock.
// The server does the math (POST /planning/calculate) so it matches Production.

const EDIT_ROLES = ['Administrator', 'Production Operator'];

const newLine = (recipeId = '') => ({
  key: `line-${Date.now()}-${Math.random()}`,
  recipe_id: recipeId,
  pack_size: '575',
  boxes_ordered: '',
  in_stock_override: ''
});

const linePayload = (line) => ({
  recipe_id: line.recipe_id,
  pack_size: line.pack_size,
  boxes_ordered: Math.max(0, Math.trunc(Number(line.boxes_ordered) || 0)),
  in_stock_override: line.in_stock_override === '' || line.in_stock_override === null || line.in_stock_override === undefined
    ? null
    : Math.max(0, Math.trunc(Number(line.in_stock_override) || 0))
});

const lineFromSaved = (line) => ({
  ...newLine(line.recipe_id),
  pack_size: line.pack_size,
  boxes_ordered: String(line.boxes_ordered ?? ''),
  in_stock_override: line.in_stock_override === null || line.in_stock_override === undefined ? '' : String(line.in_stock_override)
});

export default function ProductionPlanningView({ currentUserRole, showToast, canOpenProduction, onTransferToBaking }) {
  const canEdit = EDIT_ROLES.includes(currentUserRole);
  const [recipes, setRecipes] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(todayIso());
  const [deductInventory, setDeductInventory] = useState(true);
  const [lines, setLines] = useState([newLine()]);
  const [result, setResult] = useState(null);
  const [calcError, setCalcError] = useState('');
  const [calculating, setCalculating] = useState(false);

  const [plan, setPlan] = useState(null); // the saved plan being edited: { id, title, status }
  const [plans, setPlans] = useState([]);
  const [saveDialog, setSaveDialog] = useState(null); // { title, finalize }
  const [showLoad, setShowLoad] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = plan?.status === 'Finalized';

  useEffect(() => {
    recipesAPI.options()
      .then(({ data }) => {
        setRecipes(data);
        setLines((current) => current.map((line) => (line.recipe_id ? line : { ...line, recipe_id: data[0]?.id || '' })));
      })
      .catch((e) => showToast(errorMessage(e, 'Failed to load flavors'), 'error'));
  }, [showToast]);

  const loadPlans = async () => {
    try {
      const { data } = await planningAPI.listPlans();
      setPlans(data);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load saved plans'), 'error');
    }
  };
  useEffect(() => { loadPlans(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalculate (debounced) whenever the order changes.
  const valid = lines.filter((line) => line.recipe_id && Number(line.boxes_ordered) > 0);
  // Each line carries its row key so results attach to the right row (the server ignores it).
  const request = useDebounced(JSON.stringify({ deduct_inventory: deductInventory, lines: valid.map((line) => ({ ...linePayload(line), key: line.key })) }), 350);
  useEffect(() => {
    const body = JSON.parse(request);
    if (!body.lines.length) { setResult(null); setCalcError(''); return; }
    let active = true;
    setCalculating(true);
    planningAPI.calculate(body)
      .then(({ data }) => { if (active) { setResult({ ...data, keys: body.lines.map((line) => line.key) }); setCalcError(''); } })
      .catch((e) => { if (active) { setResult(null); setCalcError(errorMessage(e, 'Could not calculate the plan')); } })
      .finally(() => { if (active) setCalculating(false); });
    return () => { active = false; };
  }, [request]);

  const lineResults = useMemo(() => {
    const map = new Map();
    if (!result) return map;
    result.keys.forEach((key, i) => { if (result.lines[i]) map.set(key, result.lines[i]); });
    return map;
  }, [result]);

  const recipeName = (id) => recipes.find((r) => r.id === id)?.name || '';
  const flavors = result?.flavors || [];
  const totals = result?.totals;

  const updateLine = (index, patch) => {
    if (locked) return;
    setLines((current) => current.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, ...patch };
      // A typed in-stock count belongs to one flavor/format.
      if ('recipe_id' in patch || 'pack_size' in patch) next.in_stock_override = '';
      return next;
    }));
  };

  // ---- saved plans ----
  const planBody = (title, status) => ({
    title,
    customer_name: customerName || null,
    po_number: poNumber || null,
    delivery_date: deliveryDate || null,
    deduct_inventory: deductInventory,
    order_lines: valid.map(linePayload),
    status
  });

  const savePlan = async (title, status) => {
    if (!valid.length) { showToast('Enter boxes ordered for at least one flavor', 'error'); return null; }
    setBusy(true);
    try {
      const { data } = plan?.id
        ? await planningAPI.updatePlan(plan.id, planBody(title, status))
        : await planningAPI.createPlan(planBody(title, status));
      setPlan({ id: data.id, title: data.title, status: data.status });
      await loadPlans();
      return data;
    } catch (e) {
      showToast(errorMessage(e, 'Failed to save the plan'), 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const confirmSave = async () => {
    const title = saveDialog.title.trim()
      || `${customerName || 'General'} order (${deliveryDate || todayIso()})`;
    const saved = await savePlan(title, saveDialog.finalize ? 'Finalized' : 'Draft');
    if (saved) {
      setSaveDialog(null);
      showToast(saveDialog.finalize ? `Plan "${saved.title}" finalized` : `Plan "${saved.title}" saved as draft`);
    }
  };

  const finalize = () => {
    if (!plan?.id) { setSaveDialog({ title: '', finalize: true }); return; }
    savePlan(plan.title, 'Finalized').then((saved) => saved && showToast('Plan finalized and locked'));
  };

  const unfinalize = () => {
    savePlan(plan.title, 'Draft').then((saved) => saved && showToast('Plan is back in Draft for editing'));
  };

  const openPlan = (saved) => {
    setPlan({ id: saved.id, title: saved.title, status: saved.status });
    setCustomerName(saved.customer_name || '');
    setPoNumber(saved.po_number || '');
    setDeliveryDate(saved.delivery_date ? String(saved.delivery_date).slice(0, 10) : todayIso());
    setDeductInventory(saved.deduct_inventory !== false);
    setLines(saved.order_lines?.length ? saved.order_lines.map(lineFromSaved) : [newLine(recipes[0]?.id)]);
    setShowLoad(false);
    showToast(`Loaded plan "${saved.title}"`);
  };

  const deletePlan = async (saved) => {
    if (!window.confirm(`Delete plan "${saved.title}"?`)) return;
    try {
      await planningAPI.deletePlan(saved.id);
      if (plan?.id === saved.id) setPlan(null);
      await loadPlans();
      showToast('Plan deleted');
    } catch (e) {
      showToast(errorMessage(e, 'Failed to delete the plan'), 'error');
    }
  };

  const startNew = () => {
    setPlan(null);
    setCustomerName('');
    setPoNumber('');
    setDeliveryDate(todayIso());
    setDeductInventory(true);
    setLines([newLine(recipes[0]?.id)]);
  };

  // ---- transfer & export ----
  const transfer = () => {
    const runs = flavors.filter((f) => f.scheduled_batches > 0)
      .map((f) => ({ recipe_id: f.recipe_id, bins_large: f.bins_large, bins_small: f.bins_small }));
    if (!runs.length) { showToast('Nothing to bake: enter boxes ordered beyond what is in stock', 'error'); return; }
    onTransferToBaking(runs);
  };

  const exportCSV = () => {
    if (!flavors.length) { showToast('Nothing to export yet', 'error'); return; }
    const rows = [
      ['Production Plan', plan?.title || ''],
      ['Customer', customerName, 'PO', poNumber, 'Delivery', deliveryDate],
      [],
      ['Flavor', 'Batch Size (kg)', 'Wastage %', 'Net 575g Boxes', 'Net 312g Boxes', 'Net Bags', 'Net Weight (kg)',
        'Gross Mix (kg)', 'Exact Batches', 'Scheduled Batches', 'Bins', 'Bins 575g', 'Bins 312g'],
      ...flavors.map((f) => [f.recipe_name, f.batch_size_kg, f.wastage_percent, f.net_boxes_575g, f.net_boxes_312g, f.net_bags,
        f.net_kg, f.gross_kg, f.exact_batches, f.scheduled_batches, f.scheduled_bins, f.bins_large, f.bins_small]),
      ['TOTAL', '', '', '', '', totals.net_bags, totals.net_kg, totals.gross_kg, totals.exact_batches, totals.scheduled_batches, totals.scheduled_bins],
      [],
      ['Pull List', 'Material', 'Required', 'In Stock', 'Shortage', 'Unit'],
      ...flavors.flatMap((f) => [...f.ingredients, ...f.packaging].map((m) => [
        f.recipe_name, m.item_name, m.required, m.available, m.shortage, m.unit_type
      ]))
    ];
    downloadCSV(`Production_Plan_${todayStamp()}.csv`, rows);
    showToast('Production plan exported');
  };
  usePageExport(exportCSV);

  return (
    <div className="space-y-6 max-w-7xl pb-16">
      {/* Plan toolbar */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl"><Icon name="FilePen" size={22} /></div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-sm">{plan?.title || 'New production plan'}</h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${locked ? 'bg-emerald-500 text-slate-950' : 'bg-amber-400/20 text-amber-300 border border-amber-400/30'}`}>
                {locked ? '● Finalized' : plan?.id ? 'Draft (saved)' : 'Draft (not saved)'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {locked ? 'This plan is finalized and locked. Unfinalize it to edit.' : 'Save as a draft any time, come back later, then finalize when the order is confirmed. Plans do not reserve stock.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && !locked && (
            <button type="button" disabled={busy} onClick={() => (plan?.id ? savePlan(plan.title, 'Draft').then((s) => s && showToast('Draft saved')) : setSaveDialog({ title: '', finalize: false }))}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">
              <Icon name="Save" size={14} /> {plan?.id ? 'Save Draft' : 'Save as Draft'}
            </button>
          )}
          <button type="button" onClick={() => { loadPlans(); setShowLoad(true); }}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700">
            <Icon name="FolderOpen" size={14} /> Load Plan ({plans.length})
          </button>
          {plan && (
            <button type="button" onClick={startNew} className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700">
              <Icon name="Plus" size={14} /> New Plan
            </button>
          )}
          {canEdit && (locked ? (
            <button type="button" disabled={busy} onClick={unfinalize} className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">
              <Icon name="RotateCcw" size={14} /> Unfinalize / Edit
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={finalize} className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">
              <Icon name="CheckCircle2" size={14} /> Finalize Plan
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Scheduled Batches" value={`${totals?.scheduled_batches || 0} Batches`} note={`Across ${flavors.length} formulation(s)`} tone="text-slate-900" />
        <Kpi label="Total Bins Required" value={`${totals?.scheduled_bins || 0} Bins`} note="2 bins per scheduled batch" tone="text-emerald-700" />
        <Kpi label="Gross Mix Weight" value={`${fmt(totals?.gross_kg || 0, 1)} kg`} note="Includes the formulation's wastage %" tone="text-blue-700" />
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Box Inventory Offset</div>
          <div className={`text-xs font-extrabold mt-1 ${deductInventory ? 'text-emerald-700' : 'text-slate-600'}`}>
            {deductInventory ? 'Deducting released boxes in stock' : 'Full order (no stock offset)'}
          </div>
          <button type="button" disabled={locked} onClick={() => setDeductInventory((v) => !v)}
            className={`mt-2 text-xs font-bold px-3 py-1.5 rounded-lg border disabled:opacity-50 ${deductInventory ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-700 border-slate-300'}`}>
            {deductInventory ? 'Disable Box Offset' : 'Enable Box Offset'}
          </button>
        </div>
      </div>

      {/* Order entry */}
      <Card
        title={<span className="flex items-center gap-2"><Icon name="ClipboardList" size={18} className="text-emerald-600" /> Order &amp; Box Requirements</span>}
        actions={locked && <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">🔒 Locked (Finalized)</span>}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Customer / Account" htmlFor="pp-customer">
            <input id="pp-customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={locked} placeholder="e.g. Sobeys / Metro / Whole Foods" className={inputClass} maxLength={255} />
          </Field>
          <Field label="PO / Slip #" htmlFor="pp-po">
            <input id="pp-po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} disabled={locked} placeholder="e.g. PO-9824" className={inputClass} maxLength={100} />
          </Field>
          <Field label="Target Delivery Date" htmlFor="pp-date">
            <input id="pp-date" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} disabled={locked} className={inputClass} />
          </Field>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
              <tr>
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Flavor / Formulation</th>
                <th className="px-3 py-2.5">Box Format</th>
                <th className="px-3 py-2.5">Master Boxes Ordered</th>
                <th className="px-3 py-2.5">In Stock (Boxes)</th>
                <th className="px-3 py-2.5">Net Boxes to Bake</th>
                <th className="px-3 py-2.5">Net Bags (12 pk)</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, index) => {
                const r = lineResults.get(line.key);
                const overridden = line.in_stock_override !== '';
                return (
                  <tr key={line.key} className="align-top">
                    <td className="px-3 py-2.5 font-bold text-slate-400">{index + 1}</td>
                    <td className="px-3 py-2.5 min-w-[200px]">
                      <select value={line.recipe_id} onChange={(e) => updateLine(index, { recipe_id: e.target.value })} disabled={locked} className={inputClass}>
                        {!line.recipe_id && <option value="">Select flavor…</option>}
                        {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 min-w-[170px]">
                      <select value={line.pack_size} onChange={(e) => updateLine(index, { pack_size: e.target.value })} disabled={locked} className={inputClass}>
                        <option value="575">575g Master Box (12 bags)</option>
                        <option value="312">312g Master Box (12 bags)</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5 w-32">
                      <input type="number" min="0" step="1" value={line.boxes_ordered} onChange={(e) => updateLine(index, { boxes_ordered: e.target.value })} disabled={locked} placeholder="0" className={`${inputClass} font-bold`} />
                    </td>
                    <td className="px-3 py-2.5 w-40">
                      <input type="number" min="0" step="1" disabled={locked || !deductInventory}
                        value={overridden ? line.in_stock_override : (r ? r.in_stock_boxes : '')}
                        onChange={(e) => updateLine(index, { in_stock_override: e.target.value })}
                        title="Released boxes to take from stock; type to override" className={inputClass} />
                      <div className="text-[10px] text-slate-500 mt-1">
                        Released: <b>{r ? r.system_stock_boxes : '–'}</b>
                        {overridden && !locked && (
                          <button type="button" onClick={() => updateLine(index, { in_stock_override: '' })} className="ml-2 font-bold text-blue-700 underline">Reset</button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-black text-emerald-700 whitespace-nowrap">{r ? `${r.net_boxes} boxes` : '–'}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">{r ? `${r.net_bags} bags` : '–'}</td>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} disabled={locked || lines.length === 1}
                        className="p-1.5 text-slate-300 hover:text-rose-600 disabled:opacity-30" aria-label="Remove line">
                        <Icon name="Trash2" size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setLines((current) => [...current, newLine(recipes[0]?.id)])} disabled={locked}
          className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 disabled:opacity-40">
          <Icon name="Plus" size={15} /> Add Order Line
        </button>
        {calcError && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs font-bold rounded-lg">{calcError}</div>}
      </Card>

      {/* Batch schedule */}
      <Card
        title={<span className="flex items-center gap-2"><Icon name="Cpu" size={18} className="text-blue-600" /> Calculated Batch &amp; Bin Schedule {calculating && <span className="text-[10px] text-slate-400 font-semibold">calculating…</span>}</span>}
        actions={(
          <div className="flex gap-2 flex-wrap">
            {canEdit && canOpenProduction && (
              <button type="button" onClick={transfer} disabled={!flavors.some((f) => f.scheduled_batches > 0)}
                title="Open these flavors and bins on the Baking screen; nothing is saved until you save the batch there"
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                <Icon name="ArrowRightCircle" size={14} /> Transfer Plan to Baking
              </button>
            )}
            <button type="button" onClick={exportCSV} className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <Icon name="FileSpreadsheet" size={14} className="text-emerald-600" /> Export Plan CSV
            </button>
          </div>
        )}
      >
        <p className="text-xs text-slate-500">Net weight ÷ (1 − wastage %) ÷ batch size, rounded up to the next half batch (1 bin). Net boxes subtract only <b>released</b> boxes (same stock as Ready to Ship).</p>
        {!flavors.length ? (
          <div className="p-6 text-center text-xs text-slate-400 border border-dashed rounded-xl">Enter boxes ordered above to see the schedule.</div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                <tr>
                  {['Formulation', 'Batch Size', 'Wastage', 'Net Boxes', 'Net Bags', 'Gross Mix', 'Exact Batches', 'Scheduled', 'Bins (575g / 312g)'].map((h) => <th key={h} className="px-3 py-2.5">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {flavors.map((f) => (
                  <tr key={f.recipe_id}>
                    <td className="px-3 py-2.5 font-bold text-slate-800">{f.recipe_name}</td>
                    <td className="px-3 py-2.5">{fmt(f.batch_size_kg, 1)} kg</td>
                    <td className="px-3 py-2.5">{f.wastage_percent}%</td>
                    <td className="px-3 py-2.5">{f.net_boxes_575g + f.net_boxes_312g} <span className="text-slate-400">({f.net_boxes_575g} / {f.net_boxes_312g})</span></td>
                    <td className="px-3 py-2.5">{f.net_bags}</td>
                    <td className="px-3 py-2.5">{fmt(f.gross_kg, 2)} kg</td>
                    <td className="px-3 py-2.5">{fmt(f.exact_batches, 2)}</td>
                    <td className="px-3 py-2.5 font-black text-emerald-700">{f.scheduled_batches} batches</td>
                    <td className="px-3 py-2.5 font-black text-blue-700">{f.scheduled_bins} bins <span className="font-semibold text-slate-400">({f.bins_large} / {f.bins_small})</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold">
                <tr>
                  <td className="px-3 py-2.5" colSpan={3}>Total schedule</td>
                  <td className="px-3 py-2.5">{totals.net_boxes} boxes</td>
                  <td className="px-3 py-2.5">{totals.net_bags} bags</td>
                  <td className="px-3 py-2.5">{fmt(totals.gross_kg, 2)} kg</td>
                  <td className="px-3 py-2.5">{fmt(totals.exact_batches, 2)}</td>
                  <td className="px-3 py-2.5">{totals.scheduled_batches} batches</td>
                  <td className="px-3 py-2.5">{totals.scheduled_bins} bins</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Pull list */}
      {flavors.some((f) => f.scheduled_batches > 0) && (
        <Card title={<span className="flex items-center gap-2"><Icon name="Boxes" size={18} className="text-amber-600" /> Warehouse Material &amp; Packaging Pull List (Live Stock Check)</span>}>
          <p className="text-xs text-slate-500">Checked against the remaining weight / units of every received lot. Shortages are flagged in red.</p>
          {flavors.filter((f) => f.scheduled_batches > 0).map((f) => (
            <div key={f.recipe_id} className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-extrabold text-sm text-slate-800">{f.recipe_name}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${f.shortages ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {f.shortages ? `⚠️ ${f.shortages} short` : '✓ All in stock'}
                  </span>
                  <span className="text-[11px] font-bold text-slate-600">{f.scheduled_batches} batches ({f.scheduled_bins} bins)</span>
                </div>
              </div>
              <PullList title="Baking ingredients" rows={f.ingredients} />
              <PullList title="Packaging materials" rows={f.packaging} />
            </div>
          ))}
        </Card>
      )}

      {/* Save dialog */}
      {saveDialog && (
        <Modal title={saveDialog.finalize ? 'Save & Finalize Plan' : 'Save Plan as Draft'} onClose={() => setSaveDialog(null)}>
          <Field label="Plan title" htmlFor="pp-title">
            <input id="pp-title" autoFocus value={saveDialog.title} onChange={(e) => setSaveDialog({ ...saveDialog, title: e.target.value })}
              placeholder={`e.g. ${customerName || 'Sobeys'} weekly order`} className={inputClass} maxLength={200} />
          </Field>
          <p className="text-[11px] text-slate-500">Saves the customer details and order lines so anyone with Production Planning can reopen them. Plans never reserve or deduct stock.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSaveDialog(null)} className="px-4 py-2 border rounded-lg text-xs font-bold">Cancel</button>
            <button type="button" disabled={busy} onClick={confirmSave} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold disabled:opacity-60">
              {saveDialog.finalize ? 'Save & Finalize' : 'Save Draft'}
            </button>
          </div>
        </Modal>
      )}

      {/* Load dialog */}
      {showLoad && (
        <Modal title="Saved Production Plans" onClose={() => setShowLoad(false)}>
          {!plans.length ? (
            <div className="p-6 text-center text-xs text-slate-400">No saved plans yet.</div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {plans.map((saved) => (
                <div key={saved.id} className="flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-xl hover:bg-slate-50">
                  <button type="button" onClick={() => openPlan(saved)} className="flex-1 text-left">
                    <div className="font-bold text-xs text-slate-800 flex items-center gap-2">
                      {saved.title}
                      <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded-full ${saved.status === 'Finalized' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{saved.status}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {saved.customer_name || 'No customer'} • PO {saved.po_number || '–'} • {saved.order_lines?.length || 0} line(s) • {saved.order_lines?.map((l) => recipeName(l.recipe_id)).filter(Boolean).slice(0, 3).join(', ')}
                    </div>
                    <div className="text-[10px] text-slate-400">Saved {new Date(saved.updated_at).toLocaleString()}{saved.updated_by_name ? ` by ${saved.updated_by_name}` : ''}</div>
                  </button>
                  {canEdit && (
                    <button type="button" onClick={() => deletePlan(saved)} className="p-1.5 text-slate-300 hover:text-rose-600" aria-label="Delete plan">
                      <Icon name="Trash2" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Kpi({ label, value, note, tone }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-xl font-black mt-1 ${tone}`}>{value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{note}</div>
    </div>
  );
}

function PullList({ title, rows }) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">{title}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {rows.map((m) => (
          <div key={m.item_id} className={`p-2.5 rounded-xl border text-xs flex justify-between items-center gap-3 ${m.short ? 'bg-rose-50 border-rose-300 text-rose-900' : 'bg-white border-slate-200 text-slate-800'}`}>
            <span className="font-bold">{m.item_name}</span>
            <div className="text-right">
              <div className="font-mono font-bold">Need {qty(m.required, m.unit_type)}</div>
              <div className={`text-[10px] ${m.short ? 'font-black' : 'text-slate-500'}`}>
                {m.short ? `Stock ${qty(m.available, m.unit_type)} • short ${qty(m.shortage, m.unit_type)}` : `Stock ${qty(m.available, m.unit_type)} (sufficient)`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-sm text-slate-800">{title}</h4>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><Icon name="X" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
