import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { itemsAPI, lotsAPI, inventoryAPI } from '../../api/client';
import Icon from '../Icon';
import ExportDropdownMenu, { downloadCSV, todayStamp, usePageExport } from '../PageExport';

// The API returns Postgres NUMERIC columns as strings.
const num = (v) => Number(v) || 0;

export default function DashboardView({ setActiveTab }) {
  const { data: allItems = [] } = useQuery({
    queryKey: ['items'],
    queryFn: () => itemsAPI.getAll().then(res => res.data)
  });

  // All lots: depleted ones still count towards the per-ingredient reorder summary.
  const { data: allLots = [] } = useQuery({
    queryKey: ['lots', 'all'],
    queryFn: () => lotsAPI.getAll().then(res => res.data)
  });
  const lots = useMemo(() => allLots.filter(l => num(l.remaining_quantity) > 0), [allLots]);
  const [showAll, setShowAll] = useState(false);

  // Same source as the Ready to Ship screen, so the two always agree.
  const { data: readyToShip } = useQuery({
    queryKey: ['ready-to-ship'],
    queryFn: () => inventoryAPI.readyToShip().then(res => res.data)
  });

  const unitCost = (item) => (item && num(item.unit_pack_size) > 0 ? num(item.cost_per_pack) / num(item.unit_pack_size) : 0);

  // Calculate total inventory value
  const totalInventoryVal = lots.reduce((acc, lot) => {
    const item = allItems.find(i => i.id === lot.item_id);
    return acc + num(lot.remaining_quantity) * unitCost(item);
  }, 0);

  // Boxes ready to ship: released stock only, both formats
  const totalReadyBoxes = (readyToShip?.products || []).reduce(
    (acc, p) => acc + Object.values(p.formats).reduce((n, f) => n + num(f.boxes), 0), 0
  );

  // One row per ingredient: combined remaining quantity across all its lots, lowest first.
  const aggregated = useMemo(() => {
    const map = {};
    allLots.forEach((l) => {
      if (!map[l.item_id]) {
        map[l.item_id] = {
          id: l.item_id,
          name: l.item_name || 'Unknown Ingredient',
          category: l.category || 'Baking',
          unit: l.unit_type || 'kg',
          total: 0,
          suppliers: new Set(),
          lotNumbers: []
        };
      }
      const r = num(l.remaining_quantity);
      map[l.item_id].total += r;
      if (r > 0) {
        if (l.supplier_name) map[l.item_id].suppliers.add(l.supplier_name);
        if (l.lot_number) map[l.item_id].lotNumbers.push(l.lot_number);
      }
    });
    return Object.values(map)
      .map((i) => ({ ...i, suppliers: Array.from(i.suppliers).join(', ') }))
      .sort((a, b) => a.total - b.total);
  }, [allLots]);

  const criticalIngredients = aggregated.filter(i => i.total < 5);
  const lowIngredients = aggregated.filter(i => i.total < 10);
  const displayed = showAll ? aggregated : (lowIngredients.length > 0 ? lowIngredients : aggregated);

  const exportSummary = () => {
    const rows = [['Ingredient ID', 'Ingredient Name', 'Category', 'Suppliers', 'Total Remaining', 'Unit', 'Active Lots']];
    displayed.forEach((i) => rows.push([i.id, i.name, i.category, i.suppliers, i.total.toFixed(2), i.unit, i.lotNumbers.join(', ')]));
    downloadCSV(`Dashboard_Ingredients_Summary_${todayStamp()}.csv`, rows);
  };
  usePageExport(exportSummary);

  const bakingCount = allItems.filter(i => i.category === 'Baking').length;
  const packagingCount = allItems.filter(i => i.category === 'Packaging').length;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KPICard
          icon="DollarSign"
          label="Inventory Value"
          value={`$${totalInventoryVal.toFixed(2)}`}
          subtitle={`${lots.length} active received lot(s)`}
          color="emerald"
        />

        <KPICard
          icon="AlertTriangle"
          label="Critical Reorder (< 5kg total)"
          value={`${criticalIngredients.length} Item(s)`}
          subtitle="Total combined weight < 5kg"
          color="red"
        />

        <KPICard
          icon="PackageCheck"
          label="Finished Boxes Ready"
          value={`${totalReadyBoxes} Boxes`}
          subtitle="Ready for customer dispatch"
          color="blue"
        />

        <KPICard
          icon="Layers"
          label="Master Catalog"
          value={`${allItems.length} Items`}
          subtitle={`${bakingCount} Baking • ${packagingCount} Packaging`}
          color="purple"
        />
      </div>

      {/* Unique ingredients summary: combined remaining quantity per ingredient */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wide">
              <Icon name="AlertTriangle" size={18} className="text-red-600" />
              <span>Warehouse Ingredients Summary (Combined Total Weight per Ingredient)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing unique ingredients with their total available weight across all lots. Ingredients below <b>5.0 kg total</b> are highlighted in <b className="text-red-600">RED (Needs Ordering)</b>.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap no-print">
            <ExportDropdownMenu onExportExcel={exportSummary} onPrintPDF={() => window.print()} />
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 transition"
            >
              {showAll ? `Show Low Stock Only (${lowIngredients.length})` : `Show All Ingredients (${aggregated.length})`}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('receiving')}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-sm transition flex items-center gap-1.5"
            >
              <Icon name="Download" size={14} />
              <span>Order / Receive Stock &rarr;</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-200 border border-slate-200 rounded-2xl overflow-hidden text-xs">
          {displayed.map((ing) => {
            const isCritical = ing.total < 5;
            const isLow = ing.total >= 5 && ing.total < 10;
            const isZero = ing.total <= 0.0001;
            const U = ing.unit.toUpperCase();
            return (
              <div
                key={ing.id}
                className={`p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition ${
                  isCritical
                    ? 'bg-red-50/90 hover:bg-red-100/80 border-l-4 border-l-red-600'
                    : isLow
                    ? 'bg-amber-50/60 hover:bg-amber-100/50 border-l-4 border-l-amber-500'
                    : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-black text-sm ${isCritical ? 'text-red-900' : 'text-slate-900'}`}>{ing.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      ing.category === 'Packaging' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {ing.category === 'Packaging' ? '📦 Packaging' : '🌾 Baking'}
                    </span>
                    {isCritical && !isZero && (
                      <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-red-600 text-white shadow-sm animate-pulse">
                        🚨 TOTAL &lt; 5{U} — NEEDS ORDERING
                      </span>
                    )}
                    {isZero && (
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-red-900 text-white">
                        DEPLETED (0.0 {U})
                      </span>
                    )}
                    {isLow && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                        ⚠️ Total Stock &lt; 10{ing.unit} — Reorder Soon
                      </span>
                    )}
                  </div>
                  <div className="text-slate-600 text-xs">
                    Active Lots:{' '}
                    <span className="font-mono font-bold text-slate-800">
                      {ing.lotNumbers.length ? `#${ing.lotNumbers.join(', #')}` : 'none'}
                    </span>
                    {ing.suppliers && (
                      <span className="ml-3 text-slate-500">&bull; Supplier(s): <b>{ing.suppliers}</b></span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right">
                    <div className={`text-base font-black font-mono px-3 py-1 rounded-xl border ${
                      isCritical
                        ? 'bg-red-600 text-white border-red-700 shadow-sm'
                        : isLow
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {ing.total.toFixed(1)} {ing.unit}
                    </div>
                    <div className={`text-[10px] uppercase font-extrabold mt-1 ${
                      isCritical ? 'text-red-700' : isLow ? 'text-amber-700' : 'text-slate-400'
                    }`}>
                      {isCritical ? `TOTAL < 5${U} — REORDER` : isLow ? `TOTAL < 10${U}` : 'TOTAL IN STOCK'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {displayed.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-xs">
              No inventory lots received yet. Receive items in the Receive Ingredients tab.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, subtitle, color }) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-100 text-red-600'
  };
  const valueColors = { red: 'text-red-600', blue: 'text-blue-600', purple: 'text-purple-600' };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between text-slate-500 mb-2">
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
        <div className={`h-8 w-8 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
          <Icon name={icon} size={18} />
        </div>
      </div>
      <div className={`text-2xl font-black ${valueColors[color] || 'text-slate-800'}`}>{value}</div>
      <div className={`text-xs mt-1 ${color === 'red' ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>{subtitle}</div>
    </div>
  );
}
