'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, Gauge, RadioTower, RouterIcon, Search, Timer, TriangleAlert } from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import type { MikrotikDiscoveryResponse } from '@/lib/types';
import { getErrorMessage } from '@/lib/metrics';

interface InterfaceTraffic {
  name: string;
  displayName: string;
  role: string;
  comment?: string;
  isp?: 'ISP 1' | 'ISP 2';
  instance: string;
  expectedUp: boolean;
  operationalStatus: 'up' | 'down' | 'unknown';
  downloadMbps: number | null;
  uploadMbps: number | null;
  downloadCapacityMbps: number | null;
  uploadCapacityMbps: number | null;
  downloadUtilizationPercent: number | null;
  uploadUtilizationPercent: number | null;
  errors5m: number | null;
  discards5m: number | null;
  metricAvailable: boolean;
  includeInWanTotal: boolean;
}

interface MikrotikOverview {
  gateway: string;
  routerUptimeSeconds: number | null;
  totalDownloadMbps: number | null;
  totalUploadMbps: number | null;
  totalDownloadCapacityMbps: number;
  totalUploadCapacityMbps: number;
  totalDownloadUtilizationPercent: number | null;
  totalUploadUtilizationPercent: number | null;
  totalErrors5m: number | null;
  totalDiscards5m: number | null;
  pingMs: number | null;
  jitterMs: number | null;
  packetLossPercent: number | null;
  interfaces: InterfaceTraffic[];
  configuredInterfaceCount: number;
  liveInterfaceMetricCount: number;
  missingRequiredMetrics: string[];
  timestamp: string;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return 'Not available';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function countValue(value: number | null) {
  return value === null ? 'Not available' : value.toFixed(0);
}
function labelPreview(labels: Record<string, string>) {
  const entries = Object.entries(labels).slice(0, 4);
  if (entries.length === 0) return '-';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

function metricValue(value: number | null, suffix: string) {
  return value === null ? 'Not available' : `${value.toFixed(2)} ${suffix}`;
}

function utilizationText(value: number | null) {
  return value === null ? 'Not available' : `${value.toFixed(1)}%`;
}

function roleBadge(role: string) {
  const labels: Record<string, string> = {
    wan: 'WAN',
    lan: 'LAN',
    trunk: 'TRUNK',
    vlan: 'VLAN',
    vpn: 'VPN',
    loopback: 'LOOPBACK',
    unused: 'UNUSED',
  };
  return labels[role] || role.toUpperCase();
}

function latencyStatus(value: number | null, warning: number, critical: number): 'healthy' | 'warning' | 'critical' | 'unknown' {
  if (value === null) return 'unknown';
  if (value >= critical) return 'critical';
  if (value >= warning) return 'warning';
  return 'healthy';
}

function portStatus(item: InterfaceTraffic): 'healthy' | 'warning' | 'critical' | 'unknown' {
  if (!item.metricAvailable || item.operationalStatus === 'unknown') return 'unknown';
  if (item.expectedUp && item.operationalStatus !== 'up') return 'critical';
  if (!item.expectedUp && item.operationalStatus === 'up') return 'warning';
  return 'healthy';
}

function portStatusText(item: InterfaceTraffic) {
  if (!item.metricAvailable || item.operationalStatus === 'unknown') return 'Metric missing';
  return item.operationalStatus === 'up' ? 'UP' : 'DOWN';
}

function maxUtilization(item: InterfaceTraffic) {
  const values = [item.downloadUtilizationPercent, item.uploadUtilizationPercent].filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.max(...values);
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">MikroTik gateway 192.168.20.1</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary">MikroTik Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">Interface mapping, ISP capacity, upload/download, ping, jitter, packet loss, dan discovery metric SNMP.</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((item) => <div key={item} className="h-32 bg-muted animate-pulse rounded-lg border border-border" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4">
          <StatCard title="WAN Download" value={metricValue(overview?.totalDownloadMbps ?? null, 'Mbps')} description={overview ? `Capacity ${overview.totalDownloadCapacityMbps} Mbps / ${utilizationText(overview.totalDownloadUtilizationPercent)}` : undefined} icon={ArrowDownToLine} status={overview?.totalDownloadMbps === null ? 'unknown' : 'healthy'} />
          <StatCard title="WAN Upload" value={metricValue(overview?.totalUploadMbps ?? null, 'Mbps')} description={overview ? `Capacity ${overview.totalUploadCapacityMbps} Mbps / ${utilizationText(overview.totalUploadUtilizationPercent)}` : undefined} icon={ArrowUpFromLine} status={overview?.totalUploadMbps === null ? 'unknown' : 'healthy'} />
          <StatCard title="Router Uptime" value={formatDuration(overview?.routerUptimeSeconds ?? null)} icon={Timer} status={overview?.routerUptimeSeconds === null ? 'unknown' : 'healthy'} />
          <StatCard title="Ping Gateway" value={metricValue(overview?.pingMs ?? null, 'ms')} icon={RouterIcon} status={latencyStatus(overview?.pingMs ?? null, 20, 80)} />
          <StatCard title="Jitter 5m" value={metricValue(overview?.jitterMs ?? null, 'ms')} icon={Gauge} status={latencyStatus(overview?.jitterMs ?? null, 5, 20)} />
          <StatCard title="Errors 5m" value={countValue(overview?.totalErrors5m ?? null)} icon={TriangleAlert} status={(overview?.totalErrors5m ?? null) === null ? 'unknown' : (overview?.totalErrors5m || 0) > 0 ? 'warning' : 'healthy'} />
          <StatCard title="Drops 5m" value={countValue(overview?.totalDiscards5m ?? null)} icon={RadioTower} status={(overview?.totalDiscards5m ?? null) === null ? 'unknown' : (overview?.totalDiscards5m || 0) > 0 ? 'warning' : 'healthy'} />
        </div>
      )}

