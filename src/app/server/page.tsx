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

const SNAPSHOT_INTERVAL_MS = 30_000;
const DETAIL_INTERVAL_MS = 60_000;

export default function ServerPage() {
  const [current, setCurrent] = useState<ServerCurrentResponse | null>(null);
  const [points, setPoints] = useState<ServerRangePoint[]>([]);
  const [detail, setDetail] = useState<ServerDetailResponse | null>(null);
  const [services, setServices] = useState<ServicesResponse | null>(null);
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

  const refreshSnapshot = useCallback(async () => {
    try {
      const [currentMetrics, rangeMetrics, serviceMetrics] = await Promise.all([
        fetchCurrent(),
        fetchRange(),
        fetchServices(),
      ]);
      setCurrent(currentMetrics);
      setPoints(rangeMetrics.points);
      setServices(serviceMetrics);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [fetchCurrent, fetchRange, fetchServices]);

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
            Full observability: CPU, RAM, swap, disk I/O, network, uptime, temperature, dan service health untuk server-wig
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
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

          {detail?.temperatureAvailable && (
            <section className="panel-surface overflow-hidden rounded-lg">
              <div className="border-b border-border bg-white/60 px-6 py-4">
                <h2 className="font-semibold">Temperature Sensors</h2>
                <p className="mt-1 text-xs text-muted-foreground">Sensor suhu dari Node Exporter hwmon atau thermal zone.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-6 py-4 font-medium">Sensor</th>
                      <th className="px-6 py-4 font-medium">Chip / Zone</th>
                      <th className="px-6 py-4 font-medium">Temperature</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {detail.temperatureSensors.map((sensor) => (
                      <tr key={`${sensor.sensor}-${sensor.chip || 'none'}`} className="transition-colors hover:bg-muted/50">
                        <td className="px-6 py-4 font-medium">{sensor.label || sensor.sensor}</td>
                        <td className="px-6 py-4 text-muted-foreground">{sensor.chip || '-'}</td>
                        <td className="px-6 py-4 font-mono">{sensor.temperatureCelsius === null ? 'N/A' : `${sensor.temperatureCelsius.toFixed(1)} °C`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <ServerTopProcesses
            processes={detail?.topProcesses ?? []}
            available={detail?.processExporterAvailable ?? false}
          />

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
