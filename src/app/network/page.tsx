'use client';

import { useEffect, useState, useCallback } from 'react';
import { Activity, Globe, RouterIcon } from 'lucide-react';
import { StatusIndicator } from '@/components/dashboard/status-indicator';

export default function NetworkPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/metrics/network');
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-xl border border-border"></div>
          ))}
        </div>
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

  const TargetCard = ({ title, target, icon: Icon }: { title: string, target: any, icon: any }) => (
    <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col items-center text-center">
      <div className="p-3 bg-muted/70 rounded-full mb-4">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="font-medium text-lg">{title}</h3>
      <p className="text-sm font-mono text-muted-foreground mt-1 mb-4">{target.target}</p>
      
      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="flex flex-col items-center p-3 bg-muted/40 rounded-lg">
          <span className="text-xs text-muted-foreground mb-1 font-medium">Status</span>
          <StatusIndicator status={target.up ? 'healthy' : 'critical'} text={target.up ? 'UP' : 'DOWN'} />
        </div>
        <div className="flex flex-col items-center p-3 bg-muted/40 rounded-lg">
          <span className="text-xs text-muted-foreground mb-1 font-medium">Latency</span>
          <span className="font-semibold text-primary">{target.latencyMs.toFixed(1)} ms</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Network Health</h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 font-medium">
          Overall Status: <StatusIndicator status={data.internetStatus} text={data.internetStatus} />
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <TargetCard title="MikroTik Gateway" target={data.gateway} icon={RouterIcon} />
        <TargetCard title="Google DNS" target={data.googleDns} icon={Globe} />
        <TargetCard title="Cloudflare DNS" target={data.cloudflareDns} icon={Globe} />
      </div>
    </div>
  );
}
