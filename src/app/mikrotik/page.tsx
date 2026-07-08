'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, Gauge, RadioTower, RouterIcon, Search } from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import type { MikrotikDiscoveryResponse } from '@/lib/types';
import { getErrorMessage } from '@/lib/metrics';

interface InterfaceTraffic {
  name: string;
  instance: string;
  downloadMbps: number | null;
  uploadMbps: number | null;
}

interface MikrotikOverview {
  gateway: string;
  totalDownloadMbps: number | null;
  totalUploadMbps: number | null;
  pingMs: number | null;
  jitterMs: number | null;
  packetLossPercent: number | null;
  interfaces: InterfaceTraffic[];
  timestamp: string;
}

function labelPreview(labels: Record<string, string>) {
  const entries = Object.entries(labels).slice(0, 4);
  if (entries.length === 0) return '-';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

function metricValue(value: number | null, suffix: string) {
  return value === null ? 'Not available' : `${value.toFixed(2)} ${suffix}`;
}

function latencyStatus(value: number | null, warning: number, critical: number): 'healthy' | 'warning' | 'critical' | 'unknown' {
  if (value === null) return 'unknown';
  if (value >= critical) return 'critical';
  if (value >= warning) return 'warning';
  return 'healthy';
}

export default function MikrotikPage() {
  const [overview, setOverview] = useState<MikrotikOverview | null>(null);
  const [data, setData] = useState<MikrotikDiscoveryResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingDiscovery, setLoadingDiscovery] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const response = await fetch('/api/metrics/mikrotik/overview', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch MikroTik overview');
      const json = (await response.json()) as MikrotikOverview;
      setOverview(json);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void fetchOverview();
    }, 0);
    const interval = window.setInterval(() => {
      void fetchOverview();
    }, 30000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [fetchOverview]);

  const handleDiscovery = async () => {
    setLoadingDiscovery(true);
    setError(null);

    try {
      const response = await fetch('/api/metrics/mikrotik/discovery', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch SNMP discovery data');
      const json = (await response.json()) as MikrotikDiscoveryResponse;
      setData(json);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingDiscovery(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in animate-slide-up">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">MikroTik gateway</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary">MikroTik Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">Upload, download, ping, jitter, packet loss, dan discovery metric SNMP.</p>
        </div>
        <button
          type="button"
          onClick={() => void handleDiscovery()}
          disabled={loadingDiscovery}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {loadingDiscovery ? <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Search className="h-4 w-4" />}
          Discovery
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-5 flex items-start gap-4">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-destructive">MikroTik Data Warning</h2>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {loadingOverview ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-32 bg-muted animate-pulse rounded-lg border border-border" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <StatCard title="Download" value={metricValue(overview?.totalDownloadMbps ?? null, 'Mbps')} icon={ArrowDownToLine} status={overview?.totalDownloadMbps === null ? 'unknown' : 'healthy'} />
          <StatCard title="Upload" value={metricValue(overview?.totalUploadMbps ?? null, 'Mbps')} icon={ArrowUpFromLine} status={overview?.totalUploadMbps === null ? 'unknown' : 'healthy'} />
          <StatCard title="Ping Gateway" value={metricValue(overview?.pingMs ?? null, 'ms')} icon={RouterIcon} status={latencyStatus(overview?.pingMs ?? null, 20, 80)} />
          <StatCard title="Jitter 5m" value={metricValue(overview?.jitterMs ?? null, 'ms')} icon={Gauge} status={latencyStatus(overview?.jitterMs ?? null, 5, 20)} />
          <StatCard title="Packet Loss 5m" value={metricValue(overview?.packetLossPercent ?? null, '%')} icon={RadioTower} status={latencyStatus(overview?.packetLossPercent ?? null, 1, 5)} />
        </div>
      )}

      <section className="panel-surface rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-white/60">
          <h2 className="font-semibold">Interface Traffic</h2>
          <p className="text-xs text-muted-foreground mt-1">Membaca IF-MIB `ifHCInOctets` dan `ifHCOutOctets` dari SNMP Exporter jika sudah tersedia.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Interface</th>
                <th className="px-6 py-4 font-medium">Instance</th>
                <th className="px-6 py-4 font-medium text-right">Download</th>
                <th className="px-6 py-4 font-medium text-right">Upload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(overview?.interfaces || []).map((item) => (
                <tr key={`${item.instance}-${item.name}`} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 font-mono font-medium">{item.name}</td>
                  <td className="px-6 py-4 font-mono text-muted-foreground">{item.instance}</td>
                  <td className="px-6 py-4 text-right font-mono">{metricValue(item.downloadMbps, 'Mbps')}</td>
                  <td className="px-6 py-4 text-right font-mono">{metricValue(item.uploadMbps, 'Mbps')}</td>
                </tr>
              ))}
              {(overview?.interfaces || []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                    Metric interface belum tersedia. Jalankan discovery dan pastikan IF-MIB expose ifHCInOctets/ifHCOutOctets.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data && (
        <section className="panel-surface rounded-lg overflow-hidden">
          <div className="bg-white/60 px-6 py-4 border-b border-border">
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

      <section className="panel-surface rounded-lg p-6">
        <h2 className="font-semibold">Pengembangan Berikutnya</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div className="rounded-md bg-muted/50 p-4">
            <p className="font-semibold text-slate-800">Capacity</p>
            <p className="mt-2">Bandwidth peak, top interface, trend 24h, dan alert threshold.</p>
          </div>
          <div className="rounded-md bg-muted/50 p-4">
            <p className="font-semibold text-slate-800">Quality</p>
            <p className="mt-2">Jitter, packet loss, DNS/HTTP probe, dan availability SLA.</p>
          </div>
          <div className="rounded-md bg-muted/50 p-4">
            <p className="font-semibold text-slate-800">Operations</p>
            <p className="mt-2">Port status, error/drop, uptime, config backup status, dan alert delivery.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

