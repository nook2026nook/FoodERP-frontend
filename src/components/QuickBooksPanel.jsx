import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Link2, Unlink, Settings2 } from 'lucide-react';
import { qboAPI, errorMessage } from '../api/client';
import QboMappingModal from './modals/QboMappingModal';

const SYNC_ROLES = ['Administrator', 'Shipping Clerk'];

export default function QuickBooksPanel({ currentUserRole, showToast, onSynced }) {
  const isAdmin = currentUserRole === 'Administrator';
  const canSync = SYNC_ROLES.includes(currentUserRole);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await qboAPI.getStatus();
      setStatus(data);
    } catch (e) {
      showToast(errorMessage(e, 'Could not load QuickBooks status'), 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setBusy(true);
    try {
      await qboAPI.connect();
    } catch (e) {
      showToast(errorMessage(e, 'Could not start the QuickBooks connection'), 'error');
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect QuickBooks? Invoices already synced stay; new ones stop coming in.')) return;
    try {
      await qboAPI.disconnect();
      showToast('QuickBooks disconnected');
      await load();
    } catch (e) {
      showToast(errorMessage(e, 'Could not disconnect'), 'error');
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const { data } = await qboAPI.syncInvoices();
      const parts = [`${data.created} new line(s)`];
      if (data.unmapped) parts.push(`${data.unmapped} unmapped`);
      if (data.partial) parts.push(`${data.partial} short of stock`);
      if (data.removed) parts.push(`${data.removed} removed`);
      if (data.errors.length) parts.push(`${data.errors.length} failed`);
      showToast(`Sync finished: ${parts.join(', ')}`, data.errors.length ? 'error' : 'success');
      await load();
      onSynced?.();
    } catch (e) {
      showToast(errorMessage(e, 'Sync failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;
  const s = status.last_sync_summary;
  const open = status.open_lines || { unmapped: 0, short: 0 };

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${status.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              QuickBooks Online {status.connected ? 'connected' : 'not connected'}
              <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{status.environment}</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              {status.connected
                ? <>Last sync: {status.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : 'never'} · reconnect needed by {new Date(status.refresh_expires_at).toLocaleDateString()}</>
                : status.configured ? 'Connect to pull customer invoices in as shipments.' : 'QuickBooks keys are not set on the server.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status.connected && canSync && (
            <button onClick={sync} disabled={busy} className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-60">
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Sync Invoices Now
            </button>
          )}
          {isAdmin && status.connected && (
            <button onClick={() => setMappingOpen(true)} className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-slate-100 border rounded-lg">
              <Settings2 size={14} /> Item Mapping
              {(open.unmapped + open.short) > 0 && <span className="ml-1 px-1.5 rounded-full bg-rose-600 text-white text-[10px]">{open.unmapped + open.short}</span>}
            </button>
          )}
          {isAdmin && status.configured && !status.connected && (
            <button onClick={connect} disabled={busy} className="flex items-center gap-1 px-3 py-2 text-xs font-bold bg-[#2CA01C] hover:bg-[#248a17] text-white rounded-lg disabled:opacity-60">
              <Link2 size={14} /> Connect to QuickBooks
            </button>
          )}
          {isAdmin && status.connected && (
            <button onClick={disconnect} className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-500 hover:text-rose-700">
              <Unlink size={14} /> Disconnect
            </button>
          )}
        </div>
      </div>

      {(open.unmapped > 0 || open.short > 0) && (
        <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {open.unmapped > 0 && `${open.unmapped} invoice line(s) use QuickBooks products that aren't mapped to a recipe. `}
          {open.short > 0 && `${open.short} line(s) are waiting for released stock. `}
          {isAdmin ? 'Open Item Mapping to resolve them.' : 'Ask an administrator to resolve them.'}
        </p>
      )}

      {s && (
        <p className="text-[11px] text-slate-500">
          Last run ({s.mode}): {s.invoices} invoice(s) read, {s.created} line(s) added, {s.skipped} already synced
          {s.removed ? `, ${s.removed} removed` : ''}{s.errors.length ? `, ${s.errors.length} failed: ${s.errors.map((e) => `${e.invoice} (${e.error})`).join('; ')}` : ''}.
        </p>
      )}

      {mappingOpen && (
        <QboMappingModal
          showToast={showToast}
          onClose={() => { setMappingOpen(false); load(); onSynced?.(); }}
        />
      )}
    </div>
  );
}
