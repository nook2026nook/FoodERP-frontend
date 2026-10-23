import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { itemsAPI, suppliersAPI } from '../../api/client';

const EDIT_ROLES = ['Administrator', 'Production Operator'];

const errorMessage = (e, fallback) => e.response?.data?.error || fallback;
const money = (n) => `$${Number(n).toFixed(2)}`;

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
      <div className="flex border-b border-slate-200 bg-white p-2 rounded-2xl shadow-sm gap-2">
        <TabButton
          active={ingredientSubTab === 'baking'}
          onClick={() => setIngredientSubTab('baking')}
          label={`🌾 Baking (${baking.length})`}
          activeClass="bg-amber-600"
        />
        <TabButton
          active={ingredientSubTab === 'packaging'}
          onClick={() => setIngredientSubTab('packaging')}
          label={`📦 Packaging (${packaging.length})`}
          activeClass="bg-blue-600"
        />
        <TabButton
          active={ingredientSubTab === 'suppliers'}
          onClick={() => setIngredientSubTab('suppliers')}
          label={`🚚 Suppliers (${suppliers.length})`}
          activeClass="bg-slate-800"
        />
        <TabButton
          active={ingredientSubTab === 'master_catalog'}
          onClick={() => setIngredientSubTab('master_catalog')}
          label={`📋 Master (${items.length})`}
          activeClass="bg-emerald-600"
        />
      </div>

      {ingredientSubTab === 'baking' && (
        <ItemsCatalog
          {...common}
          title="Baking Ingredients Catalog"
          category="Baking"
          items={baking}
          namePlaceholder="Name"
          sizePlaceholder="Pack kg"
          unitTypes={['kg']}
          accent="amber"
        />
      )}
      {ingredientSubTab === 'packaging' && (
        <ItemsCatalog
          {...common}
          title="Packaging Materials Catalog"
          category="Packaging"
          items={packaging}
          namePlaceholder="Description"
          sizePlaceholder="Pack Qty"
          unitTypes={['units', 'kg']}
          accent="blue"
        />
      )}
      {ingredientSubTab === 'suppliers' && (
        <SuppliersRegistry suppliers={suppliers} canEdit={canEdit} showToast={showToast} reload={load} />
      )}
      {ingredientSubTab === 'master_catalog' && <MasterCatalog items={items} />}
    </div>
  );
}

const ACCENTS = {
  amber: { button: 'bg-amber-600 hover:bg-amber-700', ring: 'focus:ring-amber-500' },
  blue: { button: 'bg-blue-600 hover:bg-blue-700', ring: 'focus:ring-blue-500' }
};

const inputClass = (ring) =>
  `text-xs px-3.5 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 ${ring}`;

const EMPTY_FORM = { name: '', unit_type: 'kg', unit_pack_size: '', cost_per_pack: '', supplier_id: '' };

function ItemsCatalog({
  title, category, items, suppliers, canEdit, showToast, reload,
  namePlaceholder, sizePlaceholder, unitTypes, accent
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, unit_type: unitTypes[0] });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const { button, ring } = ACCENTS[accent];

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const reset = () => {
    setForm({ ...EMPTY_FORM, unit_type: unitTypes[0] });
    setEditingId(null);
  };

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
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-4">{title}</h3>
        {canEdit && (
          <form onSubmit={submit} className="flex flex-wrap gap-2">
            <input
              value={form.name}
              onChange={set('name')}
              placeholder={namePlaceholder}
              maxLength={255}
              className={`${inputClass(ring)} flex-1 min-w-[200px]`}
            />
            {unitTypes.length > 1 && (
              <select value={form.unit_type} onChange={set('unit_type')} className={`${inputClass(ring)} bg-white`}>
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
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">{category === 'Baking' ? 'Ingredient' : 'Description'}</th>
                <th className="px-6 py-3.5">Pack Size</th>
                <th className="px-6 py-3.5">Pack Cost</th>
                <th className="px-6 py-3.5">Cost / {unitTypes[0] === 'kg' && category === 'Baking' ? 'kg' : 'unit'}</th>
                <th className="px-6 py-3.5">Supplier</th>
                {canEdit && <th className="px-6 py-3.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className={editingId === item.id ? 'bg-amber-50/70' : 'hover:bg-slate-50'}>
                  <td className="px-6 py-3 font-bold text-slate-800">{item.name}</td>
                  <td className="px-6 py-3 text-slate-700">{Number(item.unit_pack_size)} {item.unit_type}</td>
                  <td className="px-6 py-3 font-bold text-slate-800">{money(item.cost_per_pack)}</td>
                  <td className="px-6 py-3 text-emerald-600 font-bold">
                    ${(item.cost_per_pack / item.unit_pack_size).toFixed(3)} / {item.unit_type === 'kg' ? 'kg' : 'unit'}
                  </td>
                  <td className="px-6 py-3 text-slate-600">{item.supplier_name || '—'}</td>
                  {canEdit && (
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => startEdit(item)} className="text-amber-600 hover:text-amber-800 p-1 mr-1.5" aria-label="Edit">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => remove(item)} className="text-red-500 hover:text-red-700 p-1" aria-label="Delete">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} className="text-center py-10 text-slate-400">
                    No {category.toLowerCase()} items added yet.
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
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
      <h3 className="text-sm font-bold text-slate-800 mb-4">Suppliers Registry</h3>
      {canEdit && (
        <form onSubmit={add} className="flex gap-2 mb-4">
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
      <ul className="divide-y divide-slate-100">
        {suppliers.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-3 text-xs font-bold text-slate-800">
            <span>
              {s.name}
              {s.item_count > 0 && <span className="ml-2 font-normal text-slate-400">{s.item_count} item(s)</span>}
            </span>
            {canEdit && (
              <button onClick={() => remove(s)} className="text-slate-400 hover:text-red-600 transition" aria-label="Remove">
                <X size={15} />
              </button>
            )}
          </li>
        ))}
        {suppliers.length === 0 && <li className="py-6 text-center text-xs text-slate-400">No vendors registered yet.</li>}
      </ul>
    </div>
  );
}

function MasterCatalog({ items }) {
  const [filter, setFilter] = useState('ALL');
  const shown = filter === 'ALL' ? items : items.filter((i) => i.category === filter);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-800">Master Catalog ({shown.length})</h3>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {['ALL', 'Baking', 'Packaging'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === f ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            >
              {f === 'ALL' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Pack Size</th>
              <th className="px-4 py-3">Pack Cost</th>
              <th className="px-4 py-3">Supplier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-800">{item.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${item.category === 'Baking' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                    {item.category}
                  </span>
                </td>
                <td className="px-4 py-3">{Number(item.unit_pack_size)} {item.unit_type}</td>
                <td className="px-4 py-3 font-bold">{money(item.cost_per_pack)}</td>
                <td className="px-4 py-3 text-slate-600">{item.supplier_name || '—'}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-400">No items yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, activeClass }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
        active ? `${activeClass} text-white shadow-sm` : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <span>{label}</span>
    </button>
  );
}
