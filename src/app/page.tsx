'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Cpu, HardDrive, MemoryStick, Network, Target, Database } from 'lucide-react';
import { format } from 'date-fns';
import { StatCard } from '@/components/dashboard/stat-card';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import type { NetworkTarget, SummaryResponse } from '@/lib/types';
import { getErrorMessage } from '@/lib/metrics';

function formatPercent(value: number | null) {
  return value === null ? 'Unknown' : `${value.toFixed(1)}%`;
}

function formatNumber(value: number | null, digits = 2) {
  return value === null ? 'Unknown' : value.toFixed(digits);
}

function metricStatus(value: number | null, warning: number, critical: number) {
  if (value === null) return 'unknown';
  if (value > critical) return 'critical';
  if (value >= warning) return 'warning';
  return 'healthy';
}

function LatencyRow({ name, target }: { name: string; target: NetworkTarget }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 font-medium">{name}</td>
      <td className="px-4 py-3 font-mono text-muted-foreground">{target.target}</td>
      <td className="px-4 py-3">
        <StatusIndicator status={target.up === null ? 'unknown' : target.up ? 'healthy' : 'critical'} text={target.up === null ? 'Unknown' : target.up ? 'UP' : 'DOWN'} />
      </td>
      <td className="px-4 py-3 text-right font-mono">{target.latencyMs === null ? 'Unknown' : `${target.latencyMs.toFixed(1)} ms`}</td>
    </tr>
  );
}

export default function SummaryDashboard() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/metrics/summary', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch dashboard summary');
      const json = (await response.json()) as SummaryResponse;
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((item) => (
            <div key={item} className="h-32 bg-muted animate-pulse rounded-lg border border-border" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <h2 className="text-lg font-bold text-destructive flex items-center gap-2">
          <Activity className="h-5 w-5" /> Connection Error
        </h2>
        <p className="text-muted-foreground mt-2">{error || 'Dashboard data is unavailable.'}</p>
        <button onClick={() => void fetchData()} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90">
          Retry Connection
        </button>
      </div>
    );
  }

  const upTargets = data.targets.filter((targetItem) => targetItem.up).length;
  const downTargets = data.targets.filter((targetItem) => !targetItem.up);

  return (
    <div className="space-y-6 animate-fade-in animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">System Summary</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1 font-medium">
            Overall Status: <StatusIndicator status={data.status} text={data.status} />
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          Last updated: {format(new Date(data.timestamp), 'HH:mm:ss')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard title="CPU Usage" value={formatPercent(data.server.cpuUsage)} icon={Cpu} status={metricStatus(data.server.cpuUsage, 70, 85)} />
        <StatCard title="RAM Usage" value={formatPercent(data.server.ramUsage)} icon={MemoryStick} status={metricStatus(data.server.ramUsage, 75, 85)} />
        <StatCard title="RAM Available" value={`${formatNumber(data.server.ramAvailableGb)} GB`} icon={Database} status={data.server.ramAvailableGb === null ? 'unknown' : 'healthy'} />
        <StatCard title="Disk Root Usage" value={formatPercent(data.server.diskUsage)} icon={HardDrive} status={metricStatus(data.server.diskUsage, 80, 90)} />
        <StatCard title="Load Average (1m)" value={formatNumber(data.server.load1)} icon={Activity} status={metricStatus(data.server.load1, 2, 4)} />
        <StatCard
          title="Internet Status"
          value={data.network.internetStatus === 'healthy' ? 'Online' : data.network.internetStatus === 'degraded' ? 'Degraded' : data.network.internetStatus === 'critical' ? 'Offline' : 'Unknown'}
          icon={Network}
          status={data.network.internetStatus}
        />
        <StatCard title="Monitoring Targets" value={`${upTargets} / ${data.targets.length}`} icon={Target} status={downTargets.length > 0 ? 'critical' : data.targets.length === 0 ? 'unknown' : 'healthy'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <section className="bg-card border border-border/60 rounded-lg overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border bg-muted/40">
            <h2 className="font-semibold text-primary">Latency Table</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase text-muted-foreground bg-muted/30">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Latency</th>
                </tr>
              </thead>
              <tbody>
                <LatencyRow name="MikroTik Gateway" target={data.network.gateway} />
                <LatencyRow name="Google DNS" target={data.network.googleDns} />
                <LatencyRow name="Cloudflare DNS" target={data.network.cloudflareDns} />
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-card border border-border/60 rounded-lg overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border bg-muted/40">
            <h2 className="font-semibold text-primary">Targets Down</h2>
          </div>
          <div className="divide-y divide-border">
            {downTargets.length > 0 ? downTargets.map((targetItem) => (
              <div key={`${targetItem.job}-${targetItem.instance}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="font-mono text-muted-foreground break-all">{targetItem.job} ({targetItem.instance})</span>
                <StatusIndicator status="critical" text="DOWN" />
              </div>
            )) : (
              <div className="px-4 py-6 text-sm text-muted-foreground">No unreachable Prometheus targets.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