      <section className="panel-surface rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-white/60">
          <h2 className="font-semibold">Configured MikroTik Interfaces</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Configured {overview?.configuredInterfaceCount || 0} interfaces / live metrics {overview?.liveInterfaceMetricCount || 0}. Missing: {(overview?.missingRequiredMetrics || []).join(', ') || 'none'}.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Interface</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Port</th>
                <th className="px-6 py-4 font-medium text-right">Download</th>
                <th className="px-6 py-4 font-medium text-right">Upload</th>
                <th className="px-6 py-4 font-medium text-right">Utilization</th>
                <th className="px-6 py-4 font-medium text-right">Err/Drop 5m</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(overview?.interfaces || []).map((item) => (
                <tr key={`${item.instance}-${item.name}`} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-mono font-medium">{item.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.displayName}{item.comment ? ` / ${item.comment}` : ''}</div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{roleBadge(item.role)}{item.isp ? ` / ${item.isp}` : ''}{item.role === 'wan' ? item.includeInWanTotal ? ' / total source' : ' / physical only' : ''}</td>
                  <td className="px-6 py-4"><StatusIndicator status={portStatus(item)} text={portStatusText(item)} /></td>
                  <td className="px-6 py-4 text-right font-mono">{metricValue(item.downloadMbps, 'Mbps')}</td>
                  <td className="px-6 py-4 text-right font-mono">{metricValue(item.uploadMbps, 'Mbps')}</td>
                  <td className="px-6 py-4 text-right font-mono">{utilizationText(maxUtilization(item))}</td>
                  <td className="px-6 py-4 text-right font-mono">{countValue(item.errors5m)} / {countValue(item.discards5m)}</td>
                </tr>
              ))}
              {(overview?.interfaces || []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                    Belum ada mapping interface.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {(overview?.missingRequiredMetrics || []).length > 0 && (
          <div className="border-t border-border bg-amber-50 px-6 py-4 text-sm text-amber-800">
            SNMP scrape sudah terlihat, tetapi beberapa metric MikroTik belum lengkap. Pastikan module SNMP mengeluarkan IF-MIB counter/status dan sysUpTime.
          </div>
        )}
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
    </div>
  );
}
