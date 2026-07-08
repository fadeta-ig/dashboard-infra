'use client';

import { useCallback, useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import { Activity, Cpu, Database, HardDrive, MemoryStick } from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import type { ServerMetrics, ServerRangePoint } from '@/lib/types';
import { getErrorMessage } from '@/lib/metrics';

type ServerCurrentResponse = ServerMetrics & { timestamp: string };
type ServerRangeResponse = { range: string; points: ServerRangePoint[] };

function formatPercent(value: number | null) {
  return value === null ? 'Unknown' : `${value.toFixed(1)}%`;
}

function formatNumber(value: number | null, digits = 2) {
  return value === null ? 'Unknown' : value.toFixed(digits);
}

function metricStatus(value: number | null, warning: number, critical: number): 'healthy' | 'warning' | 'critical' | 'unknown' {
  if (value === null) return 'unknown';
  if (value > critical) return 'critical';
  if (value >= warning) return 'warning';
  return 'healthy';
}

export default function ServerPage() {
  const [current, setCurrent] = useState<ServerCurrentResponse | null>(null);
  const [points, setPoints] = useState<ServerRangePoint[]>([]);
  const [range, setRange] = useState('1h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrent = useCallback(async () => {
    const response = await fetch('/api/metrics/server', { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch current server metrics');
    return (await response.json()) as ServerCurrentResponse;
  }, []);

  const fetchRange = useCallback(async () => {
    const response = await fetch(`/api/metrics/server/range?range=${range}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch server range metrics');
    return (await response.json()) as ServerRangeResponse;
  }, [range]);

  const refresh = useCallback(async () => {
    try {
      const [currentMetrics, rangeMetrics] = await Promise.all([fetchCurrent(), fetchRange()]);
      setCurrent(currentMetrics);
      setPoints(rangeMetrics.points);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [fetchCurrent, fetchRange]);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);
    const interval = window.setInterval(() => {
      void refresh();
    }, 30000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const formatXAxis = (tickItem: number) => format(new Date(tickItem), 'HH:mm');

  const formatTooltip = (value: unknown, name: unknown): [string, string] => {
    if (typeof value !== 'number') return [String(value ?? 'Unknown'), String(name ?? '')];
    if (name === 'cpu' || name === 'ram') return [`${value.toFixed(2)}%`, String(name).toUpperCase()];
    return [value.toFixed(2), 'Load'];
  };

  return (
    <div className="space-y-6 animate-fade-in animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Server Ubuntu</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">CPU, RAM, disk, and load average for server-wig</p>
        </div>
        <div className="flex gap-2 bg-card p-1 rounded-md border border-border">
          {['1h', '6h', '24h'].map((item) => (
            <button
              key={item}
              onClick={() => setRange(item)}
              className={`px-3 py-1 text-sm font-medium rounded-sm transition-colors ${
                range === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <h2 className="text-lg font-bold text-destructive flex items-center gap-2">
            <Activity className="h-5 w-5" /> Connection Error
          </h2>
          <p className="text-muted-foreground mt-2">{error}</p>
          <button onClick={() => void refresh()} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90">
            Retry Connection
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-28 bg-muted animate-pulse rounded-lg border border-border" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-[320px] bg-muted animate-pulse rounded-lg border border-border" />
            <div className="h-[320px] bg-muted animate-pulse rounded-lg border border-border" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <StatCard title="CPU Usage" value={formatPercent(current?.cpuUsage ?? null)} icon={Cpu} status={metricStatus(current?.cpuUsage ?? null, 70, 85)} />
            <StatCard title="RAM Usage" value={formatPercent(current?.ramUsage ?? null)} icon={MemoryStick} status={metricStatus(current?.ramUsage ?? null, 75, 85)} />
            <StatCard title="RAM Available" value={`${formatNumber(current?.ramAvailableGb ?? null)} GB`} icon={Database} status={current?.ramAvailableGb === null ? 'unknown' : 'healthy'} />
            <StatCard title="Disk Root Usage" value={formatPercent(current?.diskUsage ?? null)} icon={HardDrive} status={metricStatus(current?.diskUsage ?? null, 80, 90)} />
            <StatCard title="Load Average" value={formatNumber(current?.load1 ?? null)} icon={Activity} status={metricStatus(current?.load1 ?? null, 2, 4)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="panel-surface rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">CPU & RAM Usage (%)</h2>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="timestamp" tickFormatter={formatXAxis} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip labelFormatter={(label) => format(new Date(Number(label)), 'MMM dd, HH:mm')} formatter={formatTooltip} contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="cpu" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls />
                    <Line type="monotone" dataKey="ram" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel-surface rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Load Average (1m)</h2>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="timestamp" tickFormatter={formatXAxis} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip labelFormatter={(label) => format(new Date(Number(label)), 'MMM dd, HH:mm')} formatter={formatTooltip} contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="load" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.18} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}


