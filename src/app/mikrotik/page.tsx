'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Gauge,
  type LucideIcon,
  RadioTower,
  RouterIcon,
  Search,
  ShieldAlert,
  Thermometer,
  Timer,
  TriangleAlert,
  Waves,
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import type { MikrotikDiscoveryResponse } from '@/lib/types';
import { getErrorMessage } from '@/lib/metrics';
import { cn } from '@/lib/utils';

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
  temperatureCelsius: number | null;
  temperatureMetric: string | null;
  temperatureAvailable: boolean;
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
  if (seconds === null) return 'Belum tersedia';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function countValue(value: number | null) {
  return value === null ? 'Belum ada' : value.toFixed(0);
}

function labelPreview(labels: Record<string, string>) {
  const entries = Object.entries(labels).slice(0, 4);
  if (entries.length === 0) return '-';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

function metricValue(value: number | null, suffix: string) {
  return value === null ? 'Belum tersedia' : `${value.toFixed(2)} ${suffix}`;
}

function compactMetricValue(value: number | null, suffix: string) {
  return value === null ? 'N/A' : `${value.toFixed(1)} ${suffix}`;
}

function utilizationText(value: number | null) {
  return value === null ? 'Belum tersedia' : `${value.toFixed(1)}%`;
}

function formatUpdatedTime(timestamp: string | null | undefined) {
  if (!timestamp) return 'Belum tersedia';
  return new Date(timestamp).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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

function roleTone(role: string) {
  if (role === 'wan') return 'bg-sky-50 text-sky-700 border-sky-100';
  if (role === 'trunk') return 'bg-violet-50 text-violet-700 border-violet-100';
  if (role === 'vlan') return 'bg-amber-50 text-amber-700 border-amber-100';
  if (role === 'vpn') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  return 'bg-slate-50 text-slate-600 border-slate-100';
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

  const interfaceGroups = useMemo(() => {
    const interfaces = overview?.interfaces || [];
    return {
      focus: interfaces.filter((item) => ['wan', 'trunk', 'vpn'].includes(item.role)),
      access: interfaces.filter((item) => ['vlan', 'lan'].includes(item.role)),
      passive: interfaces.filter((item) => ['unused', 'loopback'].includes(item.role)),
    };
  }, [overview?.interfaces]);

  const issueCount = useMemo(() => {
    if (!overview) return 0;
    return overview.interfaces.filter((item) => portStatus(item) === 'critical' || (item.errors5m || 0) > 0 || (item.discards5m || 0) > 0).length;
  }, [overview]);

  return (
    <div className="space-y-6 animate-fade-in animate-slide-up">
      <section className="panel-surface rounded-lg border border-border px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">MikroTik Gateway {overview?.gateway || '192.168.20.1'}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">MikroTik Gateway Overview</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Ringkasan uplink, suhu router, kualitas koneksi, dan status port dalam tampilan yang lebih rapi untuk monitoring operasional harian.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <InfoChip icon={RouterIcon} label={`${overview?.configuredInterfaceCount || 0} interface terkonfigurasi`} />
              <InfoChip icon={ShieldAlert} label={`${issueCount} interface perlu perhatian`} />
              <InfoChip icon={Thermometer} label={overview?.temperatureAvailable ? `Router ${overview.temperatureCelsius?.toFixed(1)} \u00B0C` : 'Metric suhu belum tersedia'} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:min-w-[560px]">
            <SummaryTile
              title="Download / Upload"
              value={overview ? `${compactMetricValue(overview.totalDownloadMbps, 'Mbps')} / ${compactMetricValue(overview.totalUploadMbps, 'Mbps')}` : 'Memuat'}
              note={overview ? `Utilisasi puncak ${utilizationText(Math.max(overview.totalDownloadUtilizationPercent || 0, overview.totalUploadUtilizationPercent || 0))}` : 'Menunggu data'}
            />
            <SummaryTile
              title="Ping / Jitter"
              value={overview ? `${compactMetricValue(overview.pingMs, 'ms')} / ${compactMetricValue(overview.jitterMs, 'ms')}` : 'Memuat'}
              note="Kualitas koneksi gateway"
            />
            <button
              type="button"
              onClick={() => void handleDiscovery()}
              disabled={loadingDiscovery}
              className="rounded-lg border border-slate-200 bg-white px-4 py-4 text-left text-slate-900 transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {loadingDiscovery ? <span className="h-4 w-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" /> : <Search className="h-4 w-4" />}
                Discovery
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Pindai metric SNMP suhu, sistem, dan interface yang sudah masuk ke Prometheus.
              </p>
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-5">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
          <div>
            <h2 className="font-semibold text-destructive">Peringatan Data MikroTik</h2>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {loadingOverview ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-8">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => <div key={item} className="h-32 animate-pulse rounded-lg border border-border bg-muted" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <StatCard title="WAN Download" value={metricValue(overview?.totalDownloadMbps ?? null, 'Mbps')} description={overview ? `Kapasitas ${overview.totalDownloadCapacityMbps} Mbps / ${utilizationText(overview.totalDownloadUtilizationPercent)}` : undefined} icon={ArrowDownToLine} status={overview?.totalDownloadMbps === null ? 'unknown' : 'healthy'} />
          <StatCard title="WAN Upload" value={metricValue(overview?.totalUploadMbps ?? null, 'Mbps')} description={overview ? `Kapasitas ${overview.totalUploadCapacityMbps} Mbps / ${utilizationText(overview.totalUploadUtilizationPercent)}` : undefined} icon={ArrowUpFromLine} status={overview?.totalUploadMbps === null ? 'unknown' : 'healthy'} />
          <StatCard title="Router Uptime" value={formatDuration(overview?.routerUptimeSeconds ?? null)} icon={Timer} status={overview?.routerUptimeSeconds === null ? 'unknown' : 'healthy'} />
          <StatCard
            title="Router Temperature"
            value={overview?.temperatureCelsius === null || overview?.temperatureCelsius === undefined ? 'Belum tersedia' : `${overview.temperatureCelsius.toFixed(1)} \u00B0C`}
            description={overview?.temperatureMetric || 'Metric suhu SNMP belum ditemukan'}
            icon={Thermometer}
            status={
              overview?.temperatureCelsius === null || overview?.temperatureCelsius === undefined
                ? 'unknown'
                : overview.temperatureCelsius >= 85
                  ? 'critical'
                  : overview.temperatureCelsius >= 70
                    ? 'warning'
                    : 'healthy'
            }
          />
          <StatCard title="Ping Gateway" value={metricValue(overview?.pingMs ?? null, 'ms')} icon={RouterIcon} status={latencyStatus(overview?.pingMs ?? null, 20, 80)} />
          <StatCard title="Jitter 5m" value={metricValue(overview?.jitterMs ?? null, 'ms')} icon={Gauge} status={latencyStatus(overview?.jitterMs ?? null, 5, 20)} />
          <StatCard title="Errors 5m" value={countValue(overview?.totalErrors5m ?? null)} icon={TriangleAlert} status={(overview?.totalErrors5m ?? null) === null ? 'unknown' : (overview?.totalErrors5m || 0) > 0 ? 'warning' : 'healthy'} />
          <StatCard title="Drops 5m" value={countValue(overview?.totalDiscards5m ?? null)} icon={RadioTower} status={(overview?.totalDiscards5m ?? null) === null ? 'unknown' : (overview?.totalDiscards5m || 0) > 0 ? 'warning' : 'healthy'} />
        </div>
      )}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="panel-surface rounded-lg p-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Interface MikroTik Terkonfigurasi</h2>
              <p className="mt-1 text-sm text-slate-500">
                {overview?.configuredInterfaceCount || 0} interface terkonfigurasi / {overview?.liveInterfaceMetricCount || 0} interface dengan metric aktif.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Metric Belum Lengkap</p>
              <p className="mt-1 text-sm text-slate-700">{(overview?.missingRequiredMetrics || []).join(', ') || 'Tidak ada'}</p>
            </div>
          </div>

          <div className="grid gap-3 p-4 md:hidden">
            {interfaceGroups.focus.concat(interfaceGroups.access).map((item) => (
              <article key={`${item.instance}-${item.name}`} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="break-all font-mono text-sm font-medium text-slate-900">{item.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.displayName}{item.comment ? ` / ${item.comment}` : ''}</p>
                  </div>
                  <StatusIndicator status={portStatus(item)} text={portStatusText(item)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase', roleTone(item.role))}>{roleBadge(item.role)}</span>
                  {item.isp && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">{item.isp}</span>}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Download</p>
                    <p className="font-mono">{metricValue(item.downloadMbps, 'Mbps')}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Upload</p>
                    <p className="font-mono">{metricValue(item.uploadMbps, 'Mbps')}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Utilization</p>
                    <p className="font-mono">{utilizationText(maxUtilization(item))}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Err / Drop 5m</p>
                    <p className="font-mono">{countValue(item.errors5m)} / {countValue(item.discards5m)}</p>
                  </div>
                </div>
              </article>
            ))}
            {(overview?.interfaces || []).length === 0 && (
              <div className="px-6 py-8 text-center text-muted-foreground">Belum ada mapping interface.</div>
            )}
          </div>

          <div className="hidden overflow-x-auto pt-4 md:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Interface</th>
                  <th className="px-6 py-4 font-medium">Role</th>
                  <th className="px-6 py-4 font-medium">Port</th>
                  <th className="px-6 py-4 text-right font-medium">Download</th>
                  <th className="px-6 py-4 text-right font-medium">Upload</th>
                  <th className="px-6 py-4 text-right font-medium">Utilization</th>
                  <th className="px-6 py-4 text-right font-medium">Err/Drop 5m</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(overview?.interfaces || []).map((item) => (
                  <tr key={`${item.instance}-${item.name}`} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-6 py-4">
                      <div className="font-mono text-sm font-medium text-slate-900">{item.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.displayName}{item.comment ? ` / ${item.comment}` : ''}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase', roleTone(item.role))}>{roleBadge(item.role)}</span>
                        {item.isp && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">{item.isp}</span>}
                      </div>
                    </td>
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
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              SNMP scrape sudah terlihat, tetapi beberapa metric MikroTik belum lengkap. Pastikan modul SNMP mengeluarkan counter IF-MIB, status port, dan `sysUpTime`.
            </div>
          )}
        </div>

        <div>
          <aside className="panel-surface rounded-lg p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-700"><Waves className="h-4 w-4" /></div>
              <div>
                <h2 className="font-semibold text-slate-900">Snapshot Operasional</h2>
                <p className="text-xs text-slate-500">Ringkasan cepat untuk operator.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <QuickRow label="Kapasitas WAN" value={overview ? `${overview.totalDownloadCapacityMbps}/${overview.totalUploadCapacityMbps} Mbps` : 'Belum tersedia'} />
              <QuickRow label="Packet loss" value={metricValue(overview?.packetLossPercent ?? null, '%')} />
              <QuickRow label="Sumber suhu" value={overview?.temperatureMetric || 'Belum ada metric'} />
              <QuickRow label="Pembaruan" value={formatUpdatedTime(overview?.timestamp)} />
            </div>
          </aside>
        </div>
      </section>

      {data && (
        <section className="panel-surface overflow-hidden rounded-lg">
          <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Hasil Discovery</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.message} Total series: {data.totalSeries}. Diperiksa terakhir: {formatUpdatedTime(data.timestamp)}.
            </p>
          </div>
          <div className="grid gap-3 p-4 md:hidden">
            {data.metrics.map((metric) => (
              <article key={metric.name} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <p className="break-all font-mono text-sm font-medium text-slate-900">{metric.name}</p>
                <div className="text-xs text-muted-foreground">
                  <p><span className="font-medium text-foreground">Jobs:</span> {metric.jobs.join(', ') || '-'}</p>
                  <p className="break-all"><span className="font-medium text-foreground">Instances:</span> {metric.instances.join(', ') || '-'}</p>
                  <p className="break-all"><span className="font-medium text-foreground">Sample:</span> {labelPreview(metric.sampleLabels)}</p>
                </div>
              </article>
            ))}
            {data.metrics.length === 0 && (
              <div className="px-6 py-8 text-center text-muted-foreground">Belum ada metric SNMP yang terdeteksi.</div>
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Metric</th>
                  <th className="px-6 py-4 font-medium">Jobs</th>
                  <th className="px-6 py-4 font-medium">Instances</th>
                  <th className="px-6 py-4 font-medium">Sample Labels</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.metrics.map((metric) => (
                  <tr key={metric.name} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-6 py-4 font-mono text-sm font-medium text-slate-900">{metric.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{metric.jobs.join(', ') || '-'}</td>
                    <td className="px-6 py-4 font-mono text-muted-foreground">{metric.instances.join(', ') || '-'}</td>
                    <td className="max-w-xl truncate px-6 py-4 font-mono text-muted-foreground">{labelPreview(metric.sampleLabels)}</td>
                  </tr>
                ))}
                {data.metrics.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                      Belum ada metric SNMP yang terdeteksi.
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

function SummaryTile({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <p className="mt-2 text-xl font-medium leading-7 text-slate-900">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function InfoChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      <Icon className="h-3.5 w-3.5 text-slate-500" />
      {label}
    </span>
  );
}

function QuickRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-900">{value}</span>
    </div>
  );
}
