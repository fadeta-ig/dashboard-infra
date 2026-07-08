'use client';

import { FormEvent, useState } from 'react';
import { Activity, LockKeyhole, ShieldCheck, Server } from 'lucide-react';
import { getErrorMessage } from '@/lib/metrics';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Login gagal.');
      }

      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get('next') || '/';
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.10),_transparent_34%),linear-gradient(135deg,_#f8fafc_0%,_#eef2f7_100%)] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
        <section className="hidden lg:block space-y-8">
          <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-sm font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full bg-healthy" />
            Internal observability console
          </div>
          <div className="space-y-5">
            <h1 className="max-w-xl text-5xl font-semibold tracking-tight text-slate-950">
              Monitoring Server Ubuntu WIG
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              Dashboard ringan untuk membaca kondisi server Ubuntu, jaringan internet, Prometheus targets, dan fase pengembangan MikroTik dari satu tempat yang aman.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 max-w-2xl">
            {[
              { label: 'Server', value: 'CPU, RAM, Disk', icon: Server },
              { label: 'Network', value: 'Ping, Latency', icon: Activity },
              { label: 'Secure', value: 'Session Login', icon: ShieldCheck },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-white/80 bg-white/70 p-4 shadow-sm">
                <item.icon className="h-5 w-5 text-slate-950" />
                <p className="mt-4 text-sm font-semibold text-slate-900">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="w-full max-w-md justify-self-center rounded-lg border border-slate-200 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white">
                <Activity className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Masuk Dashboard</h2>
              <p className="mt-2 text-sm text-slate-500">Gunakan akun internal IT untuk membuka monitoring.</p>
            </div>
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Protected</div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-slate-700">Username</label>
              <input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
                required
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LockKeyhole className="h-4 w-4" />
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
