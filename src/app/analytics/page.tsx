'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Gauge, ShieldCheck, Thermometer } from 'lucide-react';
import { format } from 'date-fns';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getErrorMessage } from '@/lib/metrics';

interface HealthScoreRecord {
  id: number;
  scoreDate: string;
  domainKey: string;
  score: number;
  status: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface CapacityDailyRecord {
  id: number;
  snapshotDate: string;
  metricKey: string;
  avgValue: number | null;
  peakValue: number | null;
  p95Value: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface AnalyticsResponse {
  ok: boolean;
  storageEnabled: boolean;
  message?: string;
  healthScores: HealthScoreRecord[];
  capacityDaily: CapacityDailyRecord[];
}

const CAPACITY_METRICS = [
  { key: 'server_cpu_percent', title: 'CPU Daily Trend', unit: '%' },
  { key: 'server_ram_percent', title: 'RAM Daily Trend', unit: '%' },
  { key: 'server_disk_root_percent', title: 'Disk Root Daily Trend', unit: '%' },
  { key: 'server_temperature_celsius', title: 'Temperature Daily Trend', unit: '°C' },
] as const;

export default function AnalyticsPage() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (rangeDays: number) => {
    try {
      const response = await fetch(`/api/ops/analytics/overview?days=${rangeDays}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch analytics overview');
      const json = (await response.json()) as AnalyticsResponse;
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void fetchData(days), 0);
    return () => window.clearTimeout(initial);
  }, [fetchData, days]);

  const latestHealthByDomain = useMemo(() => {
    const map = new Map<string, HealthScoreRecord>();
    for (const item of data?.healthScores || []) {
      const existing = map.get(item.domainKey);
      if (!existing || item.scoreDate > existing.scoreDate) {
        map.set(item.domainKey, item);
      }
    }
    return Array.from(map.values()).sort((left, right) => right.score - left.score);
  }, [data?.healthScores]);

  const capacityByMetric = useMemo(() => {
    const rows = data?.capacityDaily || [];
    return Object.fromEntries(
      CAPACITY_METRICS.map((metric) => [
        metric.key,
        rows
          .filter((row) => row.metricKey === metric.key)
          .map((row) => ({
            date: row.snapshotDate,
            avgValue: row.avgValue,
            peakValue: row.peakValue,
            p95Value: row.p95Value,
          }))
          .sort((left, right) => left.date.localeCompare(right.date)),
      ]),
    ) as Record<string, Array<{ date: string; avgValue: number | null; peakValue: number | null; p95Value: number | null }>>;
  }, [data?.capacityDaily]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-[420px] animate-pulse rounded-lg border border-border bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-destructive">
          <AlertTriangle className="h-5 w-5" /> Analytics Error
        </h2>
        <p className="mt-2 text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in animate-slide-up space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Health Score & Capacity</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Ringkasan kesehatan domain monitoring dan tren kapasitas harian, termasuk suhu server.
          </p>
        </div>
        <div className="flex gap-2 rounded-md border border-border bg-card p-1">
          {[7, 14, 30].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setLoading(true);
                setDays(option);
              }}
              className={`rounded-sm px-3 py-1 text-sm font-medium transition-colors ${
                days === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {option}d
            </button>
          ))}
        </div>
      </div>

      {!data?.storageEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {data?.message || 'Storage analytics belum aktif.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {latestHealthByDomain.map((item) => (
          <div key={item.domainKey} className="panel-surface rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{item.domainKey}</p>
            <p className={`mt-2 text-2xl font-semibold ${item.status === 'critical' ? 'text-red-600' : item.status === 'warning' ? 'text-amber-600' : 'text-emerald-600'}`}>
              {item.score.toFixed(1)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{item.status}</p>
          </div>
        ))}
      </div>

      <section className="panel-surface overflow-hidden rounded-lg">
        <div className="border-b border-border bg-white/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-slate-500" />
            <div>
              <h2 className="font-semibold">Latest Health Scores</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Skor di-update oleh collector dan disimpan per hari.</p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-4 font-medium">Domain</th>
                <th className="px-5 py-4 font-medium">Score</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {latestHealthByDomain.map((item) => (
                <tr key={item.domainKey} className="transition-colors hover:bg-muted/40">
                  <td className="px-5 py-4 font-medium capitalize">{item.domainKey}</td>
                  <td className="px-5 py-4">{item.score.toFixed(2)}</td>
                  <td className="px-5 py-4 uppercase">{item.status}</td>
                  <td className="px-5 py-4 font-mono text-xs">{format(new Date(item.scoreDate), 'dd MMM yyyy')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {CAPACITY_METRICS.map((metric) => (
          <section key={metric.key} className="panel-surface rounded-lg p-5">
            <div className="mb-4 flex items-center gap-3">
              {metric.key === 'server_temperature_celsius' ? (
                <Thermometer className="h-4 w-4 text-red-500" />
              ) : metric.key === 'server_cpu_percent' ? (
                <Activity className="h-4 w-4 text-emerald-500" />
              ) : (
                <Gauge className="h-4 w-4 text-slate-500" />
              )}
              <div>
                <h2 className="font-semibold text-slate-900">{metric.title}</h2>
                <p className="text-xs text-muted-foreground">Average, P95, dan peak per hari.</p>
              </div>
            </div>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={capacityByMetric[metric.key] || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => format(new Date(value), 'dd/MM')}
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    labelFormatter={(value: unknown) => format(new Date(String(value)), 'dd MMM yyyy')}
                    formatter={(value: unknown, name: unknown) => {
                      if (typeof value !== 'number') return ['N/A', String(name)];
                      return [`${value.toFixed(2)} ${metric.unit}`, String(name)];
                    }}
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Line type="monotone" dataKey="avgValue" stroke="#10b981" strokeWidth={2} dot={false} connectNulls name="Average" />
                  <Line type="monotone" dataKey="p95Value" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls name="P95" />
                  <Line type="monotone" dataKey="peakValue" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls name="Peak" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
