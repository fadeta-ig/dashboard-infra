'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatCard } from '@/components/dashboard/stat-card';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import { Cpu, HardDrive, MemoryStick, Activity, Network, Target } from 'lucide-react';
import { format } from 'date-fns';

export default function SummaryDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/metrics/summary');
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
    const interval = setInterval(fetchData, 15000); // 15 seconds polling
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded-md"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl border border-border"></div>
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
        <StatCard 
          title="CPU Usage" 
          value={`${data.server.cpuUsage.toFixed(1)}%`} 
          icon={Cpu} 
          status={data.server.cpuUsage > 85 ? 'critical' : data.server.cpuUsage > 70 ? 'warning' : 'healthy'}
        />
        <StatCard 
          title="RAM Usage" 
          value={`${data.server.ramUsage.toFixed(1)}%`} 
          description={`${data.server.ramAvailableGb.toFixed(2)} GB Available`}
          icon={MemoryStick} 
          status={data.server.ramUsage > 85 ? 'critical' : data.server.ramUsage > 75 ? 'warning' : 'healthy'}
        />
        <StatCard 
          title="Disk Root Usage" 
          value={`${data.server.diskUsage.toFixed(1)}%`} 
          icon={HardDrive} 
          status={data.server.diskUsage > 90 ? 'critical' : data.server.diskUsage > 80 ? 'warning' : 'healthy'}
        />
        <StatCard 
          title="Load Average (1m)" 
          value={data.server.load1.toFixed(2)} 
          icon={Activity} 
          status={data.server.load1 > 4 ? 'critical' : data.server.load1 > 2 ? 'warning' : 'healthy'}
        />
        <StatCard 
          title="Internet Status" 
          value={data.network.internetStatus === 'healthy' ? 'Online' : data.network.internetStatus === 'degraded' ? 'Degraded' : 'Offline'} 
          icon={Network} 
          status={data.network.internetStatus}
        />
        <StatCard 
          title="Active Targets" 
          value={`${data.targets.filter((t: any) => t.up).length} / ${data.targets.length}`} 
          icon={Target} 
          status={data.targets.some((t: any) => !t.up) ? 'critical' : 'healthy'}
        />
      </div>
      
      {/* High-level table for targets that are down */}
      {data.targets.some((t: any) => !t.up) && (
        <div className="mt-8 rounded-xl border border-destructive/50 overflow-hidden">
          <div className="bg-destructive/10 px-4 py-3 border-b border-destructive/50">
            <h3 className="font-semibold text-destructive">Critical: Unreachable Targets</h3>
          </div>
          <div className="divide-y divide-border bg-card">
            {data.targets.filter((t: any) => !t.up).map((t: any, idx: number) => (
              <div key={idx} className="flex justify-between px-4 py-3 text-sm">
                <span className="font-mono">{t.job} ({t.instance})</span>
                <StatusIndicator status="critical" text="DOWN" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
