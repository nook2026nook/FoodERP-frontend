import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authAPI, errorMessage } from '../api/client';
import Icon from './Icon';

export default function LoginModal({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loginMutation = useMutation({
    mutationFn: () => authAPI.login(email, password),
    onSuccess: (response) => {
      setErrorMsg('');
      onLogin(response.data);
    },
    onError: (error) => {
      setErrorMsg(errorMessage(error, 'Login failed. Please try again.'));
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    loginMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl border border-slate-200 space-y-6">
        <div className="text-center space-y-3">
          <div className="h-12 px-4 bg-slate-900 rounded-2xl mx-auto flex items-center justify-center shadow-lg">
            <img
              src="/Logo.png"
              alt="Nature's Mix"
              className="h-8 object-contain filter brightness-0 invert"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'https://placehold.co/120x40/0f172a/ffffff?text=Nature%27s+Mix';
              }}
            />
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            Production Batch & Traceability Login
          </h2>
          <p className="text-xs text-slate-500">
            Sign in with your credentials to access plant operations.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              User Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/20 transition"
          >
            {loginMutation.isPending ? 'Signing In...' : 'Sign In to ERP'}
          </button>
        </form>

        <div className="text-center text-xs text-slate-400">
          <p>Secure authentication with role-based access control</p>
          <p className="mt-2">
            <a href="/privacy" className="underline hover:text-slate-600">Privacy Policy</a>
            {' · '}
            <a href="/terms" className="underline hover:text-slate-600">Terms &amp; Conditions</a>
          </p>
        </div>
      </div>
    </div>
  );
}
