import Icon from './Icon';

export default function Toast({ message, type = 'success' }) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center space-x-2.5 px-4 py-3 rounded-xl shadow-2xl border text-white animate-in slide-in-from-bottom-4 ${
        type === 'error'
          ? 'bg-rose-900 border-rose-700'
          : 'bg-slate-900 border-slate-700'
      }`}
    >
      <Icon
        name={type === 'error' ? 'AlertTriangle' : 'CheckCircle2'}
        size={18}
        className={type === 'error' ? 'text-rose-400' : 'text-emerald-400'}
      />
      <span className="text-xs font-semibold">{message}</span>
    </div>
  );
}
