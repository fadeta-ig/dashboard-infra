'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Clock3, RefreshCw } from 'lucide-react';
import { evaluateFreshness, type Freshness } from '@/lib/freshness';

interface HealthSource { key: string; label: string; detail: string; freshness: Freshness }
export const freshnessLabels = { fresh: 'Data terkini', stale: 'Data kedaluwarsa', unavailable: 'Belum tersedia' };
export const freshnessTones = { fresh: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', stale: 'bg-amber-50 text-amber-800 ring-amber-600/15', unavailable: 'bg-slate-100 text-slate-600 ring-slate-500/15' };

export function MonitoringHealth({ onMetricsFreshnessChange }: { onMetricsFreshnessChange?: (state: Freshness['state']) => void }) {
  const [sources, setSources] = useState<HealthSource[]>([]);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(0);
  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/metrics/health', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('unavailable');
      const result = await response.json() as { sources: HealthSource[] };
      setSources(result.sources);
      const metric = result.sources.find((source) => source.key === 'prometheus');
      onMetricsFreshnessChange?.(metric ? evaluateFreshness(metric.freshness.observedAt, metric.freshness.maxAgeSeconds * 1000).state : 'unavailable');
      setError(false);
    } catch { setError(true); onMetricsFreshnessChange?.('unavailable'); }
    finally { setChecking(false); setNow(Date.now()); }
  }, [onMetricsFreshnessChange]);
  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 30000);
    const tick = window.setInterval(() => setNow(Date.now()), 15000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); window.clearInterval(tick); };
  }, [refresh]);
  return (
    <section aria-label="Kesegaran data monitoring" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5"><Activity className="h-4 w-4 text-slate-500" /><h2 className="text-sm font-semibold">Kualitas data monitoring</h2></div>
        <button type="button" onClick={() => void refresh()} disabled={checking} aria-label="Perbarui kualitas data" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} /></button>
      </div>
      {error && <p role="status" className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-800">Pemeriksaan terakhir gagal. Informasi sebelumnya belum dapat dikonfirmasi; coba perbarui.</p>}
      <div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
        {!sources.length && <p className="p-5 text-sm text-slate-500">{error ? 'Status sumber data belum tersedia.' : 'Memeriksa sumber data…'}</p>}
        {sources.map((source) => {
          const fresh = evaluateFreshness(source.freshness.observedAt, source.freshness.maxAgeSeconds * 1000, now);
          const state = error && fresh.state === 'fresh' ? 'unavailable' : fresh.state;
          return <div key={source.key} className="min-w-0 p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{source.label}</p><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${freshnessTones[state]}`}>{freshnessLabels[state]}</span></div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5 shrink-0" />{fresh.observedAt ? new Date(fresh.observedAt).toLocaleString('id-ID') : 'Belum ada waktu pengamatan'}</p>
            <p className="mt-2 hidden text-xs leading-5 text-slate-500 md:block">{source.detail}</p>
          </div>;
        })}
      </div>
    </section>
  );
}
