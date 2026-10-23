import { useQuery } from '@tanstack/react-query';
import { itemsAPI, lotsAPI, batchesAPI, inventoryAPI } from '../../api/client';
import Icon from '../Icon';

// The API returns Postgres NUMERIC columns as strings.
const num = (v) => Number(v) || 0;

export default function DashboardView({ setActiveTab, setIngredientSubTab }) {
  const { data: allItems = [] } = useQuery({
    queryKey: ['items'],
    queryFn: () => itemsAPI.getAll().then(res => res.data)
  });

  // Only lots that still hold stock
  const { data: lots = [] } = useQuery({
    queryKey: ['lots', 'active'],
    queryFn: () => lotsAPI.getAll(true).then(res => res.data)
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: () => batchesAPI.getAll().then(res => res.data)
  });

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
          icon="PackageCheck"
          label="Finished Boxes Ready"
          value={`${totalReadyBoxes} Boxes`}
          subtitle="Ready for customer dispatch"
          color="blue"
        />

        <KPICard
          icon="Cpu"
          label="Production Batches"
          value={`${batches.length} Runs`}
          subtitle="1 Batch = 2 Bins standard"
          color="amber"
        />

        <KPICard
          icon="Layers"
          label="Master Catalog"
          value={`${allItems.length} Items`}
          subtitle={`${bakingCount} Baking • ${packagingCount} Packaging`}
          color="purple"
        />
      </div>

      {/* Quick Nav Cards */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">
          Direct Navigation to Catalogs & Production
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <QuickNavCard
            icon="Wheat"
            iconColor="amber"
            title="🌾 Baking Ingredients"
            description="Add flours, liquids, oils in kg. Pulls directly into formulas."
            onClick={() => {
              setActiveTab('ingredients_hub');
              setIngredientSubTab('baking');
            }}
          />

          <QuickNavCard
            icon="Box"
            iconColor="blue"
            title="📦 Packaging Ingredients"
            description="Manage kraft bags, boxes, film with kg net weight and pricing."
            onClick={() => {
              setActiveTab('ingredients_hub');
              setIngredientSubTab('packaging');
            }}
          />

          <QuickNavCard
            icon="Layers"
            iconColor="emerald"
            title="📋 Master Catalog (Pulled)"
            description="View all ingredients pulled together in one unified catalog."
            onClick={() => {
              setActiveTab('ingredients_hub');
              setIngredientSubTab('master_catalog');
            }}
          />
        </div>
      </div>

      {/* Inventory Stock Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-slate-800 text-sm">
              Remaining Ingredients & Materials Stock Valuation
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Active warehouse lots with remaining stock weight, unit cost, and total value
            </p>
          </div>
          <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
            Total Valuation: ${totalInventoryVal.toFixed(2)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Lot #</th>
                <th className="px-6 py-3.5">Item Name</th>
                <th className="px-6 py-3.5">Category</th>
                <th className="px-6 py-3.5">Supplier</th>
                <th className="px-6 py-3.5">Remaining Stock</th>
                <th className="px-6 py-3.5">Unit Cost</th>
                <th className="px-6 py-3.5 text-right">Total Price Valuation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lots.map((lot) => {
                const item = allItems.find(i => i.id === lot.item_id);
                const remaining = num(lot.remaining_quantity);
                const perUnit = unitCost(item);
                const totalPrice = remaining * perUnit;

                return (
                  <tr key={lot.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-3 font-mono font-bold text-slate-800">
                      {lot.lot_number}
                    </td>
                    <td className="px-6 py-3 font-bold text-slate-900">
                      {lot.item_name}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        lot.category === 'Baking' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {lot.category}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-600">{lot.supplier_name}</td>
                    <td className="px-6 py-3 font-extrabold text-emerald-600">
                      {remaining.toFixed(1)} {item?.unit_type || 'kg'}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      ${perUnit.toFixed(2)} / {item?.unit_type || 'kg'}
                    </td>
                    <td className="px-6 py-3 font-black text-slate-900 text-right">
                      ${totalPrice.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
              {lots.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-slate-400">
                    No active inventory lots received yet. Receive items in the Receive Ingredients tab.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
    purple: 'bg-purple-50 text-purple-600'
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between text-slate-500 mb-2">
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
        <div className={`h-8 w-8 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
          <Icon name={icon} size={18} />
        </div>
      </div>
      <div className="text-2xl font-black text-slate-800">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{subtitle}</div>
    </div>
  );
}

function QuickNavCard({ icon, iconColor, title, description, onClick }) {
  const colorClasses = {
    amber: 'bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white',
    blue: 'bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white',
    emerald: 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white'
  };

  const borderColors = {
    amber: 'hover:border-amber-500 hover:bg-amber-50/40',
    blue: 'hover:border-blue-500 hover:bg-blue-50/40',
    emerald: 'hover:border-emerald-500 hover:bg-emerald-50/40'
  };

  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border border-slate-200 ${borderColors[iconColor]} text-left transition group`}
    >
      <div className="flex items-center space-x-3 mb-1">
        <div className={`p-2 rounded-lg ${colorClasses[iconColor]} transition`}>
          <Icon name={icon} size={18} />
        </div>
        <h4 className="font-bold text-slate-800 text-sm">{title}</h4>
      </div>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </button>
  );
}
