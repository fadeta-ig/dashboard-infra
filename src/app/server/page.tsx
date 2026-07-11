'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, ServerCog } from 'lucide-react';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import { ServerSnapshotGrid } from '@/components/server/server-snapshot-grid';
import { ServerCharts } from '@/components/server/server-charts';
import { ServerFilesystems } from '@/components/server/server-filesystems';
import { ServerCpuCores } from '@/components/server/server-cpu-cores';
import { ServerTopProcesses } from '@/components/server/server-top-processes';
import { ServerRebootBanner } from '@/components/server/server-reboot-banner';
import type { ServerDetailResponse, ServerMetrics, ServerRangePoint } from '@/lib/types';
import { getErrorMessage } from '@/lib/metrics';

type ServerCurrentResponse = ServerMetrics & { timestamp: string };
type ServerRangeResponse = { range: string; points: ServerRangePoint[] };

interface ServiceHealth {
  key: string;
  label: string;
  matcher: string;
  required: boolean;
  unit: string | null;
  state: string | null;
  active: boolean | null;
  metricAvailable: boolean;
}

interface ServiceUnitSample {
  unit: string;
  state: string;
}

interface ServicesResponse {
  collector: string;
  collectorAvailable: boolean;
  matchedUnitCount: number;
  availableUnits: ServiceUnitSample[];
  missingRequired: string[];
  services: ServiceHealth[];
  timestamp: string;
}

interface Pm2ProcessHealth {
  source: string;
  name: string;
  pmId: number | null;
  pid: number | null;
  status: string;
  active: boolean;
  required: boolean;
  cpuPercent: number | null;
  memoryBytes: number | null;
  restartCount: number | null;
  unstableRestartCount: number | null;
  uptimeMs: number | null;
  execMode: string | null;
  instances: string | null;
}

interface Pm2HealthResponse {
  available: boolean;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  requiredApps: string[];
  requiredDown: string[];
  processes: Pm2ProcessHealth[];
  sources: Array<{ label: string; available: boolean; error: string | null }>;
  error: string | null;
  timestamp: string;
}

function serviceStatus(service: ServiceHealth): 'healthy' | 'critical' | 'unknown' {
  if (!service.metricAvailable || service.active === null) return 'unknown';
  return service.active ? 'healthy' : 'critical';
}

function serviceText(service: ServiceHealth) {
  if (!service.metricAvailable || service.state === null) return 'Metric unavailable';
  if (service.state === 'active') return 'Active';
  return service.state.charAt(0).toUpperCase() + service.state.slice(1);
}

function collectorText(services: ServicesResponse | null) {
  if (!services) return 'Checking';
  if (!services.collectorAvailable) return 'Collector missing';
  if (services.matchedUnitCount === 0) return 'No unit matched';
  return 'Collector ready';
}

function collectorStatus(services: ServicesResponse | null): 'healthy' | 'warning' | 'unknown' {
  if (!services) return 'unknown';
  if (!services.collectorAvailable) return 'unknown';
  if (services.matchedUnitCount === 0) return 'warning';
  return 'healthy';
}

function pm2Text(pm2: Pm2HealthResponse | null) {
  if (!pm2) return 'Checking';
  if (!pm2.available) return 'All PM2 sources unavailable';
  if (pm2.requiredDown.length > 0) return `${pm2.requiredDown.length} required down`;
  return 'PM2 ready';
}

