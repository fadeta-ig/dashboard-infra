'use client';

import { useEffect, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { format } from 'date-fns';
import { Activity } from 'lucide-react';

export default function ServerPage() {
  const [data, setData] = useState<any[]>([]);
  const [range, setRange] = useState('1h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRangeData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/metrics/server/range?range=${range}`);
      if (!res.ok) throw new Error('Failed to fetch range data');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error connecting to server');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchRangeData();
  }, [fetchRangeData]);

  const formatXAxis = (tickItem: number) => {
    return format(new Date(tickItem), 'HH:mm');
  };

  const formatTooltip = (value: string | number | readonly (string | number)[] | undefined, name: string | number | undefined) => {
    if (typeof value !== 'number') return [String(value), String(name)];
    if (name === 'cpu' || name === 'ram') return [`${value.toFixed(2)}%`, name.toUpperCase()];
    return [value.toFixed(2), 'Load'];
  };

  return (
    <div className="space-y-6 animate-fade-in animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Server Metrics</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">Historical CPU, RAM, and Load Average</p>
        </div>
        <div className="flex gap-2 bg-card p-1 rounded-md border border-border">
          {['1h', '6h', '24h'].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-sm font-medium rounded-sm transition-colors ${
                range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6">
          <h2 className="text-lg font-bold text-destructive flex items-center gap-2">
            <Activity className="h-5 w-5" /> Connection Error
          </h2>
          <p className="text-muted-foreground mt-2">{error}</p>
        </div>
      ) : loading && data.length === 0 ? (
        <div className="space-y-6">
          <div className="h-[300px] bg-muted animate-pulse rounded-xl border border-border"></div>
          <div className="h-[300px] bg-muted animate-pulse rounded-xl border border-border"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CPU & RAM Chart */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">CPU & RAM Usage (%)</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="timestamp" tickFormatter={formatXAxis} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    labelFormatter={(label) => format(new Date(label), 'MMM dd, HH:mm')}
                    formatter={formatTooltip}
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  />
                  <Line type="monotone" dataKey="cpu" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="ram" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Load Average Chart */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Load Average (1m)</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="timestamp" tickFormatter={formatXAxis} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    labelFormatter={(label) => format(new Date(label), 'MMM dd, HH:mm')}
                    formatter={formatTooltip}
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  />
                  <Area type="monotone" dataKey="load" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
