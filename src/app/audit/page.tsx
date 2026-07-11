'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, RefreshCcw, Search, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import { PaginationControls } from '@/components/dashboard/pagination-controls';
import { SortHeaderButton } from '@/components/dashboard/sort-header-button';
import { getErrorMessage } from '@/lib/metrics';
import { type PaginationMeta } from '@/lib/pagination';
import { useStoredPageSize } from '@/lib/use-stored-page-size';

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
  pagination: PaginationMeta;
  summary: {
    total: number;
    info: number;
    warning: number;
    critical: number;
  };
}

type AuditSort = 'eventAt' | 'entity' | 'eventType' | 'severity' | 'source' | 'message';
type SortDirection = 'asc' | 'desc';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<AuditSort>('eventAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useStoredPageSize('audit');

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort: sortBy,
        direction: sortDirection,
      });
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      const response = await fetch(`/api/ops/history/audit?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch audit log');
      const json = (await response.json()) as AuditResponse;
      setData(json);
      if (json.pagination.page !== page) setPage(json.pagination.page);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchTerm, severityFilter, sortBy, sortDirection]);

  const handleSort = (sortKey: AuditSort) => {
    if (sortKey === sortBy) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(sortKey);
      setSortDirection(sortKey === 'eventAt' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  useEffect(() => {
    const initial = window.setTimeout(() => void fetchData(), 0);
    const interval = window.setInterval(() => void fetchData(), 30000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [fetchData]);

  const events = useMemo(() => data?.events || [], [data?.events]);

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
              onClick={() => {
                setSeverityFilter(filter);
                setPage(1);
              }}
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

      {data?.storageEnabled && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="panel-surface rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Event</p>
            <p className="mt-2 text-2xl font-semibold">{data.summary.total}</p>
          </div>
          <div className="panel-surface rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Critical</p>
            <p className="mt-2 text-2xl font-semibold text-red-600">{data.summary.critical}</p>
          </div>
          <div className="panel-surface rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Warning</p>
            <p className="mt-2 text-2xl font-semibold text-amber-600">{data.summary.warning}</p>
          </div>
          <div className="panel-surface rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Info</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-600">{data.summary.info}</p>
          </div>
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
        <div className="grid gap-3 border-b border-border bg-white/40 px-5 py-4 lg:grid-cols-[minmax(260px,1fr)_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
              placeholder="Cari event, entity, source, atau pesan audit..."
              className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:bg-muted/40 focus:border-slate-400"
            />
          </label>
          <select
            value={`${sortBy}:${sortDirection}`}
            onChange={(event) => {
              const [nextSort, nextDirection] = event.target.value.split(':') as [AuditSort, SortDirection];
              setSortBy(nextSort);
              setSortDirection(nextDirection);
              setPage(1);
            }}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none transition-colors hover:bg-muted/40 focus:border-slate-400"
            aria-label="Urutkan audit"
          >
            <option value="eventAt:desc">Event terbaru</option>
            <option value="eventAt:asc">Event terlama</option>
            <option value="severity:desc">Severity tertinggi</option>
            <option value="entity:asc">Entity A-Z</option>
            <option value="eventType:asc">Event type A-Z</option>
          </select>
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
                <th className="px-5 py-4 font-medium">
                  <SortHeaderButton label="Entity" sortKey="entity" activeSort={sortBy} direction={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-5 py-4 font-medium">
                  <SortHeaderButton label="Event Type" sortKey="eventType" activeSort={sortBy} direction={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-5 py-4 font-medium">
                  <SortHeaderButton label="Severity" sortKey="severity" activeSort={sortBy} direction={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-5 py-4 font-medium">
                  <SortHeaderButton label="Source" sortKey="source" activeSort={sortBy} direction={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-5 py-4 font-medium">
                  <SortHeaderButton label="Message" sortKey="message" activeSort={sortBy} direction={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-5 py-4 font-medium">
                  <SortHeaderButton label="Event At" sortKey="eventAt" activeSort={sortBy} direction={sortDirection} onSort={handleSort} />
                </th>
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
        {data?.pagination && (
          <PaginationControls
            pagination={data.pagination}
            itemLabel="event"
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            }}
          />
        )}
      </section>
    </div>
  );
}
