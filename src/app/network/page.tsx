'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { Activity, Camera, Fingerprint, Globe, Phone, RouterIcon, Search, Server, type LucideIcon } from 'lucide-react';
import { format } from 'date-fns';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import { PaginationControls } from '@/components/dashboard/pagination-controls';
import type { NetworkMetrics, NetworkRangePoint, NetworkTarget } from '@/lib/types';
import { getErrorMessage } from '@/lib/metrics';
import { paginateItems } from '@/lib/pagination';
import { useStoredPageSize } from '@/lib/use-stored-page-size';
import { cn } from '@/lib/utils';

type NetworkRangeResponse = { range: string; points: NetworkRangePoint[] };

const CHART_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', 
  '#14b8a6', '#f97316', '#6366f1', '#eab308', '#06b6d4',
  '#ef4444', '#84cc16', '#a855f7', '#f43f5e', '#0ea5e9'
];

function categoryIcon(category?: string): LucideIcon {
  if (category === 'cctv') return Camera;
  if (category === 'fingerprint') return Fingerprint;
  if (category === 'voice') return Phone;
  if (category === 'internet') return Globe;
  return Server;
}

function categoryLabel(category?: string) {
  const labels: Record<string, string> = {
    cctv: 'CCTV',
    fingerprint: 'Fingerprint',
    voice: 'Voice',
    internet: 'Internet',
    network: 'Network',
  };
  return category ? labels[category] || category : 'Network';
}

function latencyText(target: NetworkTarget) {
  return target.latencyMs === null ? 'Unknown' : `${target.latencyMs.toFixed(1)} ms`;
}

