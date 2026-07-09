'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, Clock, Cpu, Database, HardDrive, MemoryStick, Network, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { SummaryResponse, ServerDetailResponse, NetworkTarget } from '@/lib/types';
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
  if (d > 0) return `${d} days ${h} hours`;
  return `${h} hours`;
}

export default function SummaryDashboard() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [detail, setDetail] = useState<ServerDetailResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, detailRes, readinessRes] = await Promise.all([
        fetch('/api/metrics/summary', { cache: 'no-store' }),
        fetch('/api/metrics/server/detail', { cache: 'no-store' }),
        fetch('/api/metrics/readiness', { cache: 'no-store' }),
      ]);

      if (!summaryRes.ok) throw new Error('Failed to fetch dashboard summary');

      setData((await summaryRes.json()) as SummaryResponse);
      
      if (detailRes.ok) {
        setDetail((await detailRes.json()) as ServerDetailResponse);
      }

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
        <div className="h-10 w-64 bg-slate-200 animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-[300px] bg-slate-200 animate-pulse rounded-2xl" />
          <div className="h-[300px] bg-slate-200 animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 shadow-sm">
        <h2 className="text-xl font-bold text-red-700 flex items-center gap-3">
          <XCircle className="h-6 w-6" /> System Disconnected
        </h2>
        <p className="text-red-600 mt-2">{error || 'Dashboard data is unavailable.'}</p>
        <button onClick={() => void fetchData()} className="mt-6 px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors shadow-sm">
          Attempt Reconnect
        </button>
      </div>
    );
  }

  const isHealthy = data.status === 'healthy';
  const upTargets = data.targets.filter((t) => t.up).length;
  const totalTargets = data.targets.length;
  const downTargets = data.targets.filter((t) => !t.up);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Command <span className="text-gradient">Center</span>
          </h1>
          <p className="text-sm font-medium text-slate-500">
            Infrastructure overview for Ubuntu WIG
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm">
          <div className="relative flex h-3 w-3">
            {isHealthy && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
            <span className={cn("relative inline-flex rounded-full h-3 w-3", isHealthy ? "bg-emerald-500" : data.status === 'warning' ? 'bg-amber-500' : 'bg-red-500')}></span>
          </div>
          <span className="text-sm font-semibold text-slate-700 capitalize">{data.status} Status</span>
        </div>
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Large Hero Card (Status & Uptime) */}
        <div className="panel-surface rounded-3xl p-8 lg:col-span-8 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-blue-100 rounded-full blur-3xl opacity-50 group-hover:opacity-70 transition-opacity duration-500" />
          
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-4">
              <div className={cn(
                "h-14 w-14 rounded-2xl flex items-center justify-center shadow-inner",
                isHealthy ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white" : "bg-gradient-to-br from-red-400 to-red-600 text-white"
              )}>
                {isHealthy ? <CheckCircle2 className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {isHealthy ? 'All Systems Operational' : 'Action Required'}
                </h2>
                <p className="text-sm font-medium text-slate-500">
                  {upTargets} of {totalTargets} targets responding successfully.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100/50">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Uptime</p>
                <p className="text-lg font-bold text-slate-800">{formatUptime(data.server.uptimeSeconds)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1.5"><Network className="h-3.5 w-3.5" /> Internet</p>
                <p className="text-lg font-bold text-slate-800 capitalize">{data.network.internetStatus}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Load (1m)</p>
                <p className="text-lg font-bold text-slate-800">{data.server.load1?.toFixed(2) ?? 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Last Updated</p>
                <p className="text-lg font-bold text-slate-800 tabular-nums">{format(new Date(data.timestamp), 'HH:mm:ss')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Small Metrics (CPU/RAM/Disk/Swap) */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-4">
          <BentoMetric title="CPU Usage" value={formatPercent(data.server.cpuUsage)} icon={Cpu} color="text-blue-600" bg="bg-blue-50" />
          <BentoMetric title="RAM Usage" value={formatPercent(data.server.ramUsage)} icon={MemoryStick} color="text-violet-600" bg="bg-violet-50" />
          <BentoMetric title="Swap Usage" value={data.server.swapTotalGb === 0 ? 'No Swap' : formatPercent(data.server.swapUsagePercent)} icon={Database} color="text-amber-600" bg="bg-amber-50" />
          <BentoMetric title="Disk Root" value={formatPercent(data.server.diskUsage)} icon={HardDrive} color="text-cyan-600" bg="bg-cyan-50" />
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Network & IO Traffic */}
        <div className="panel-surface rounded-3xl p-6 lg:col-span-1 animate-slide-up delay-150">
          <h3 className="font-bold text-slate-900 mb-5 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" /> Throughput
          </h3>
          <div className="space-y-5">
            <TrafficRow label="Network In (RX)" value={formatMBps(data.server.netRxBytesPerSec)} type="in" />
            <TrafficRow label="Network Out (TX)" value={formatMBps(data.server.netTxBytesPerSec)} type="out" />
            <div className="w-full h-px bg-slate-100" />
            <TrafficRow label="Disk Read" value={formatMBps(data.server.diskReadBytesPerSec)} type="in" />
            <TrafficRow label="Disk Write" value={formatMBps(data.server.diskWriteBytesPerSec)} type="out" />
          </div>
        </div>

        {/* Readiness Checklist */}
        <div className="panel-surface rounded-3xl p-6 lg:col-span-2 animate-slide-up delay-300">
          <h3 className="font-bold text-slate-900 mb-5 flex items-center justify-between">
            <span>Monitoring Readiness</span>
            <a href="/panduan" className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-3 py-1.5 rounded-full">
              Baca Panduan →
            </a>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(readiness?.categories || []).map((cat) => (
              <div key={cat.key} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100/60 hover:bg-white hover:border-blue-100 hover:shadow-sm transition-all">
                <span className="font-medium text-sm text-slate-700">{cat.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 bg-white px-2 py-1 rounded-md shadow-sm border border-slate-100">
                    {cat.requiredReady} / {cat.requiredTotal}
                  </span>
                  {cat.status === 'ready' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : cat.status === 'partial' ? (
                    <Clock className="h-5 w-5 text-amber-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Down Targets */}
      {downTargets.length > 0 && (
        <div className="panel-surface rounded-2xl p-6 border-red-100 animate-slide-up delay-500">
          <h3 className="font-bold text-red-700 mb-4 flex items-center gap-2">
            <XCircle className="h-5 w-5" /> Unreachable Targets
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {downTargets.map((t) => (
              <div key={`${t.job}-${t.instance}`} className="bg-red-50 text-red-800 px-4 py-3 rounded-xl border border-red-100/50 flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wider text-red-500">{t.job}</span>
                <span className="font-mono text-sm mt-1">{t.instance}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

/* Sub-components for Bento Grid */
function BentoMetric({ title, value, icon: Icon, color, bg }: { title: string; value: string; icon: React.ElementType; color: string; bg: string }) {
  return (
    <div className="panel-surface rounded-3xl p-5 flex flex-col justify-between group">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", bg, color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4">
        <p className="text-2xl font-black text-slate-800 tracking-tight">{value}</p>
        <p className="text-xs font-semibold text-slate-500 mt-1">{title}</p>
      </div>
    </div>
  );
}

function TrafficRow({ label, value, type }: { label: string; value: string; type: 'in' | 'out' }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex items-center justify-center h-8 w-8 rounded-full bg-slate-50 border border-slate-100",
          type === 'in' ? "text-emerald-500" : "text-violet-500"
        )}>
          {type === 'in' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          )}
        </div>
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
      <span className="text-sm font-bold font-mono text-slate-800">{value}</span>
    </div>
  );
}
