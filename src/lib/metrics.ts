import type {
  InternetStatus,
  NetworkMetrics,
  NetworkRangePoint,
  NetworkTarget,
  PrometheusData,
  PrometheusMetric,
  PrometheusMatrixResult,
  PrometheusVectorResult,
  ServerMetrics,
  ServerRangePoint,
  SnmpMetricDiscovery,
  Status,
  TargetHealth,
} from '@/lib/types';
import { getMonitoringThresholds } from '@/lib/thresholds';

export const PROMQL = {
  cpuUsage: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
  ramUsage: '100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))',
  ramAvailableGb: 'node_memory_MemAvailable_bytes / 1024 / 1024 / 1024',
  diskRootUsage: '100 * (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})',
  load1: 'node_load1',
  up: 'up',
  pingSuccess: 'probe_success{job="blackbox_icmp"}',
  pingLatency: 'probe_duration_seconds{job="blackbox_icmp"}',
};

export const NETWORK_TARGETS = {
  gateway: '192.168.20.1',
  googleDns: '8.8.8.8',
  cloudflareDns: '1.1.1.1',
} as const;

export const VALID_RANGES = ['1h', '6h', '24h'] as const;
export type MetricsRange = (typeof VALID_RANGES)[number];

export function parseRange(value: string | null): { range: MetricsRange; hours: number; step: string } {
  if (value === '6h') return { range: '6h', hours: 6, step: '5m' };
  if (value === '24h') return { range: '24h', hours: 24, step: '15m' };
  return { range: '1h', hours: 1, step: '1m' };
}

export function nowIso() {
  return new Date().toISOString();
}

