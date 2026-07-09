'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, Clock, Cpu, Database, HardDrive, MemoryStick, Network, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { SummaryResponse, ServerMetrics } from '@/lib/types';
import { getErrorMessage } from '@/lib/metrics';

interface ReadinessCategorySummary {
  key: string;
  title: string;
  status: 'ready' | 'partial' | 'missing';
  requiredReady: number;
  requiredTotal: number;
}

interface ReadinessSummary {
  prometheusReachable: boolean;
  categories: ReadinessCategorySummary[];
}

function formatPercent(value: number | null) {
  return value === null ? 'N/A' : `${value.toFixed(1)}%`;
}

function formatMBps(bytesPerSec: number | null) {
  if (bytesPerSec === null) return 'N/A';
  const mbps = bytesPerSec / 1_048_576;
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`;
  const kbps = bytesPerSec / 1024;
  return `${kbps.toFixed(0)} KB/s`;
}

function formatUptime(seconds: number | null) {
  if (seconds === null) return 'Unknown';
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

export default function SummaryDashboard() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [serverStats, setServerStats] = useState<ServerMetrics | null>(null);
  const [readiness, setReadiness] = useState<ReadinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, serverRes, readinessRes] = await Promise.all([
        fetch('/api/metrics/summary', { cache: 'no-store' }),
        fetch('/api/metrics/server', { cache: 'no-store' }),
        fetch('/api/metrics/readiness', { cache: 'no-store' }),
      ]);

      if (!summaryRes.ok) throw new Error('Failed to fetch dashboard summary');
      if (!serverRes.ok) throw new Error('Failed to fetch server metrics');

      setData((await summaryRes.json()) as SummaryResponse);
      setServerStats((await serverRes.json()) as ServerMetrics);
      
      if (readinessRes.ok) {
        setReadiness((await readinessRes.json()) as ReadinessSummary);
      }

      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void fetchData(), 0);
    const interval = window.setInterval(() => void fetchData(), 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200 animate-pulse rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-[200px] bg-slate-200 animate-pulse rounded" />
          <div className="h-[200px] bg-slate-200 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (error || !data || !serverStats) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2">
          <XCircle className="h-5 w-5" /> Connection Failed
        </h2>
        <p className="text-red-600 text-sm mt-2">{error || 'Data unavailable.'}</p>
        <button onClick={() => void fetchData()} className="mt-4 px-4 py-2 bg-red-700 text-white rounded text-sm font-medium hover:bg-red-800 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  const isHealthy = data.status === 'healthy';
  const upTargets = data.targets.filter((t) => t.up).length;
  const totalTargets = data.targets.length;
  const downTargets = data.targets.filter((t) => !t.up);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Overview
          </h1>
          <p className="text-sm font-medium text-slate-500">
            Infrastructure monitoring for Ubuntu WIG
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Status:</span>
          <div className="flex items-center gap-1.5 font-medium">
            <span className={cn("inline-block h-2 w-2 rounded-full", isHealthy ? "bg-emerald-500" : data.status === 'warning' ? 'bg-amber-500' : 'bg-red-500')} />
            <span className="capitalize text-slate-900">{data.status}</span>
          </div>
        </div>
      </div>

      {/* Flat Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Main Status Panel */}
        <div className="panel-surface rounded p-6 lg:col-span-8 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {isHealthy ? 'System Operational' : 'Action Required'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {upTargets} of {totalTargets} targets are active and responding.
                </p>
              </div>
              {isHealthy ? <CheckCircle2 className="h-6 w-6 text-emerald-500" /> : <XCircle className="h-6 w-6 text-red-500" />}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
              <StatsBlock label="Uptime" value={formatUptime(serverStats.uptimeSeconds)} />
              <StatsBlock label="Internet" value={data.network.internetStatus} capitalize />
              <StatsBlock label="Load (1m)" value={serverStats.load1?.toFixed(2) ?? 'N/A'} />
              <StatsBlock label="Updated" value={format(new Date(data.timestamp), 'HH:mm:ss')} />
            </div>
          </div>
        </div>

        {/* Small Metrics */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-4">
          <FlatMetric title="CPU Usage" value={formatPercent(serverStats.cpuUsage)} icon={Cpu} />
          <FlatMetric title="RAM Usage" value={formatPercent(serverStats.ramUsage)} icon={MemoryStick} />
          <FlatMetric title="Swap Usage" value={serverStats.swapTotalGb === 0 ? '0%' : formatPercent(serverStats.swapUsagePercent)} icon={Database} />
          <FlatMetric title="Disk Root" value={formatPercent(serverStats.diskUsage)} icon={HardDrive} />
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Throughput */}
        <div className="panel-surface rounded p-5 lg:col-span-1 animate-slide-up delay-75">
          <h3 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wider">Throughput</h3>
          <div className="space-y-4">
            <TrafficRow label="Net RX" value={formatMBps(serverStats.netRxBytesPerSec)} />
            <TrafficRow label="Net TX" value={formatMBps(serverStats.netTxBytesPerSec)} />
            <div className="h-px bg-slate-100" />
            <TrafficRow label="Disk Read" value={formatMBps(serverStats.diskReadBytesPerSec)} />
            <TrafficRow label="Disk Write" value={formatMBps(serverStats.diskWriteBytesPerSec)} />
          </div>
        </div>

        {/* Readiness */}
        <div className="panel-surface rounded p-5 lg:col-span-2 animate-slide-up delay-150">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wider">Readiness Checks</h3>
            <a href="/panduan" className="text-xs font-medium text-slate-500 hover:text-black transition-colors">
              Panduan &rarr;
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(readiness?.categories || []).map((cat) => (
              <div key={cat.key} className="flex items-center justify-between p-3 rounded bg-slate-50 border border-slate-100">
                <span className="font-medium text-sm text-slate-700">{cat.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">
                    {cat.requiredReady}/{cat.requiredTotal}
                  </span>
                  {cat.status === 'ready' ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  ) : cat.status === 'partial' ? (
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Down Targets */}
      {downTargets.length > 0 && (
        <div className="panel-surface rounded p-5 border-red-200 animate-slide-up delay-300">
          <h3 className="font-semibold text-red-700 text-sm uppercase tracking-wider mb-3">Unreachable Targets</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {downTargets.map((t) => (
              <div key={`${t.job}-${t.instance}`} className="bg-red-50 text-red-800 px-3 py-2 rounded border border-red-100 flex justify-between items-center text-sm">
                <span className="font-medium">{t.job}</span>
                <span className="font-mono text-xs">{t.instance}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function StatsBlock({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={cn("text-lg font-semibold text-slate-900", capitalize && "capitalize")}>{value}</p>
    </div>
  );
}

function FlatMetric({ title, value, icon: Icon }: { title: string; value: string; icon: React.ElementType }) {
  return (
    <div className="panel-surface rounded p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500">{title}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className="text-xl font-semibold text-slate-900 tracking-tight">{value}</p>
    </div>
  );
}

function TrafficRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      <span className="font-mono font-medium text-slate-900">{value}</span>
    </div>
  );
}
