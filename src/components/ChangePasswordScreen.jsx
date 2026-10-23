import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { authAPI, errorMessage } from '../api/client';
import { inputClass } from './ui';

/** Shown after signing in with a temporary password; nothing else works until it's changed. */
export default function ChangePasswordScreen({ user, onChanged, onLogout }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) { setError('The new passwords do not match'); return; }
    setBusy(true);
    setError('');
    try {
      const { data } = await authAPI.changePassword(current, next);
      onChanged(data);
    } catch (err) {
      setError(errorMessage(err, 'Could not change the password'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl border border-slate-200 space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto"><KeyRound size={24} /></div>
          <h2 className="text-lg font-black text-slate-900">Choose your own password</h2>
          <p className="text-xs text-slate-500">
            {user.name}, you signed in with a temporary password. Set a new one to continue (at least 10 characters).
          </p>
        </div>
        {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold text-center">{error}</div>}
        <input id="cp-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Temporary password" className={inputClass} autoComplete="current-password" required autoFocus />
        <input id="cp-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" className={inputClass} autoComplete="new-password" minLength={10} required />
        <input id="cp-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat new password" className={inputClass} autoComplete="new-password" minLength={10} required />
        <button type="submit" disabled={busy} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-60">Save Password &amp; Continue</button>
        <button type="button" onClick={onLogout} className="w-full text-xs font-bold text-slate-500">Sign out</button>
      </form>
    </div>
  );
}
