'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, RefreshCcw, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import { getErrorMessage } from '@/lib/metrics';

interface AuditEventRecord {
  id: number;
  eventType: string;
  source: string;
  severity: 'info' | 'warning' | 'critical';
  entityKey: string;
  entityLabel: string;
  message: string;
  payload: Record<string, unknown>;
  eventAt: string;
  createdAt: string;
}

interface AuditResponse {
  ok: boolean;
  storageEnabled: boolean;
  message?: string;
  events: AuditEventRecord[];
}

function severityToIndicator(severity: AuditEventRecord['severity']) {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  return 'healthy';
}

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all');

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/ops/history/audit?limit=200', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch audit log');
      const json = (await response.json()) as AuditResponse;
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

  const events = useMemo(() => {
    const items = data?.events || [];
    if (severityFilter === 'all') return items;
    return items.filter((item) => item.severity === severityFilter);
  }, [data?.events, severityFilter]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded-md" />
        <div className="h-[320px] bg-muted animate-pulse rounded-lg border border-border" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <h2 className="text-lg font-bold text-destructive flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Audit Log Error
        </h2>
        <p className="text-muted-foreground mt-2">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in animate-slide-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Audit Log</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Perubahan operasional penting seperti reboot required, collector, service state, dan metric gap.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'info', 'warning', 'critical'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setSeverityFilter(filter)}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                severityFilter === filter
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {filter === 'all' ? 'Semua' : filter}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchData();
            }}
            className="rounded-md border border-border bg-card p-2 hover:bg-muted transition-colors"
            aria-label="Refresh audit log"
          >
            <RefreshCcw className="h-4 w-4 text-primary" />
          </button>
        </div>
      </div>

      {!data?.storageEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {data?.message || 'Storage audit belum aktif.'}
        </div>
      )}

      <section className="panel-surface rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-white/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-slate-500" />
            <div>
              <h2 className="font-semibold">Operational Events</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Event audit disimpan saat ada perubahan state penting</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 md:hidden">
          {events.map((event) => (
            <article key={event.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{event.entityLabel}</p>
                  <p className="text-xs text-muted-foreground">{event.eventType}</p>
                </div>
                <StatusIndicator status={severityToIndicator(event.severity)} text={event.severity.toUpperCase()} />
              </div>
              <p className="text-sm text-slate-700">{event.message}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Source</p>
                  <p className="capitalize">{event.source}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Event At</p>
                  <p className="font-mono text-xs">{format(new Date(event.eventAt), 'dd MMM yyyy HH:mm:ss')}</p>
                </div>
              </div>
            </article>
          ))}
          {events.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground">Belum ada audit event yang tersimpan.</div>
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
              <tr>
                <th className="px-5 py-4 font-medium">Entity</th>
                <th className="px-5 py-4 font-medium">Event Type</th>
                <th className="px-5 py-4 font-medium">Severity</th>
                <th className="px-5 py-4 font-medium">Source</th>
                <th className="px-5 py-4 font-medium">Message</th>
                <th className="px-5 py-4 font-medium">Event At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-medium">{event.entityLabel}</p>
                    <p className="text-xs text-muted-foreground">{event.entityKey}</p>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs">{event.eventType}</td>
                  <td className="px-5 py-4">
                    <StatusIndicator status={severityToIndicator(event.severity)} text={event.severity.toUpperCase()} />
                  </td>
                  <td className="px-5 py-4 capitalize">{event.source}</td>
                  <td className="px-5 py-4">{event.message}</td>
                  <td className="px-5 py-4 font-mono text-xs">{format(new Date(event.eventAt), 'dd MMM yyyy HH:mm')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
