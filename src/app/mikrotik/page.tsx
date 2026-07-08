'use client';

import { useState } from 'react';
import { AlertCircle, RouterIcon, Search } from 'lucide-react';
import type { MikrotikDiscoveryResponse } from '@/lib/types';
import { getErrorMessage } from '@/lib/metrics';

function labelPreview(labels: Record<string, string>) {
  const entries = Object.entries(labels).slice(0, 4);
  if (entries.length === 0) return '-';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

export default function MikrotikPage() {
  const [data, setData] = useState<MikrotikDiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDiscovery = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/metrics/mikrotik/discovery', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch SNMP discovery data');
      const json = (await response.json()) as MikrotikDiscoveryResponse;
      setData(json);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">MikroTik SNMP Integration</h1>
        <p className="text-sm text-muted-foreground mt-1 font-medium">Phase 1 discovery before interface traffic charts are enabled</p>
      </div>

      <section className="bg-card border border-border/60 rounded-lg p-8 shadow-sm flex flex-col items-center text-center">
        <div className="h-16 w-16 bg-muted/70 rounded-md flex items-center justify-center mb-6">
          <RouterIcon className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-medium mb-2">SNMP Metric Discovery</h2>
        <p className="text-muted-foreground max-w-xl mb-8 text-sm">
          Discovery membaca sample series dari job SNMP yang sudah ada di Prometheus. Interface traffic, port status, dan error/drop dibuat setelah metric aktual terverifikasi.
        </p>

        <button
          type="button"
          onClick={() => void handleDiscovery()}
          disabled={loading}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:opacity-90 disabled:opacity-50 transition-colors active:scale-[0.98]"
        >
          {loading ? (
            <span className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          ) : (
            <Search className="h-5 w-5" />
          )}
          Run SNMP Metric Discovery
        </button>
      </section>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 flex items-start gap-4">
          <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-destructive">Discovery Error</h2>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {data && (
        <section className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
          <div className="bg-muted px-6 py-4 border-b border-border">
            <h2 className="font-semibold">Discovery Results</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {data.message} Total series: {data.totalSeries}. Last checked: {new Date(data.timestamp).toLocaleTimeString()}.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Metric</th>
                  <th className="px-6 py-4 font-medium">Jobs</th>
                  <th className="px-6 py-4 font-medium">Instances</th>
                  <th className="px-6 py-4 font-medium">Sample Labels</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.metrics.map((metric) => (
                  <tr key={metric.name} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium">{metric.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{metric.jobs.join(', ') || '-'}</td>
                    <td className="px-6 py-4 font-mono text-muted-foreground">{metric.instances.join(', ') || '-'}</td>
                    <td className="px-6 py-4 font-mono text-muted-foreground max-w-xl truncate">{labelPreview(metric.sampleLabels)}</td>
                  </tr>
                ))}
                {data.metrics.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                      No SNMP metrics found yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
