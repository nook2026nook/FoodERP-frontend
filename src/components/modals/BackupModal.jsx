import { useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import { adminAPI, errorMessage } from '../../api/client';
import { downloadCsv, todayIso } from '../ui';

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BackupModal({ onClose, showToast }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const exportNow = async () => {
    setBusy(true);
    try {
      const { data } = await adminAPI.exportDatabase();
      downloadJson(`foodtrace_export_${todayIso()}.json`, data);
      showToast('Export downloaded');
    } catch (e) {
      showToast(errorMessage(e, 'Export failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setResult(null);
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError('That file is not valid JSON.');
      return;
    }
    if (!window.confirm(`Import "${file.name}" into the live database? Records that already exist are skipped.`)) return;
    setBusy(true);
    try {
      const { data } = await adminAPI.importDatabase(parsed);
      setResult(data);
      showToast('Import finished');
    } catch (err) {
      setError(errorMessage(err, 'Import failed; nothing was changed'));
    } finally {
      setBusy(false);
    }
  };

  const created = result ? Object.entries(result.created) : [];
  const skipped = result ? Object.entries(result.skipped) : [];

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Backup &amp; Export Database</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
        </div>

        <section className="space-y-2">
          <h4 className="text-xs font-bold uppercase text-slate-700">Export</h4>
          <p className="text-xs text-slate-500">Downloads every record as JSON for safekeeping or an auditor. Passwords and QuickBooks keys are never included. Full restores use the nightly database backups (see BACKUP-RESTORE.md).</p>
          <button onClick={exportNow} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-lg text-xs font-bold disabled:opacity-60">
            <Download size={14} /> Download Export
          </button>
        </section>

        <section className="space-y-2 border-t pt-4">
          <h4 className="text-xs font-bold uppercase text-slate-700">Import from the old browser app</h4>
          <p className="text-xs text-slate-500">Choose a backup file downloaded from the original single-page version. Catalog, lots, recipes, batches, shipments and users are added; anything already here is skipped. If any part fails, nothing is imported.</p>
          <label className={`inline-flex items-center gap-2 px-4 py-2.5 border rounded-lg text-xs font-bold cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : 'hover:bg-slate-50'}`}>
            <Upload size={14} /> Choose Backup File
            <input type="file" accept="application/json,.json" onChange={importFile} className="sr-only" />
          </label>
          {error && <div className="p-2 bg-rose-50 text-rose-700 text-xs font-bold rounded">{error}</div>}
        </section>

        {result && (
          <section className="space-y-3 border-t pt-4 text-xs">
            <div>
              <b>Added:</b> {created.length ? created.map(([k, v]) => `${v} ${k}`).join(', ') : 'nothing new'}
              {skipped.length > 0 && <div className="text-slate-500"><b>Already here:</b> {skipped.map(([k, v]) => `${v} ${k}`).join(', ')}</div>}
            </div>
            {result.warnings.length > 0 && (
              <ul className="list-disc pl-5 space-y-1 text-amber-800">
                {result.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
            {result.temporary_passwords.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <p className="font-bold text-amber-900">Temporary passwords: shown only now. Give each person theirs; they must change it at first sign-in.</p>
                <table className="w-full font-mono">
                  <tbody>
                    {result.temporary_passwords.map((t) => (
                      <tr key={t.email}><td className="pr-3">{t.email}</td><td className="select-all">{t.temporary_password}</td></tr>
                    ))}
                  </tbody>
                </table>
                <button
                  onClick={() => downloadCsv(`temporary_passwords_${todayIso()}.csv`, [['Email', 'Temporary password'], ...result.temporary_passwords.map((t) => [t.email, t.temporary_password])])}
                  className="text-[11px] font-bold text-amber-900 underline"
                >
                  Download as CSV
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