function formatMemory(bytes: number | null) {
  if (bytes === null) return '-';
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

function formatUptime(ms: number | null) {
  if (ms === null) return '-';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

const SNAPSHOT_INTERVAL_MS = 30_000;
const DETAIL_INTERVAL_MS = 60_000;

export default function ServerPage() {
  const [current, setCurrent] = useState<ServerCurrentResponse | null>(null);
  const [points, setPoints] = useState<ServerRangePoint[]>([]);
  const [detail, setDetail] = useState<ServerDetailResponse | null>(null);
  const [services, setServices] = useState<ServicesResponse | null>(null);
  const [pm2, setPm2] = useState<Pm2HealthResponse | null>(null);
  const [range, setRange] = useState('1h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrent = useCallback(async (): Promise<ServerCurrentResponse> => {
    const response = await fetch('/api/metrics/server', { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch current server metrics');
    return (await response.json()) as ServerCurrentResponse;
  }, []);

  const fetchRange = useCallback(async (): Promise<ServerRangeResponse> => {
    const response = await fetch(`/api/metrics/server/range?range=${range}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch server range metrics');
    return (await response.json()) as ServerRangeResponse;
  }, [range]);

  const fetchDetail = useCallback(async (): Promise<ServerDetailResponse> => {
    const response = await fetch('/api/metrics/server/detail', { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch server detail metrics');
    return (await response.json()) as ServerDetailResponse;
  }, []);

  const fetchServices = useCallback(async (): Promise<ServicesResponse> => {
    const response = await fetch('/api/metrics/server/services', { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch Ubuntu service health');
    return (await response.json()) as ServicesResponse;
  }, []);

  const fetchPm2 = useCallback(async (): Promise<Pm2HealthResponse> => {
    const response = await fetch('/api/metrics/server/pm2', { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch PM2 process health');
    return (await response.json()) as Pm2HealthResponse;
  }, []);

  const refreshSnapshot = useCallback(async () => {
    try {
      const [currentMetrics, rangeMetrics, serviceMetrics, pm2Metrics] = await Promise.all([
        fetchCurrent(),
        fetchRange(),
        fetchServices(),
        fetchPm2(),
      ]);
      setCurrent(currentMetrics);
      setPoints(rangeMetrics.points);
      setServices(serviceMetrics);
      setPm2(pm2Metrics);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [fetchCurrent, fetchRange, fetchServices, fetchPm2]);

  const refreshDetail = useCallback(async () => {
    try {
      const detailData = await fetchDetail();
      setDetail(detailData);
    } catch {
      // Detail is non-critical.
    }
  }, [fetchDetail]);

  useEffect(() => {
    const snapshotTimer = window.setTimeout(() => void refreshSnapshot(), 0);
    const detailTimer = window.setTimeout(() => void refreshDetail(), 0);

    const snapshotInterval = window.setInterval(() => void refreshSnapshot(), SNAPSHOT_INTERVAL_MS);
    const detailInterval = window.setInterval(() => void refreshDetail(), DETAIL_INTERVAL_MS);

    return () => {
      window.clearTimeout(snapshotTimer);
      window.clearTimeout(detailTimer);
      window.clearInterval(snapshotInterval);
      window.clearInterval(detailInterval);
    };
  }, [refreshSnapshot, refreshDetail]);

  return (
    <div className="animate-fade-in animate-slide-up space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Server Ubuntu</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Full observability: CPU, RAM, swap, disk I/O, network, uptime, dan service health untuk server-wig
          </p>
        </div>
        <div className="flex gap-2 rounded-md border border-border bg-card p-1">
          {['1h', '6h', '24h'].map((item) => (
            <button
              key={item}
              onClick={() => setRange(item)}
              className={`rounded-sm px-3 py-1 text-sm font-medium transition-colors ${
                range === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-destructive">
            <Activity className="h-5 w-5" /> Connection Error
          </h2>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <button
            onClick={() => void refreshSnapshot()}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Retry Connection
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-lg border border-border bg-muted" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-[280px] animate-pulse rounded-lg border border-border bg-muted" />
            <div className="h-[280px] animate-pulse rounded-lg border border-border bg-muted" />
          </div>
        </div>
      ) : (
        <>
          <ServerRebootBanner rebootRequired={current?.rebootRequired ?? null} />
          <ServerSnapshotGrid current={current} />
          <ServerCharts points={points} />

          {detail && detail.cpuCores.length > 0 && <ServerCpuCores cores={detail.cpuCores} />}
          {detail && <ServerFilesystems filesystems={detail.filesystems} />}

          <ServerTopProcesses
            processes={detail?.topProcesses ?? []}
            available={detail?.processExporterAvailable ?? false}
          />

          <section className="panel-surface overflow-hidden rounded-lg">
            <div className="flex items-center justify-between gap-4 border-b border-border bg-white/60 px-6 py-4">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-slate-950" />
                <div>
                  <h2 className="font-semibold">PM2 Process Health</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Aplikasi Node yang berjalan lewat PM2 pada server ini</p>
                </div>
              </div>
              <StatusIndicator status={pm2?.status ?? 'unknown'} text={pm2Text(pm2)} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 font-medium">Source</th>
                    <th className="px-6 py-4 font-medium">App</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">PM2 ID / PID</th>
                    <th className="px-6 py-4 font-medium">CPU</th>
                    <th className="px-6 py-4 font-medium">Memory</th>
                    <th className="px-6 py-4 font-medium">Restart</th>
                    <th className="px-6 py-4 font-medium">Uptime</th>
                    <th className="px-6 py-4 font-medium">Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(pm2?.processes || []).map((process) => (
                    <tr key={`${process.source}:${process.name}:${process.pmId ?? 'missing'}`} className="transition-colors hover:bg-muted/50">
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{process.source}</td>
                      <td className="px-6 py-4 font-medium">{process.name}</td>
                      <td className="px-6 py-4">
                        <StatusIndicator status={process.active ? 'healthy' : 'critical'} text={process.status} />
                      </td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">
                        {process.pmId === null ? '-' : process.pmId} / {process.pid === null ? '-' : process.pid}
                      </td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{process.cpuPercent === null ? '-' : `${process.cpuPercent}%`}</td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{formatMemory(process.memoryBytes)}</td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{process.restartCount ?? '-'}</td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{formatUptime(process.uptimeMs)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{process.required ? 'Yes' : 'Optional'}</td>
                    </tr>
                  ))}
                  {pm2?.available && pm2.processes.length === 0 && (
                    <tr>
                      <td className="px-6 py-8 text-center text-muted-foreground" colSpan={9}>Tidak ada proses PM2.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {pm2 && !pm2.available && (
              <div className="border-t border-border bg-amber-50 px-6 py-4 text-sm text-amber-800">
                PM2 belum bisa dibaca dari semua source. Cek <code>PM2_BIN</code>, <code>PM2_HOME</code>, file snapshot root, dan permission. Detail: {pm2.error}
              </div>
            )}
            {pm2?.available && pm2.sources.some((source) => !source.available) && (
              <div className="border-t border-border bg-amber-50 px-6 py-4 text-sm text-amber-800">
                Sebagian source PM2 gagal dibaca: {pm2.sources.filter((source) => !source.available).map((source) => `${source.label}: ${source.error}`).join('; ')}
              </div>
            )}
            {pm2?.available && pm2.requiredDown.length > 0 && (
              <div className="border-t border-border bg-red-50 px-6 py-4 text-sm text-red-700">
                Required PM2 app tidak online: {pm2.requiredDown.join(', ')}.
              </div>
            )}
          </section>

          <section className="panel-surface overflow-hidden rounded-lg">
            <div className="flex items-center justify-between gap-4 border-b border-border bg-white/60 px-6 py-4">
              <div className="flex items-center gap-3">
                <ServerCog className="h-5 w-5 text-slate-950" />
                <div>
                  <h2 className="font-semibold">Ubuntu Service Health</h2>
                  <p className="mt-1 text-xs text-muted-foreground">nginx, apache, php, mysql/mariadb, node, pm2, ssh</p>
                </div>
              </div>
              <StatusIndicator status={collectorStatus(services)} text={collectorText(services)} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 font-medium">Service</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Unit</th>
                    <th className="px-6 py-4 font-medium">Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(services?.services || []).map((service) => (
                    <tr key={service.key} className="transition-colors hover:bg-muted/50">
                      <td className="px-6 py-4 font-medium">{service.label}</td>
                      <td className="px-6 py-4">
                        <StatusIndicator status={serviceStatus(service)} text={serviceText(service)} />
                      </td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{service.unit || service.matcher}</td>
                      <td className="px-6 py-4 text-muted-foreground">{service.required ? 'Yes' : 'Optional'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {services && !services.collectorAvailable && (
              <div className="border-t border-border bg-amber-50 px-6 py-4 text-sm text-amber-800">
                Metric <code>node_systemd_unit_state</code> belum tersedia. Aktifkan Node Exporter systemd collector.
              </div>
            )}
            {services?.collectorAvailable && services.matchedUnitCount === 0 && (
              <div className="border-t border-border bg-amber-50 px-6 py-4 text-sm text-amber-800">
                Collector tersedia tetapi belum ada unit yang cocok. Cek nama service aktual di server.
              </div>
            )}
            {services?.collectorAvailable && services.availableUnits.length > 0 && (
              <div className="border-t border-border bg-slate-50 px-6 py-4 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">
                  Matched: {services.availableUnits.map((unit) => `${unit.unit} (${unit.state})`).join(', ')}
                </p>
                {services.missingRequired.length > 0 && (
                  <p className="mt-1 text-amber-700">Required missing: {services.missingRequired.join(', ')}</p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
