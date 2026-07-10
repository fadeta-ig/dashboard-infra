'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCcw, ShieldAlert } from 'lucide-react';
import { format, formatDistanceStrict } from 'date-fns';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import { getErrorMessage } from '@/lib/metrics';

interface IncidentRecord {
  id: number;
  source: string;
  domainKey: string;
  incidentKey: string;
  title: string;
  status: 'open' | 'resolved';
  severity: 'warning' | 'critical';
  entityType: string;
  entityKey: string;
  entityLabel: string;
  startedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface IncidentsResponse {
  ok: boolean;
  storageEnabled: boolean;
  message?: string;
  incidents: IncidentRecord[];
}

function severityText(severity: IncidentRecord['severity']) {
  return severity === 'critical' ? 'Critical' : 'Warning';
}

function incidentStatusToIndicator(status: IncidentRecord['status']) {
  return status === 'open' ? 'critical' : 'healthy';
}

function formatDurationValue(incident: IncidentRecord) {
  if (incident.status === 'open') {
    return `Open for ${formatDistanceStrict(new Date(incident.startedAt), new Date())}`;
  }
  if (incident.resolvedAt) {
    return formatDistanceStrict(new Date(incident.startedAt), new Date(incident.resolvedAt));
  }
  return 'N/A';
}

export default function IncidentsPage() {
  const [data, setData] = useState<IncidentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/ops/history/incidents?limit=200', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch incident history');
      const json = (await response.json()) as IncidentsResponse;
      setData(json);
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

  const incidents = useMemo(() => {
    const items = data?.incidents || [];
    if (statusFilter === 'all') return items;
    return items.filter((item) => item.status === statusFilter);
  }, [data?.incidents, statusFilter]);

  const openCount = data?.incidents.filter((item) => item.status === 'open').length || 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-[320px] rounded-lg border border-border bg-muted animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-destructive">
          <AlertTriangle className="h-5 w-5" /> Incident History Error
        </h2>
        <p className="mt-2 text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in animate-slide-up space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Incident History</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Timeline histori target down/up yang tersimpan ke MySQL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'open', 'resolved'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                statusFilter === filter
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {filter === 'all' ? 'Semua' : filter === 'open' ? 'Open' : 'Resolved'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchData();
            }}
            className="rounded-md border border-border bg-card p-2 transition-colors hover:bg-muted"
            aria-label="Refresh incidents"
          >
            <RefreshCcw className="h-4 w-4 text-primary" />
          </button>
        </div>
      </div>

      {!data?.storageEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {data?.message || 'Storage history belum aktif.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="panel-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Incident</p>
          <p className="mt-2 text-2xl font-semibold">{data?.incidents.length || 0}</p>
        </div>
        <div className="panel-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Open Incident</p>
          <p className="mt-2 text-2xl font-semibold text-red-600">{openCount}</p>
        </div>
        <div className="panel-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Resolved</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">
            {(data?.incidents.length || 0) - openCount}
          </p>
        </div>
        <div className="panel-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Source</p>
          <p className="mt-2 text-lg font-semibold">Prometheus / Backend</p>
        </div>
      </div>

      <section className="panel-surface overflow-hidden rounded-lg">
        <div className="flex items-center justify-between gap-4 border-b border-border bg-white/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-4 w-4 text-slate-500" />
            <div>
              <h2 className="font-semibold">Incident Timeline</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Status target disimpan saat transisi down/up</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 md:hidden">
          {incidents.map((incident) => (
            <article key={incident.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{incident.title}</p>
                  <p className="break-all text-xs text-muted-foreground">{incident.entityLabel}</p>
                </div>
                <StatusIndicator status={incidentStatusToIndicator(incident.status)} text={incident.status.toUpperCase()} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Severity</p>
                  <p className={incident.severity === 'critical' ? 'font-semibold text-red-600' : 'font-semibold text-amber-600'}>
                    {severityText(incident.severity)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Domain</p>
                  <p className="capitalize">{incident.domainKey}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs uppercase text-muted-foreground">Started</p>
                  <p className="font-mono text-xs">{format(new Date(incident.startedAt), 'dd MMM yyyy HH:mm:ss')}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs uppercase text-muted-foreground">Duration</p>
                  <p>{formatDurationValue(incident)}</p>
                </div>
              </div>
            </article>
          ))}
          {incidents.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground">Belum ada incident yang tersimpan.</div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-4 font-medium">Incident</th>
                <th className="px-5 py-4 font-medium">Domain</th>
                <th className="px-5 py-4 font-medium">Severity</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Started</th>
                <th className="px-5 py-4 font-medium">Resolved</th>
                <th className="px-5 py-4 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {incidents.map((incident) => (
                <tr key={incident.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-5 py-4">
                    <p className="font-medium">{incident.title}</p>
                    <p className="text-xs text-muted-foreground">{incident.entityLabel}</p>
                  </td>
                  <td className="px-5 py-4 capitalize">{incident.domainKey}</td>
                  <td className="px-5 py-4">
                    <span className={incident.severity === 'critical' ? 'font-semibold text-red-600' : 'font-semibold text-amber-600'}>
                      {severityText(incident.severity)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <StatusIndicator status={incidentStatusToIndicator(incident.status)} text={incident.status.toUpperCase()} />
                  </td>
                  <td className="px-5 py-4 font-mono text-xs">{format(new Date(incident.startedAt), 'dd MMM yyyy HH:mm')}</td>
                  <td className="px-5 py-4 font-mono text-xs">
                    {incident.resolvedAt ? format(new Date(incident.resolvedAt), 'dd MMM yyyy HH:mm') : '-'}
                  </td>
                  <td className="px-5 py-4">{formatDurationValue(incident)}</td>
                </tr>
              ))}
              {incidents.length === 0 && (
                <tr>
                  <td className="px-5 py-8 text-center text-muted-foreground" colSpan={7}>
                    Belum ada incident yang tersimpan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
