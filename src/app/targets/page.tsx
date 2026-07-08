'use client';

import { useEffect, useState, useCallback } from 'react';
import { Activity, RefreshCcw } from 'lucide-react';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import { format } from 'date-fns';

export default function TargetsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/metrics/targets');
      if (!res.ok) throw new Error('Failed to fetch data');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error connecting to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded-md"></div>
        <div className="h-[400px] bg-muted animate-pulse rounded-xl border border-border"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6">
        <h2 className="text-lg font-bold text-destructive flex items-center gap-2">
          <Activity className="h-5 w-5" /> Connection Error
        </h2>
        <p className="text-muted-foreground mt-2">{error}</p>
        <button onClick={fetchData} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90">
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Prometheus Targets</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">Status of all monitored endpoints</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground font-medium">
            Last updated: {format(new Date(data.timestamp), 'HH:mm:ss')}
          </span>
          <button 
            onClick={() => { setLoading(true); fetchData(); }}
            className="p-2 bg-card border border-border rounded-md hover:bg-muted transition-all duration-300 hover:shadow-sm"
          >
            <RefreshCcw className="h-4 w-4 text-primary" />
          </button>
        </div>
      </div>

      <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Job Name</th>
                <th className="px-6 py-4 font-medium">Instance</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.targets.map((t: any, idx: number) => (
                <tr key={idx} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 font-medium">{t.job}</td>
                  <td className="px-6 py-4 font-mono text-muted-foreground">{t.instance}</td>
                  <td className="px-6 py-4">
                    <StatusIndicator status={t.up ? 'healthy' : 'critical'} text={t.up ? 'UP' : 'DOWN'} />
                  </td>
                  <td className="px-6 py-4 font-mono text-right">{t.value}</td>
                </tr>
              ))}
              {data.targets.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                    No targets found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
