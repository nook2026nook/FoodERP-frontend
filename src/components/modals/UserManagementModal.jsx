import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { adminAPI, errorMessage } from '../../api/client';
import { Field, inputClass } from '../ui';

const MENU_LABELS = {
  dashboard: 'Dashboard', ingredients_hub: 'Ingredients Hub', receiving: 'Receiving', recipes: 'Recipes',
  production: 'Production', ready_to_ship: 'Ready to Ship', shipping: 'Shipping', reports: 'Reports',
  wastage: 'Wastage', recall: 'Recall', help: 'Help'
};

const emptyForm = () => ({ email: '', full_name: '', role: 'Production Operator', password: '', allowed_menus: [], active: true, customMenus: false });

export default function UserManagementModal({ showToast, onClose }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [menus, setMenus] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null); // user being edited
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await adminAPI.getUsers();
      setUsers(data.users);
      setRoles(data.roles);
      setMenus(data.menus);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load users'), 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleMenu = (m) => setForm((f) => ({
    ...f, allowed_menus: f.allowed_menus.includes(m) ? f.allowed_menus.filter((x) => x !== m) : [...f.allowed_menus, m]
  }));
  const reset = () => { setForm(emptyForm()); setEditing(null); setError(''); };

  const startEdit = (u) => {
    setEditing(u);
    setError('');
    setForm({
      email: u.email, full_name: u.full_name, role: u.role, password: '', active: u.active,
      allowed_menus: u.allowed_menus.length ? u.allowed_menus : u.effective_menus,
      customMenus: u.allowed_menus.length > 0
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      full_name: form.full_name.trim(),
      role: form.role,
      active: form.active,
      allowed_menus: form.customMenus && form.role !== 'Administrator' ? form.allowed_menus : [],
      ...(form.password ? { password: form.password } : {})
    };
    try {
      if (editing) {
        await adminAPI.updateUser(editing.id, body);
        showToast(form.password ? `${body.full_name} updated; they must change the new password at next sign-in` : `${body.full_name} updated`);
      } else {
        await adminAPI.createUser({ ...body, email: form.email.trim() });
        showToast(`${body.full_name} added; they must change the password at first sign-in`);
      }
      reset();
      await load();
    } catch (err) {
      const details = err.response?.data?.details?.map((d) => d.message).join('; ');
      setError(details || errorMessage(err, 'Could not save the user'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Delete ${u.full_name} (${u.email})? To keep their history visible, deactivate them instead.`)) return;
    try {
      await adminAPI.deleteUser(u.id);
      showToast(`${u.full_name} deleted`);
      if (editing?.id === u.id) reset();
      await load();
    } catch (err) {
      showToast(errorMessage(err, 'Could not delete the user'), 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-5">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">User Access &amp; Permission Management</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
        </div>

        <form onSubmit={save} className="bg-slate-50 border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase text-slate-700">{editing ? `Edit ${editing.email}` : 'Add User'}</h4>
            {editing && <button type="button" onClick={reset} className="text-xs font-bold text-slate-500">Cancel edit</button>}
          </div>
          {error && <div className="p-2 bg-rose-50 text-rose-700 text-xs font-bold rounded">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email *" htmlFor="um-email">
              <input id="um-email" type="email" value={form.email} onChange={set('email')} className={inputClass} disabled={Boolean(editing)} required />
            </Field>
            <Field label="Full name *" htmlFor="um-name">
              <input id="um-name" value={form.full_name} onChange={set('full_name')} className={inputClass} maxLength={120} required />
            </Field>
            <Field label="Role *" htmlFor="um-role">
              <select id="um-role" value={form.role} onChange={set('role')} className={inputClass}>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label={editing ? 'New temporary password (optional)' : 'Temporary password *'} htmlFor="um-password">
              <input id="um-password" type="text" value={form.password} onChange={set('password')} className={`${inputClass} font-mono`} minLength={10} required={!editing} placeholder="At least 10 characters" autoComplete="off" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={set('active')} /> Active (can sign in)</label>
            {form.role !== 'Administrator' && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.customMenus} onChange={set('customMenus')} /> Custom menu access (otherwise the role's defaults)</label>
            )}
          </div>
          {form.customMenus && form.role !== 'Administrator' && (
            <div className="flex flex-wrap gap-2">
              {menus.map((m) => (
                <label key={m} className={`text-[11px] font-bold px-2.5 py-1 rounded-full border cursor-pointer ${form.allowed_menus.includes(m) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600'}`}>
                  <input type="checkbox" className="sr-only" checked={form.allowed_menus.includes(m)} onChange={() => toggleMenu(m)} />
                  {MENU_LABELS[m] || m}
                </label>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-500">Users change the temporary password the first time they sign in. Menu changes apply at their next sign-in.</p>
          <button type="submit" disabled={busy} className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-xs font-bold disabled:opacity-60">
            {editing ? 'Save Changes' : 'Add User'}
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-y">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Menus</th><th className="px-3 py-2">Last sign-in</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                  <td className="px-3 py-2 font-bold">
                    {u.full_name}
                    {!u.active && <span className="ml-1 text-[10px] uppercase text-slate-500">disabled</span>}
                    {u.force_password_reset && <span className="ml-1 text-[10px] uppercase text-amber-700">temp password</span>}
                  </td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">{u.role}</td>
                  <td className="px-3 py-2 text-slate-500">{u.allowed_menus.length ? `${u.allowed_menus.length} custom` : 'role default'}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'never'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(u)} className="p-1 text-slate-500 hover:text-emerald-700" aria-label={`Edit ${u.email}`}><Pencil size={14} /></button>
                    <button onClick={() => remove(u)} className="p-1 text-slate-400 hover:text-red-600" aria-label={`Delete ${u.email}`}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
