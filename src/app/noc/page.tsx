'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock, RefreshCcw, ShieldAlert } from 'lucide-react';
import { format, formatDistanceStrict } from 'date-fns';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import { getErrorMessage } from '@/lib/metrics';

interface NocResponse {
  ok: boolean;
  timestamp: string;
  internetStatus: string;
  categories: Array<{
    category: string;
    label: string;
    status: 'healthy' | 'warning' | 'critical';
    total: number;
    up: number;
    down: number;
    unknown: number;
    avgLatencyMs: number | null;
    sla: {
      targetAvailabilityPercent: number;
      responseMinutes: number;
      resolutionMinutes: number;
    } | null;
  }>;
  openIncidents: Array<{
    id: number;
    title: string;
    severity: 'warning' | 'critical';
    domainKey: string;
    entityLabel: string;
    startedAt: string;
    acknowledgedAt: string | null;
  }>;
  maintenanceWindows: Array<{
    scope: string;
    value: string;
    startsAt: string;
    endsAt: string;
    reason: string;
  }>;
}

function statusLabel(status: string) {
  if (status === 'critical') return 'Critical';
  if (status === 'warning') return 'Warning';
  return 'Healthy';
}

export default function NocPage() {
  const [data, setData] = useState<NocResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/ops/noc', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch NOC dashboard');
      setData((await response.json()) as NocResponse);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void fetchData(), 0);
    const interval = window.setInterval(() => void fetchData(), 30000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-36 animate-pulse rounded-lg border border-border bg-muted" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-destructive">
          <AlertTriangle className="h-5 w-5" /> NOC Dashboard Error
        </h2>
        <p className="mt-2 text-muted-foreground">{error || 'NOC data unavailable.'}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in animate-slide-up space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">NOC Dashboard</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Tampilan operator untuk SLA kategori, incident aktif, dan maintenance window.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Updated {format(new Date(data.timestamp), 'HH:mm:ss')}</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchData();
            }}
            className="rounded-md border border-border bg-card p-2 hover:bg-muted"
            aria-label="Refresh NOC"
          >
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.categories.map((category) => (
          <article key={category.category} className="panel-surface rounded-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{category.category}</p>
                <h2 className="mt-1 text-lg font-semibold">{category.label}</h2>
              </div>
              <StatusIndicator status={category.status} text={statusLabel(category.status)} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-emerald-50 px-2 py-2 text-emerald-700">
                <p className="text-lg font-semibold">{category.up}</p>
                <p className="text-[10px] uppercase">UP</p>
              </div>
              <div className="rounded-md bg-red-50 px-2 py-2 text-red-700">
                <p className="text-lg font-semibold">{category.down}</p>
                <p className="text-[10px] uppercase">Down</p>
              </div>
              <div className="rounded-md bg-slate-50 px-2 py-2 text-slate-600">
                <p className="text-lg font-semibold">{category.unknown}</p>
                <p className="text-[10px] uppercase">Unknown</p>
              </div>
            </div>
            <div className="mt-4 text-xs leading-5 text-muted-foreground">
              <p>Avg latency: <span className="font-mono text-foreground">{category.avgLatencyMs === null ? '-' : `${category.avgLatencyMs} ms`}</span></p>
              <p>SLA target: <span className="font-mono text-foreground">{category.sla ? `${category.sla.targetAvailabilityPercent}%` : '-'}</span></p>
              <p>Response: <span className="font-mono text-foreground">{category.sla ? `${category.sla.responseMinutes} menit` : '-'}</span></p>
            </div>
          </article>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel-surface overflow-hidden rounded-lg">
          <div className="flex items-center gap-3 border-b border-border bg-white/60 px-5 py-4">
            <ShieldAlert className="h-4 w-4 text-slate-500" />
            <div>
              <h2 className="font-semibold">Open Incidents</h2>
              <p className="text-xs text-muted-foreground">Incident aktif yang perlu atensi operator</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {data.openIncidents.map((incident) => (
              <article key={incident.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_140px_160px] md:items-center">
                <div>
                  <p className="font-semibold">{incident.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{incident.entityLabel} / {incident.domainKey}</p>
                </div>
                <StatusIndicator status={incident.severity === 'critical' ? 'critical' : 'warning'} text={incident.severity.toUpperCase()} />
                <div className="text-xs text-muted-foreground md:text-right">
                  <p>{formatDistanceStrict(new Date(incident.startedAt), new Date())}</p>
                  <p>{incident.acknowledgedAt ? 'Acknowledged' : 'Belum ack'}</p>
                </div>
              </article>
            ))}
            {data.openIncidents.length === 0 && <div className="px-5 py-8 text-center text-muted-foreground">Tidak ada incident open.</div>}
          </div>
        </section>

        <aside className="panel-surface rounded-lg p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-700"><Clock className="h-4 w-4" /></div>
            <div>
              <h2 className="font-semibold">Maintenance Aktif</h2>
              <p className="text-xs text-muted-foreground">Alert pada scope ini disuppress</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {data.maintenanceWindows.map((window, index) => (
              <div key={`${window.scope}-${window.value}-${index}`} className="rounded-md border border-border bg-card p-3">
                <p className="text-sm font-semibold">{window.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">{window.scope}: {window.value || 'all'}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {format(new Date(window.startsAt), 'dd MMM HH:mm')} - {format(new Date(window.endsAt), 'dd MMM HH:mm')}
                </p>
              </div>
            ))}
            {data.maintenanceWindows.length === 0 && (
              <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Tidak ada maintenance window aktif.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