function TargetCard({ title, target, icon: Icon }: { title: string; target: NetworkTarget; icon: LucideIcon }) {
  return (
    <div className="panel-surface rounded p-5 flex flex-col items-center text-center">
      <div className="p-2.5 bg-slate-50 border border-slate-100 rounded mb-4">
        <Icon className="h-5 w-5 text-slate-700" />
      </div>
      <h2 className="font-semibold text-sm text-slate-900">{title}</h2>
      <p className="text-xs font-mono text-slate-500 mt-1 mb-4">{target.target}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
        <div className="flex flex-col items-center p-2.5 bg-slate-50 border border-slate-100 rounded">
          <span className="text-[10px] text-slate-500 mb-1 font-semibold uppercase tracking-wider">Status</span>
          <StatusIndicator status={target.up === null ? 'unknown' : target.up ? 'healthy' : 'critical'} text={target.up === null ? 'Unknown' : target.up ? 'UP' : 'DOWN'} />
        </div>
        <div className="flex flex-col items-center p-2.5 bg-slate-50 border border-slate-100 rounded">
          <span className="text-[10px] text-slate-500 mb-1 font-semibold uppercase tracking-wider">Latency</span>
          <span className="font-mono text-sm font-semibold text-slate-800">{target.latencyMs === null ? 'Unknown' : `${target.latencyMs.toFixed(1)} ms`}</span>
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
  const [hiddenTargets, setHiddenTargets] = useState<Set<string>>(new Set());
  const [targetSearch, setTargetSearch] = useState('');
  const [targetPage, setTargetPage] = useState(1);
  const [targetPageSize, setTargetPageSize] = useStoredPageSize('network-targets');

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
    const initial = window.setTimeout(() => void fetchData(), 0);
    const interval = window.setInterval(() => void fetchData(), 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [fetchData]);

  // Extract all available targets for the chart
  const chartTargets = useMemo(() => {
    if (!data) return [];
    const all = [
      { id: data.gateway.target, name: 'Gateway', color: CHART_COLORS[0] },
      { id: data.googleDns.target, name: 'Google DNS', color: CHART_COLORS[1] },
      { id: data.cloudflareDns.target, name: 'Cloudflare DNS', color: CHART_COLORS[2] },
    ];
    
    data.additionalTargets.forEach((t, i) => {
      all.push({
        id: t.target,
        name: t.label || t.target,
        color: CHART_COLORS[(i + 3) % CHART_COLORS.length]
      });
    });
    
    return all;
  }, [data]);

  const filteredAdditionalTargets = useMemo(() => {
    const query = targetSearch.trim().toLowerCase();
    const targets = data?.additionalTargets || [];
    if (!query) return targets;
    return targets.filter((target) => (
      (target.label || '').toLowerCase().includes(query) ||
      target.target.toLowerCase().includes(query) ||
      (target.category || '').toLowerCase().includes(query) ||
      (target.purpose || '').toLowerCase().includes(query) ||
      (target.up === null ? 'unknown' : target.up ? 'up' : 'down').includes(query)
    ));
  }, [data?.additionalTargets, targetSearch]);

  const pagedAdditionalTargets = useMemo(
    () => paginateItems(filteredAdditionalTargets, targetPage, targetPageSize),
    [filteredAdditionalTargets, targetPage, targetPageSize],
  );

  const toggleTarget = (id: string) => {
    setHiddenTargets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (show: boolean) => {
    if (show) setHiddenTargets(new Set());
    else setHiddenTargets(new Set(chartTargets.map(t => t.id)));
  };

  const formatXAxis = (tickItem: number) => format(new Date(tickItem), 'HH:mm');
  
  const formatTooltip = (value: unknown, name: unknown): [string, string] => {
    if (typeof value !== 'number') return [String(value ?? 'Unknown'), String(name ?? '')];
    const targetInfo = chartTargets.find(t => t.id === name);
    return [`${value.toFixed(2)} ms`, targetInfo?.name || String(name)];
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-200 animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((item) => <div key={item} className="h-40 bg-slate-200 animate-pulse rounded border border-slate-200" />)}
        </div>
        <div className="h-[400px] bg-slate-200 animate-pulse rounded border border-slate-200" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2">
          <Activity className="h-5 w-5" /> Connection Error
        </h2>
        <p className="text-sm text-red-600 mt-2">{error || 'Network data is unavailable.'}</p>
        <button onClick={() => void fetchData()} className="mt-4 px-4 py-2 bg-red-700 text-white rounded text-sm font-medium hover:bg-red-800 transition-colors">
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Network Monitoring</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2 font-medium">
            Overall Status: <StatusIndicator status={data.internetStatus} text={data.internetStatus} />
          </p>
        </div>
        <div className="flex gap-1.5 p-1 bg-slate-100 rounded border border-slate-200">
          {['1h', '6h', '24h'].map((item) => (
            <button
              key={item}
              onClick={() => setRange(item)}
              className={cn(
                "px-3 py-1 text-xs font-semibold rounded transition-colors uppercase tracking-wider",
                range === item ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TargetCard title="MikroTik Gateway" target={data.gateway} icon={RouterIcon} />
        <TargetCard title="Google DNS" target={data.googleDns} icon={Globe} />
        <TargetCard title="Cloudflare DNS" target={data.cloudflareDns} icon={Globe} />
      </div>

      <section className="panel-surface rounded p-5">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between mb-6 gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900">Latency History</h2>
            <p className="text-xs text-slate-500 mt-1">Select targets to show or hide their latency trends.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={() => toggleAll(true)}
              className="text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:text-slate-900 px-2 py-1 bg-slate-100 rounded border border-slate-200 transition-colors"
            >
              All
            </button>
            <button 
              onClick={() => toggleAll(false)}
              className="text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:text-slate-900 px-2 py-1 bg-slate-100 rounded border border-slate-200 transition-colors mr-2"
            >
              None
            </button>
            {chartTargets.map(t => {
              const isHidden = hiddenTargets.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTarget(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-all duration-200",
                    isHidden ? "bg-transparent text-slate-400 border-slate-200 hover:border-slate-300" : "bg-slate-50 border-slate-200 text-slate-800 shadow-sm"
                  )}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isHidden ? '#cbd5e1' : t.color }} />
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-[280px] sm:h-[340px] lg:h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={formatXAxis} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                labelFormatter={(label) => format(new Date(Number(label)), 'MMM dd, HH:mm')} 
                formatter={formatTooltip} 
                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '4px', fontSize: '12px' }} 
              />
              
              {chartTargets.map(t => {
                if (hiddenTargets.has(t.id)) return null;
                const safeKey = t.id.replace(/\./g, '_');
                return (
                  <Line 
                    key={t.id}
                    type="monotone" 
                    dataKey={safeKey} 
                    name={t.id}
                    stroke={t.color} 
                    strokeWidth={2} 
                    dot={false} 
                    activeDot={{ r: 4 }} 
                    connectNulls 
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel-surface rounded overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900">Additional Ping Targets</h2>
            <label className="relative block lg:w-96">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={targetSearch}
                onChange={(event) => {
                  setTargetSearch(event.target.value);
                  setTargetPage(1);
                }}
                placeholder="Cari IP, label, kategori, UP/DOWN..."
                className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:bg-muted/40 focus:border-slate-400"
              />
            </label>
          </div>
        </div>
        <div className="grid gap-3 p-4 md:hidden">
          {pagedAdditionalTargets.items.map((target) => {
            const Icon = categoryIcon(target.category);
            return (
              <article key={target.target} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded bg-slate-100 p-2 text-slate-700"><Icon className="h-4 w-4" /></div>
                    <div>
                      <p className="font-semibold text-slate-900">{target.label || target.target}</p>
                      <p className="font-mono text-xs text-slate-500 break-all">{target.target}</p>
                    </div>
                  </div>
                  <StatusIndicator status={target.up === null ? 'unknown' : target.up ? 'healthy' : 'critical'} text={target.up === null ? 'Unknown' : target.up ? 'UP' : 'DOWN'} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs uppercase text-slate-500">Category</p>
                    <p className="text-slate-600">{categoryLabel(target.category)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Latency</p>
                    <p className="font-mono font-medium text-slate-900">{latencyText(target)}</p>
                  </div>
                </div>
              </article>
            );
          })}
          {pagedAdditionalTargets.items.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground">Belum ada additional target.</div>
          )}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 font-semibold">Target</th>
                <th className="px-5 py-3 font-semibold">Category</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedAdditionalTargets.items.map((target) => {
                const Icon = categoryIcon(target.category);
                return (
                  <tr key={target.target} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded bg-slate-100 p-2 text-slate-700"><Icon className="h-4 w-4" /></div>
                        <div>
                          <p className="font-semibold text-slate-900">{target.label || target.target}</p>
                          <p className="font-mono text-xs text-slate-500">{target.target}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{categoryLabel(target.category)}</td>
                    <td className="px-5 py-4"><StatusIndicator status={target.up === null ? 'unknown' : target.up ? 'healthy' : 'critical'} text={target.up === null ? 'Unknown' : target.up ? 'UP' : 'DOWN'} /></td>
                    <td className="px-5 py-4 text-right font-mono font-medium text-slate-900">{latencyText(target)}</td>
                  </tr>
                );
              })}
              {pagedAdditionalTargets.items.length === 0 && (
                <tr>
                  <td className="px-5 py-8 text-center text-muted-foreground" colSpan={4}>
                    Belum ada additional target.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          pagination={pagedAdditionalTargets.meta}
          itemLabel="target"
          onPageChange={setTargetPage}
          onPageSizeChange={(nextPageSize) => {
            setTargetPageSize(nextPageSize);
            setTargetPage(1);
          }}
        />
      </section>
    </div>
  );
}
