'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Globe, RouterIcon, type LucideIcon } from 'lucide-react';
import { format } from 'date-fns';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import type { NetworkMetrics, NetworkRangePoint, NetworkTarget } from '@/lib/types';
import { getErrorMessage } from '@/lib/metrics';

type NetworkRangeResponse = { range: string; points: NetworkRangePoint[] };

function TargetCard({ title, target, icon: Icon }: { title: string; target: NetworkTarget; icon: LucideIcon }) {
  return (
    <div className="panel-surface rounded-lg p-6 flex flex-col items-center text-center">
      <div className="p-3 bg-muted/70 rounded-md mb-4">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h2 className="font-medium text-lg">{title}</h2>
      <p className="text-sm font-mono text-muted-foreground mt-1 mb-4">{target.target}</p>

      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="flex flex-col items-center p-3 bg-muted/40 rounded-md">
          <span className="text-xs text-muted-foreground mb-1 font-medium">Status</span>
          <StatusIndicator status={target.up === null ? 'unknown' : target.up ? 'healthy' : 'critical'} text={target.up === null ? 'Unknown' : target.up ? 'UP' : 'DOWN'} />
        </div>
        <div className="flex flex-col items-center p-3 bg-muted/40 rounded-md">
          <span className="text-xs text-muted-foreground mb-1 font-medium">Latency</span>
          <span className="font-semibold text-primary">{target.latencyMs === null ? 'Unknown' : `${target.latencyMs.toFixed(1)} ms`}</span>
        </div>
      </div>
    </div>
  );
}

export default function NetworkPage() {
  const [data, setData] = useState<NetworkMetrics | null>(null);
  const [points, setPoints] = useState<NetworkRangePoint[]>([]);
  const [range, setRange] = useState('1h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [currentResponse, rangeResponse] = await Promise.all([
        fetch('/api/metrics/network', { cache: 'no-store' }),
        fetch(`/api/metrics/network/range?range=${range}`, { cache: 'no-store' }),
      ]);

      if (!currentResponse.ok) throw new Error('Failed to fetch network metrics');
      if (!rangeResponse.ok) throw new Error('Failed to fetch network latency range');

      const currentJson = (await currentResponse.json()) as NetworkMetrics;
      const rangeJson = (await rangeResponse.json()) as NetworkRangeResponse;
      setData(currentJson);
      setPoints(rangeJson.points);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [range]);

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

  const formatXAxis = (tickItem: number) => format(new Date(tickItem), 'HH:mm');
  const formatTooltip = (value: unknown, name: unknown): [string, string] => {
    if (typeof value !== 'number') return [String(value ?? 'Unknown'), String(name ?? '')];
    const labels: Record<string, string> = {
      gateway: 'Gateway',
      googleDns: 'Google DNS',
      cloudflareDns: 'Cloudflare DNS',
    };
    return [`${value.toFixed(2)} ms`, labels[String(name)] || String(name)];
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((item) => <div key={item} className="h-40 bg-muted animate-pulse rounded-lg border border-border" />)}
        </div>
        <div className="h-[340px] bg-muted animate-pulse rounded-lg border border-border" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <h2 className="text-lg font-bold text-destructive flex items-center gap-2">
          <Activity className="h-5 w-5" /> Connection Error
        </h2>
        <p className="text-muted-foreground mt-2">{error || 'Network data is unavailable.'}</p>
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
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Network Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 font-medium">
            Overall Status: <StatusIndicator status={data.internetStatus} text={data.internetStatus} />
          </p>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <TargetCard title="MikroTik Gateway" target={data.gateway} icon={RouterIcon} />
        <TargetCard title="Google DNS" target={data.googleDns} icon={Globe} />
        <TargetCard title="Cloudflare DNS" target={data.cloudflareDns} icon={Globe} />
      </div>

      <section className="panel-surface rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Latency History (ms)</h2>
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={formatXAxis} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip labelFormatter={(label) => format(new Date(Number(label)), 'MMM dd, HH:mm')} formatter={formatTooltip} contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }} />
              <Line type="monotone" dataKey="gateway" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls />
              <Line type="monotone" dataKey="googleDns" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls />
              <Line type="monotone" dataKey="cloudflareDns" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}