export function extractSingleValue(data: PrometheusData | null): number | null {
  if (!data || data.resultType !== 'vector' || data.result.length === 0) return null;
  const parsed = Number.parseFloat(data.result[0].value[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function valueAt(result: PrometheusVectorResult | undefined): number | null {
  if (!result) return null;
  const parsed = Number.parseFloat(result.value[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function roundMetric(value: number | null, digits = 2) {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function getServerStatus(metrics: Omit<ServerMetrics, 'status'>): Status {
  const thresholds = getMonitoringThresholds().server;
  const values = [metrics.cpuUsage, metrics.ramUsage, metrics.diskUsage];
  if (values.some((value) => value === null)) return 'unknown';
  if (
    metrics.cpuUsage !== null && metrics.cpuUsage >= thresholds.cpuUsagePercent.critical ||
    metrics.ramUsage !== null && metrics.ramUsage >= thresholds.ramUsagePercent.critical ||
    metrics.diskUsage !== null && metrics.diskUsage >= thresholds.diskUsagePercent.critical
  ) {
    return 'critical';
  }
  if (
    metrics.cpuUsage !== null && metrics.cpuUsage >= thresholds.cpuUsagePercent.warning ||
    metrics.ramUsage !== null && metrics.ramUsage >= thresholds.ramUsagePercent.warning ||
    metrics.diskUsage !== null && metrics.diskUsage >= thresholds.diskUsagePercent.warning
  ) {
    return 'warning';
  }
  return 'healthy';
}

export function buildServerMetrics(
  cpuData: PrometheusData | null,
  ramUsageData: PrometheusData | null,
  ramAvailData: PrometheusData | null,
  diskData: PrometheusData | null,
  loadData: PrometheusData | null,
): ServerMetrics {
  const server = {
    cpuUsage: roundMetric(extractSingleValue(cpuData), 2),
    ramUsage: roundMetric(extractSingleValue(ramUsageData), 2),
    ramAvailableGb: roundMetric(extractSingleValue(ramAvailData), 2),
    diskUsage: roundMetric(extractSingleValue(diskData), 2),
    load1: roundMetric(extractSingleValue(loadData), 2),
  };

  return {
    ...server,
    status: getServerStatus(server),
  };
}

function metricMatchesTarget(result: PrometheusVectorResult | PrometheusMatrixResult, targetIp: string) {
  return result.metric.instance === targetIp || result.metric.target === targetIp;
}

export function buildNetworkTarget(
  target: string,
  pingStatusData: PrometheusData | null,
  pingLatencyData: PrometheusData | null,
): NetworkTarget {
  const statusResult = pingStatusData?.resultType === 'vector'
    ? pingStatusData.result.find((result) => metricMatchesTarget(result, target))
    : undefined;
  const latencyResult = pingLatencyData?.resultType === 'vector'
    ? pingLatencyData.result.find((result) => metricMatchesTarget(result, target))
    : undefined;

  const successValue = valueAt(statusResult);
  const latencyValue = valueAt(latencyResult);

  return {
    target,
    up: successValue === null ? null : successValue === 1,
    latencyMs: latencyValue === null ? null : roundMetric(latencyValue * 1000, 2),
  };
}

export function getInternetStatus(gateway: NetworkTarget, googleDns: NetworkTarget, cloudflareDns: NetworkTarget): InternetStatus {
  if (gateway.up === null || googleDns.up === null || cloudflareDns.up === null) return 'unknown';
  if (!gateway.up || (!googleDns.up && !cloudflareDns.up)) return 'critical';
  if (gateway.up && (!googleDns.up || !cloudflareDns.up)) return 'degraded';
  return 'healthy';
}

export function buildNetworkMetrics(
  pingStatusData: PrometheusData | null,
  pingLatencyData: PrometheusData | null,
  timestamp = nowIso(),
): NetworkMetrics {
  const gateway = buildNetworkTarget(NETWORK_TARGETS.gateway, pingStatusData, pingLatencyData);
  const googleDns = buildNetworkTarget(NETWORK_TARGETS.googleDns, pingStatusData, pingLatencyData);
  const cloudflareDns = buildNetworkTarget(NETWORK_TARGETS.cloudflareDns, pingStatusData, pingLatencyData);

  return {
    gateway,
    googleDns,
    cloudflareDns,
    internetStatus: getInternetStatus(gateway, googleDns, cloudflareDns),
    timestamp,
  };
}

export function buildTargets(targetsData: PrometheusData | null, lastChecked = nowIso()): TargetHealth[] {
  if (!targetsData || targetsData.resultType !== 'vector') return [];

  return targetsData.result.map((result) => {
    const value = valueAt(result) ?? 0;
    return {
      job: result.metric.job || 'unknown',
      instance: result.metric.instance || 'unknown',
      up: value === 1,
      value,
      lastChecked,
    };
  });
}

export function combineStatus(serverStatus: Status, internetStatus: InternetStatus, targets: TargetHealth[]): Status {
  const hasDownTarget = targets.some((target) => !target.up);
  if (serverStatus === 'unknown' || internetStatus === 'unknown') return 'unknown';
  if (serverStatus === 'critical' || internetStatus === 'critical' || hasDownTarget) return 'critical';
  if (serverStatus === 'warning' || internetStatus === 'degraded') return 'warning';
  return 'healthy';
}

export function combineQueryHealth(...results: Array<PrometheusData | null>): Status {
  return results.every(Boolean) ? 'healthy' : 'unknown';
}

export function alignServerRange(
  cpuData: PrometheusData | null,
  ramData: PrometheusData | null,
  loadData: PrometheusData | null,
): ServerRangePoint[] {
  const cpuValues = cpuData?.resultType === 'matrix' ? cpuData.result[0]?.values || [] : [];
  const ramValues = ramData?.resultType === 'matrix' ? ramData.result[0]?.values || [] : [];
  const loadValues = loadData?.resultType === 'matrix' ? loadData.result[0]?.values || [] : [];

  return cpuValues.map(([timestamp, cpuRaw], index) => ({
    timestamp: timestamp * 1000,
    cpu: roundMetric(Number.parseFloat(cpuRaw), 2),
    ram: ramValues[index]?.[1] ? roundMetric(Number.parseFloat(ramValues[index][1]), 2) : null,
    load: loadValues[index]?.[1] ? roundMetric(Number.parseFloat(loadValues[index][1]), 2) : null,
  }));
}

function findMatrixForTarget(data: PrometheusData | null, target: string) {
  if (!data || data.resultType !== 'matrix') return undefined;
  return data.result.find((result) => metricMatchesTarget(result, target));
}

export function alignNetworkRange(latencyData: PrometheusData | null): NetworkRangePoint[] {
  const gateway = findMatrixForTarget(latencyData, NETWORK_TARGETS.gateway)?.values || [];
  const googleDns = findMatrixForTarget(latencyData, NETWORK_TARGETS.googleDns)?.values || [];
  const cloudflareDns = findMatrixForTarget(latencyData, NETWORK_TARGETS.cloudflareDns)?.values || [];
  const longest = [gateway, googleDns, cloudflareDns].reduce((current, next) => next.length > current.length ? next : current, gateway);

  return longest.map(([timestamp], index) => ({
    timestamp: timestamp * 1000,
    gateway: gateway[index]?.[1] ? roundMetric(Number.parseFloat(gateway[index][1]) * 1000, 2) : null,
    googleDns: googleDns[index]?.[1] ? roundMetric(Number.parseFloat(googleDns[index][1]) * 1000, 2) : null,
    cloudflareDns: cloudflareDns[index]?.[1] ? roundMetric(Number.parseFloat(cloudflareDns[index][1]) * 1000, 2) : null,
  }));
}

export function buildSnmpDiscovery(series: PrometheusMetric[] | null): SnmpMetricDiscovery[] {
  const metrics = new Map<string, { jobs: Set<string>; instances: Set<string>; sampleLabels: Record<string, string> }>();

  for (const item of series || []) {
    const name = item.__name__;
    if (!name) continue;

    const entry = metrics.get(name) || {
      jobs: new Set<string>(),
      instances: new Set<string>(),
      sampleLabels: {},
    };

    if (item.job) entry.jobs.add(item.job);
    if (item.instance) entry.instances.add(item.instance);
    if (Object.keys(entry.sampleLabels).length === 0) {
      entry.sampleLabels = Object.fromEntries(
        Object.entries(item).filter(([key]) => key !== '__name__'),
      ) as Record<string, string>;
    }

    metrics.set(name, entry);
  }

  return Array.from(metrics.entries())
    .map(([name, value]) => ({
      name,
      jobs: Array.from(value.jobs).sort(),
      instances: Array.from(value.instances).sort(),
      sampleLabels: value.sampleLabels,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

