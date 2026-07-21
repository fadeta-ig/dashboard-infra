'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCcw, Search } from 'lucide-react';
import { format } from 'date-fns';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import { PaginationControls } from '@/components/dashboard/pagination-controls';
import type { TargetHealth } from '@/lib/types';
import { getErrorMessage } from '@/lib/metrics';
import { paginateItems } from '@/lib/pagination';

interface TargetsResponse {
  targets: TargetHealth[];
  timestamp: string;
}

export default function TargetsPage() {
  const [data, setData] = useState<TargetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/metrics/targets', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch targets');
      const json = (await response.json()) as TargetsResponse;
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void fetchData();
    }, 0);
    const interval = window.setInterval(() => {
      void fetchData();
    }, 15000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [fetchData]);

  const filteredTargets = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const targets = data?.targets || [];
    if (!query) return targets;
    return targets.filter((target) => (
      target.job.toLowerCase().includes(query) ||
      target.instance.toLowerCase().includes(query) ||
      String(target.value).includes(query) ||
      (target.up ? 'up' : 'down').includes(query)
    ));
  }, [data?.targets, searchTerm]);

  const pagedTargets = useMemo(
    () => paginateItems(filteredTargets, page),
    [filteredTargets, page],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded-md" />
        <div className="h-[400px] bg-muted animate-pulse rounded-lg border border-border" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <h2 className="text-lg font-bold text-destructive flex items-center gap-2">
          <Activity className="h-5 w-5" /> Connection Error
        </h2>
        <p className="text-muted-foreground mt-2">{error || 'Target data is unavailable.'}</p>
        <button onClick={() => void fetchData()} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90">
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Monitoring Targets</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">Status of all monitored endpoints from query up</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground font-medium">
            Last updated: {format(new Date(data.timestamp), 'HH:mm:ss')}
          </span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchData();
            }}
            className="p-2 bg-card border border-border rounded-md hover:bg-muted transition-colors"
            aria-label="Refresh targets"
          >
            <RefreshCcw className="h-4 w-4 text-primary" />
          </button>
        </div>
      </div>

      <div className="panel-surface rounded-lg overflow-hidden">
        <div className="border-b border-border bg-white/60 px-5 py-4">
          <label className="relative block max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
              placeholder="Cari job, instance, UP/DOWN, atau value..."
              className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:bg-muted/40 focus:border-slate-400"
            />
          </label>
        </div>
        <div className="grid gap-3 p-4 md:hidden">
          {pagedTargets.items.map((targetItem) => (
            <div key={`${targetItem.job}-${targetItem.instance}`} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{targetItem.job}</p>
                  <p className="font-mono text-xs text-muted-foreground break-all">{targetItem.instance}</p>
                </div>
                <StatusIndicator status={targetItem.up ? 'healthy' : 'critical'} text={targetItem.up ? 'UP' : 'DOWN'} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Value</p>
                  <p className="font-mono">{targetItem.value}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Last Checked</p>
                  <p className="font-mono">{format(new Date(targetItem.lastChecked), 'HH:mm:ss')}</p>
                </div>
              </div>
            </div>
          ))}
          {pagedTargets.items.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground">No targets found.</div>
          )}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Job</th>
                <th className="px-6 py-4 font-medium">Instance</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Value</th>
                <th className="px-6 py-4 font-medium text-right">Last Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedTargets.items.map((targetItem) => (
                <tr key={`${targetItem.job}-${targetItem.instance}`} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 font-medium">{targetItem.job}</td>
                  <td className="px-6 py-4 font-mono text-muted-foreground">{targetItem.instance}</td>
                  <td className="px-6 py-4">
                    <StatusIndicator status={targetItem.up ? 'healthy' : 'critical'} text={targetItem.up ? 'UP' : 'DOWN'} />
                  </td>
                  <td className="px-6 py-4 font-mono text-right">{targetItem.value}</td>
                  <td className="px-6 py-4 font-mono text-right text-muted-foreground">{format(new Date(targetItem.lastChecked), 'HH:mm:ss')}</td>
                </tr>
              ))}
              {pagedTargets.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    No targets found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          pagination={pagedTargets.meta}
          itemLabel="target"
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}

