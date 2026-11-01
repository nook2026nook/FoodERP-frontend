import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { itemsAPI, suppliersAPI, errorMessage } from '../../api/client';
import Icon from '../Icon';
import ExportDropdownMenu, { downloadCSV, todayStamp, usePageExport } from '../PageExport';

const EDIT_ROLES = ['Administrator', 'Production Operator'];

const money = (n) => `$${Number(n).toFixed(2)}`;
const lower = (v) => String(v ?? '').toLowerCase();

export default function IngredientsHubView({ ingredientSubTab, setIngredientSubTab, currentUserRole, showToast }) {
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const canEdit = EDIT_ROLES.includes(currentUserRole);

  const load = useCallback(async () => {
    try {
      const [itemsRes, suppliersRes] = await Promise.all([itemsAPI.getAll(), suppliersAPI.getAll()]);
      setItems(itemsRes.data);
      setSuppliers(suppliersRes.data);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load ingredients'), 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const baking = items.filter((i) => i.category === 'Baking');
  const packaging = items.filter((i) => i.category === 'Packaging');

  const common = { suppliers, canEdit, showToast, reload: load };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex border-b border-slate-200 bg-white p-2 rounded-2xl shadow-sm gap-2 no-print">
        <TabButton
          active={ingredientSubTab === 'baking'}
          onClick={() => setIngredientSubTab('baking')}
          icon="Wheat"
          label={`🌾 Baking (${baking.length})`}
          activeClass="bg-amber-500"
        />
        <TabButton
          active={ingredientSubTab === 'packaging'}
          onClick={() => setIngredientSubTab('packaging')}
          icon="Box"
          label={`📦 Packaging (${packaging.length})`}
          activeClass="bg-blue-600"
        />
        <TabButton
          active={ingredientSubTab === 'suppliers'}
          onClick={() => setIngredientSubTab('suppliers')}
          icon="Truck"
          label={`🚚 Suppliers (${suppliers.length})`}
          activeClass="bg-slate-800"
        />
        <TabButton
          active={ingredientSubTab === 'master_catalog'}
          onClick={() => setIngredientSubTab('master_catalog')}
          icon="Layers"
          label={`📋 Master (${items.length})`}
          activeClass="bg-emerald-600"
        />
      </div>

      {ingredientSubTab === 'baking' && (
        <ItemsCatalog
          {...common}
          title="Baking Ingredients Catalog"
          blurb="Search across baking ingredient name, item ID, supplier, pack weight (kg), or cost."
          searchPlaceholder="Search baking ingredient, ID, supplier, pack kg, cost..."
          exportName="Baking_Ingredients_Catalog"
          category="Baking"
          items={baking}
          namePlaceholder="Ingredient Name"
          sizePlaceholder="Pack kg"
          unitTypes={['kg']}
          accent="amber"
          icon="Wheat"
        />
      )}
      {ingredientSubTab === 'packaging' && (
        <ItemsCatalog
          {...common}
          title="Packaging Materials Catalog"
          blurb="Search across packaging material description, ID, unit type, pack quantity, or cost."
          searchPlaceholder="Search packaging material, ID, unit type, cost..."
          exportName="Packaging_Materials_Catalog"
          category="Packaging"
          items={packaging}
          namePlaceholder="Description"
          sizePlaceholder="Pack Qty"
          unitTypes={['units', 'kg']}
          accent="blue"
          icon="Box"
        />
      )}
      {ingredientSubTab === 'suppliers' && (
        <SuppliersRegistry suppliers={suppliers} canEdit={canEdit} showToast={showToast} reload={load} />
      )}
      {ingredientSubTab === 'master_catalog' && <MasterCatalog items={items} showToast={showToast} />}
    </div>
  );
}

const ACCENTS = {
  amber: {
    button: 'bg-amber-600 hover:bg-amber-700',
    ring: 'focus:ring-amber-500',
    icon: 'text-amber-600',
    search: 'border-amber-200 focus:ring-amber-500 bg-amber-50/30',
    searchIcon: 'text-amber-600',
    cost: 'text-amber-700'
  },
  blue: {
    button: 'bg-blue-600 hover:bg-blue-700',
    ring: 'focus:ring-blue-500',
    icon: 'text-blue-600',
    search: 'border-blue-200 focus:ring-blue-500 bg-blue-50/30',
    searchIcon: 'text-blue-600',
    cost: 'text-blue-700'
  }
};

const inputClass = (ring) =>
  `text-xs px-3.5 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 ${ring}`;

const EMPTY_FORM = { name: '', unit_type: 'kg', unit_pack_size: '', cost_per_pack: '', supplier_id: '' };

function SearchBox({ value, onChange, placeholder, wrapClass = 'border-slate-200 focus:ring-slate-500 bg-slate-50', iconClass = 'text-slate-500' }) {
  return (
    <div className="relative max-w-md no-print">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full pl-9 pr-4 py-2.5 border-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 ${wrapClass}`}
      />
      <span className={`absolute left-3 top-3 ${iconClass}`}>
        <Icon name="Search" size={15} />
      </span>
    </div>
  );
}

function ItemsCatalog({
  title, blurb, searchPlaceholder, exportName, category, items, suppliers, canEdit, showToast, reload,
  namePlaceholder, sizePlaceholder, unitTypes, accent, icon
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, unit_type: unitTypes[0] });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { button, ring, icon: iconClass, search, searchIcon, cost } = ACCENTS[accent];
  const perLabel = category === 'Baking' ? 'kg' : 'unit';

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const reset = () => {
    setForm({ ...EMPTY_FORM, unit_type: unitTypes[0] });
    setEditingId(null);
  };

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return items;
    return items.filter((i) => {
      const size = Number(i.unit_pack_size) || 1;
      const packCost = Number(i.cost_per_pack) || 0;
      return (
        lower(i.item_code).includes(term) ||
        lower(i.name).includes(term) ||
        lower(i.supplier_name).includes(term) ||
        lower(i.unit_type).includes(term) ||
        String(size).includes(term) ||
        String(packCost).includes(term) ||
        (packCost / size).toFixed(2).includes(term)
      );
    });
  }, [items, searchTerm]);

  const exportCSV = () => {
    const rows = [[
      'Item ID', category === 'Baking' ? 'Ingredient Name' : 'Packaging Description', 'Category', 'Supplier',
      category === 'Baking' ? 'Pack Size (kg)' : 'Unit Type', category === 'Baking' ? 'Cost Per Pack ($)' : 'Pack Qty',
      category === 'Baking' ? 'Cost Per Kg ($)' : 'Cost Per Pack ($)', ...(category === 'Baking' ? [] : ['Cost Per Unit ($)'])
    ]];
    filtered.forEach((i) => {
      const size = Number(i.unit_pack_size) || 1;
      const packCost = Number(i.cost_per_pack) || 0;
      if (category === 'Baking') {
        rows.push([i.item_code, i.name, 'Baking', i.supplier_name || '', size, packCost.toFixed(2), (packCost / size).toFixed(2)]);
      } else {
        rows.push([i.item_code, i.name, 'Packaging', i.supplier_name || '', i.unit_type, size, packCost.toFixed(2), (packCost / size).toFixed(4)]);
      }
    });
    downloadCSV(`${exportName}_${todayStamp()}.csv`, rows);
    showToast(`${title} exported to Excel/CSV!`);
  };
  usePageExport(exportCSV);

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      category,
      unit_type: form.unit_type,
      unit_pack_size: parseFloat(form.unit_pack_size),
      cost_per_pack: parseFloat(form.cost_per_pack),
      supplier_id: form.supplier_id || null
    };
    if (!payload.name || !(payload.unit_pack_size > 0) || !(payload.cost_per_pack >= 0)) {
      showToast('Enter a name, a pack size above 0 and a cost', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await itemsAPI.update(editingId, payload);
        showToast(`"${payload.name}" updated`);
      } else {
        await itemsAPI.create(payload);
        showToast(`"${payload.name}" added`);
      }
      reset();
      await reload();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to save item'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      unit_type: item.unit_type,
      unit_pack_size: String(item.unit_pack_size),
      cost_per_pack: String(item.cost_per_pack),
      supplier_id: item.supplier_id || ''
    });
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await itemsAPI.delete(item.id);
      showToast(`"${item.name}" deleted`);
      if (editingId === item.id) reset();
      await reload();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to delete item'), 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
              <Icon name={icon} size={18} className={iconClass} />
              <span>{title} ({filtered.length} of {items.length})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>
          </div>
          <div className="flex items-center gap-2 no-print">
            <ExportDropdownMenu onExportExcel={exportCSV} onPrintPDF={() => window.print()} />
          </div>
        </div>

        {canEdit && (
          <form onSubmit={submit} className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 no-print">
            <input
              value={form.name}
              onChange={set('name')}
              placeholder={namePlaceholder}
              maxLength={255}
              className={`${inputClass(ring)} flex-1 min-w-[200px]`}
            />
            {unitTypes.length > 1 && (
              <select value={form.unit_type} onChange={set('unit_type')} className={`${inputClass(ring)} bg-white font-semibold`}>
                {unitTypes.map((u) => (
                  <option key={u} value={u}>{u === 'kg' ? 'Kg' : 'Units'}</option>
                ))}
              </select>
            )}
            <input
              type="number" step="any" min="0"
              value={form.unit_pack_size}
              onChange={set('unit_pack_size')}
              placeholder={sizePlaceholder}
              className={`${inputClass(ring)} w-28`}
            />
            <input
              type="number" step="0.01" min="0"
              value={form.cost_per_pack}
              onChange={set('cost_per_pack')}
              placeholder="Cost $"
              className={`${inputClass(ring)} w-28`}
            />
            <select value={form.supplier_id} onChange={set('supplier_id')} className={`${inputClass(ring)} bg-white w-44`}>
              <option value="">Supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving}
              className={`px-5 py-2.5 text-white text-xs font-bold rounded-lg transition disabled:opacity-60 ${button}`}
            >
              {editingId ? 'Save' : 'Add'}
            </button>
            {editingId && (
              <button type="button" onClick={reset} className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">
                Cancel
              </button>
            )}
          </form>
        )}

        <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder={searchPlaceholder} wrapClass={search} iconClass={searchIcon} />
      </div>

      <div id="printable-audit-area" className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h4 className="font-bold text-xs uppercase text-slate-700">{title} ({filtered.length})</h4>
          <span className="text-[11px] text-slate-400 font-mono">Category: {category === 'Baking' ? '🌾 Baking' : '📦 Packaging'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Item ID</th>
                <th className="px-6 py-3">{category === 'Baking' ? 'Ingredient Name' : 'Material Description'}</th>
                <th className="px-6 py-3">{category === 'Baking' ? 'Supplier' : 'Unit Basis'}</th>
                <th className="px-6 py-3 text-right">{category === 'Baking' ? 'Pack Size (kg)' : 'Pack Qty'}</th>
                <th className="px-6 py-3 text-right">Cost / Pack</th>
                <th className="px-6 py-3 text-right">{category === 'Baking' ? 'Unit Cost ($/kg)' : 'Cost / Unit'}</th>
                {category === 'Packaging' && <th className="px-6 py-3">Supplier</th>}
                {canEdit && <th className="px-6 py-3 text-right no-print">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const size = Number(item.unit_pack_size) || 1;
                const packCost = Number(item.cost_per_pack) || 0;
                return (
                  <tr key={item.id} className={editingId === item.id ? 'bg-amber-50/70' : 'hover:bg-slate-50 transition'}>
                    <td className="px-6 py-3 font-mono font-bold text-slate-700">{item.item_code}</td>
                    <td className="px-6 py-3 font-bold text-slate-900">{item.name}</td>
                    <td className="px-6 py-3 text-slate-500">
                      {category === 'Baking' ? (item.supplier_name || '—') : <span className="uppercase font-semibold">{item.unit_type}</span>}
                    </td>
                    <td className="px-6 py-3 text-right font-mono font-semibold">
                      {size}{category === 'Baking' ? ' kg' : ''}
                    </td>
                    <td className="px-6 py-3 text-right font-mono font-bold text-slate-800">{money(packCost)}</td>
                    <td className={`px-6 py-3 text-right font-mono font-bold ${cost}`}>
                      ${(packCost / size).toFixed(category === 'Baking' ? 2 : 3)}/{category === 'Baking' ? 'kg' : (item.unit_type === 'kg' ? 'kg' : 'unit')}
                    </td>
                    {category === 'Packaging' && <td className="px-6 py-3 text-slate-600">{item.supplier_name || '—'}</td>}
                    {canEdit && (
                      <td className="px-6 py-3 text-right no-print">
                        <button onClick={() => startEdit(item)} className="text-amber-600 hover:text-amber-800 p-1 mr-1.5" aria-label="Edit">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => remove(item)} className="text-red-500 hover:text-red-700 p-1" aria-label="Delete">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={category === 'Packaging' ? (canEdit ? 8 : 7) : (canEdit ? 7 : 6)} className="p-8 text-center text-slate-400 text-xs">
                    {items.length === 0
                      ? `No ${category.toLowerCase()} items added yet.`
                      : `No ${category.toLowerCase()} items found matching "${searchTerm}".`}
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

function SuppliersRegistry({ suppliers, canEdit, showToast, reload }) {
  const [name, setName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return term ? suppliers.filter((s) => lower(s.name).includes(term)) : suppliers;
  }, [suppliers, searchTerm]);

  const exportCSV = () => {
    const rows = [['Supplier #', 'Supplier Name', 'Catalog Items']];
    filtered.forEach((s, idx) => rows.push([idx + 1, s.name, s.item_count ?? 0]));
    downloadCSV(`Suppliers_Registry_${todayStamp()}.csv`, rows);
    showToast('Suppliers Registry exported to Excel/CSV!');
  };
  usePageExport(exportCSV);

  const add = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await suppliersAPI.create({ name: trimmed });
      setName('');
      showToast(`Vendor "${trimmed}" registered`);
      await reload();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to add vendor'), 'error');
    }
  };

  const remove = async (supplier) => {
    if (!window.confirm(`Remove "${supplier.name}" from the registry?`)) return;
    try {
      await suppliersAPI.delete(supplier.id);
      showToast('Vendor removed');
      await reload();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to remove vendor'), 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
              <Icon name="Truck" size={18} className="text-slate-700" />
              <span>Suppliers Registry ({filtered.length} of {suppliers.length})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Search and export approved commercial raw material and packaging vendors.</p>
          </div>
          <div className="flex items-center gap-2 no-print">
            <ExportDropdownMenu onExportExcel={exportCSV} onPrintPDF={() => window.print()} />
          </div>
        </div>

        {canEdit && (
          <form onSubmit={add} className="flex gap-2 pt-2 border-t border-slate-100 no-print">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vendor"
              maxLength={255}
              className={`${inputClass('focus:ring-slate-500')} flex-1`}
            />
            <button type="submit" className="px-5 py-2.5 bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition">
              Add
            </button>
          </form>
        )}

        <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Search supplier / vendor name..." />
      </div>

      <div id="printable-audit-area" className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h4 className="font-bold text-xs uppercase text-slate-700">Suppliers Registry ({filtered.length})</h4>
        </div>
        <ul className="divide-y divide-slate-100 text-xs">
          {filtered.map((s, i) => (
            <li key={s.id} className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50">
              <span className="font-bold text-slate-800">
                {s.name}
                {s.item_count > 0 && <span className="ml-2 font-normal text-slate-400">{s.item_count} item(s)</span>}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-slate-400">Vendor #{i + 1}</span>
                {canEdit && (
                  <button onClick={() => remove(s)} className="text-slate-400 hover:text-red-600 transition no-print" aria-label="Remove">
                    <X size={15} />
                  </button>
                )}
              </span>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="p-8 text-center text-slate-400 text-xs">
              {suppliers.length === 0 ? 'No vendors registered yet.' : `No suppliers found matching "${searchTerm}".`}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function MasterCatalog({ items, showToast }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return items.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!term) return true;
      const size = Number(item.unit_pack_size) || 1;
      const packCost = Number(item.cost_per_pack) || 0;
      return (
        lower(item.item_code).includes(term) ||
        lower(item.name).includes(term) ||
        lower(item.category).includes(term) ||
        lower(item.supplier_name).includes(term) ||
        lower(item.unit_type).includes(term) ||
        String(size).includes(term) ||
        String(packCost).includes(term) ||
        (packCost / size).toFixed(2).includes(term)
      );
    });
  }, [items, searchTerm, categoryFilter]);

  const exportCSV = () => {
    const rows = [['Item ID', 'Item Name', 'Category', 'Supplier', 'Unit Type', 'Pack Qty / Weight', 'Cost Per Pack ($)', 'Unit Cost ($)']];
    filtered.forEach((i) => {
      const size = Number(i.unit_pack_size) || 1;
      const packCost = Number(i.cost_per_pack) || 0;
      rows.push([i.item_code, i.name, i.category, i.supplier_name || '', i.unit_type, size, packCost.toFixed(2), (packCost / size).toFixed(2)]);
    });
    downloadCSV(`Master_Catalog_${todayStamp()}.csv`, rows);
    showToast('Master Catalog exported to Excel/CSV!');
  };
  usePageExport(exportCSV);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
              <Icon name="Layers" size={18} className="text-emerald-600" />
              <span>Master Catalog ({filtered.length} of {items.length})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Unified searchable directory of all Baking Ingredients and Packaging Materials.</p>
          </div>
          <div className="flex items-center gap-2 no-print">
            <ExportDropdownMenu onExportExcel={exportCSV} onPrintPDF={() => window.print()} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 no-print">
          <div className="sm:col-span-8 relative">
            <input
              type="text"
              placeholder="Search item name, ID, category, supplier, pack size, or price..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border-2 border-emerald-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-emerald-50/30"
            />
            <span className="absolute left-3 top-3 text-emerald-600">
              <Icon name="Search" size={15} />
            </span>
          </div>
          <div className="sm:col-span-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full py-2.5 px-3 border-2 border-slate-200 rounded-xl bg-white text-xs font-bold"
            >
              <option value="all">All Categories ({items.length})</option>
              <option value="Baking">🌾 Baking Ingredients Only</option>
              <option value="Packaging">📦 Packaging Materials Only</option>
            </select>
          </div>
        </div>
      </div>

      <div id="printable-audit-area" className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h4 className="font-bold text-xs uppercase text-slate-700">Master Catalog ({filtered.length})</h4>
          <span className="text-[11px] text-slate-400 font-mono">Baking &amp; Packaging</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Item ID</th>
                <th className="px-6 py-3">Item Name</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Supplier / Unit</th>
                <th className="px-6 py-3 text-right">Pack Size / Qty</th>
                <th className="px-6 py-3 text-right">Cost / Pack</th>
                <th className="px-6 py-3 text-right">Unit Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const size = Number(item.unit_pack_size) || 1;
                const packCost = Number(item.cost_per_pack) || 0;
                const unitLabel = item.unit_type === 'kg' ? 'kg' : 'unit';
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-3 font-mono font-bold text-slate-700">{item.item_code}</td>
                    <td className="px-6 py-3 font-bold text-slate-900">{item.name}</td>
                    <td className="px-6 py-3">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${item.category === 'Packaging' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                        {item.category === 'Packaging' ? '📦 Packaging' : '🌾 Baking'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-500">{item.supplier_name || item.unit_type || 'Standard'}</td>
                    <td className="px-6 py-3 text-right font-mono font-semibold">{size} {item.unit_type}</td>
                    <td className="px-6 py-3 text-right font-mono font-bold text-slate-800">{money(packCost)}</td>
                    <td className="px-6 py-3 text-right font-mono font-bold text-emerald-700">${(packCost / size).toFixed(2)}/{unitLabel}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                    {items.length === 0 ? 'No items yet.' : `No master catalog items found matching "${searchTerm}".`}
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

function TabButton({ active, onClick, label, activeClass, icon }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
        active ? `${activeClass} text-white shadow-sm` : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon name={icon} size={16} />
      <span>{label}</span>
    </button>
  );
}
