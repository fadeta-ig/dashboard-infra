import type {
  CpuCoreUsage,
  FilesystemMount,
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
  TopProcess,
} from '@/lib/types';
import { getMonitoringThresholds } from '@/lib/thresholds';
import { NETWORK_PING_TARGETS } from '@/lib/monitoring-config';

/**
 * Network interfaces to exclude from server RX/TX aggregation.
 * Loopback, Docker bridges, veth pairs, and virtual bridges are excluded
 * to report only physical/primary traffic (enp6s18 in this environment).
 */
const NET_DEVICE_EXCLUDE = 'lo|docker.*|veth.*|br-.*|virbr.*';

/**
 * Filesystem types considered virtual/pseudo — excluded from mountpoint table.
 * iso9660 (CD-ROM) and efivarfs also excluded since they are not data filesystems.
 */
const VIRTUAL_FSTYPES = 'tmpfs|devtmpfs|squashfs|overlay|efivarfs|iso9660|autofs|ramfs|fuse\\..*';

export const PROMQL = {
  // ─── Core ───────────────────────────────────────────────────────────────
  cpuUsage: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
  ramUsage: '100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))',
  ramAvailableGb: 'node_memory_MemAvailable_bytes / 1024 / 1024 / 1024',
  diskRootUsage: `100 * (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})`,
  load1: 'node_load1',
  up: 'up',
  pingSuccess: 'probe_success{job=~"blackbox_icmp|blackbox_icmp_mki_devices"}',
  pingLatency: 'probe_duration_seconds{job=~"blackbox_icmp|blackbox_icmp_mki_devices"}',

  // ─── Uptime ─────────────────────────────────────────────────────────────
  uptimeSeconds: 'node_time_seconds - node_boot_time_seconds',

  // ─── Load Extended ──────────────────────────────────────────────────────
  load5: 'node_load5',
  load15: 'node_load15',

  // ─── CPU Detail ─────────────────────────────────────────────────────────
  cpuCoreCount: 'count(node_cpu_seconds_total{mode="idle"})',
  /** Returns one vector result per CPU core with label cpu="0","1",... */
  cpuPerCore: 'rate(node_cpu_seconds_total{mode="idle"}[5m]) * 100',

  // ─── Swap ───────────────────────────────────────────────────────────────
  /**
   * Guard: node_memory_SwapTotal_bytes == 0 means no swap configured.
   * The `or` clause prevents NaN/Inf when dividing by zero.
   */
  swapUsagePercent: '100 * (1 - (node_memory_SwapFree_bytes / node_memory_SwapTotal_bytes)) and node_memory_SwapTotal_bytes > 0',
  swapUsedGb: '(node_memory_SwapTotal_bytes - node_memory_SwapFree_bytes) / 1073741824',
  swapTotalGb: 'node_memory_SwapTotal_bytes / 1073741824',

  // ─── Disk I/O Throughput ────────────────────────────────────────────────
  diskReadBytesPerSec: 'sum(rate(node_disk_read_bytes_total[5m]))',
  diskWriteBytesPerSec: 'sum(rate(node_disk_written_bytes_total[5m]))',

  // ─── Network Server ─────────────────────────────────────────────────────
  netRxBytesPerSec: `sum(rate(node_network_receive_bytes_total{device!~"${NET_DEVICE_EXCLUDE}"}[5m]))`,
  netTxBytesPerSec: `sum(rate(node_network_transmit_bytes_total{device!~"${NET_DEVICE_EXCLUDE}"}[5m]))`,

  // ─── Filesystem per Mountpoint ──────────────────────────────────────────
  filesystemSize: `node_filesystem_size_bytes{fstype!~"${VIRTUAL_FSTYPES}"}`,
  filesystemAvail: `node_filesystem_avail_bytes{fstype!~"${VIRTUAL_FSTYPES}"}`,
  /** Inodes: vfat does not expose inode metrics — filtered to avoid noise */
  inodeFiles: `node_filesystem_files{fstype!~"${VIRTUAL_FSTYPES}|vfat"}`,
  inodeFilesFree: `node_filesystem_files_free{fstype!~"${VIRTUAL_FSTYPES}|vfat"}`,

  // ─── Reboot Required ────────────────────────────────────────────────────
  /** Provided by node_exporter when /run/reboot-required exists on Ubuntu */
  rebootRequired: 'node_reboot_required',

  // ─── Process Exporter (conditional) ─────────────────────────────────────
  /** Probe metric — if empty vector, process_exporter is not running */
  processExporterProbe: 'namedprocess_namegroup_num_procs',
  topProcessCpu: 'topk(10, rate(namedprocess_namegroup_cpu_seconds_total[5m]) * 100)',
  topProcessMemory: 'topk(10, namedprocess_namegroup_memory_bytes{memtype="resident"})',
  topProcessCount: 'namedprocess_namegroup_num_procs',
} as const;

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

/** Bytes → MB/s rounded to 2 decimal places */
function bytesToMBps(bytesPerSec: number | null): number | null {
  if (bytesPerSec === null) return null;
  return roundMetric(bytesPerSec / 1_048_576, 2);
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
  uptimeData: PrometheusData | null,
  load5Data: PrometheusData | null,
  load15Data: PrometheusData | null,
  cpuCoreCountData: PrometheusData | null,
  swapUsageData: PrometheusData | null,
  swapUsedGbData: PrometheusData | null,
  swapTotalGbData: PrometheusData | null,
  diskReadData: PrometheusData | null,
  diskWriteData: PrometheusData | null,
  netRxData: PrometheusData | null,
  netTxData: PrometheusData | null,
  rebootData: PrometheusData | null,
): ServerMetrics {
  const rawReboot = extractSingleValue(rebootData);
  const server: Omit<ServerMetrics, 'status'> = {
    cpuUsage: roundMetric(extractSingleValue(cpuData), 2),
    ramUsage: roundMetric(extractSingleValue(ramUsageData), 2),
    ramAvailableGb: roundMetric(extractSingleValue(ramAvailData), 2),
    diskUsage: roundMetric(extractSingleValue(diskData), 2),
    load1: roundMetric(extractSingleValue(loadData), 2),
    uptimeSeconds: roundMetric(extractSingleValue(uptimeData), 0),
    load5: roundMetric(extractSingleValue(load5Data), 2),
    load15: roundMetric(extractSingleValue(load15Data), 2),
    cpuCoreCount: roundMetric(extractSingleValue(cpuCoreCountData), 0),
    swapUsagePercent: roundMetric(extractSingleValue(swapUsageData), 2),
    swapUsedGb: roundMetric(extractSingleValue(swapUsedGbData), 2),
    swapTotalGb: roundMetric(extractSingleValue(swapTotalGbData), 2),
    diskReadBytesPerSec: roundMetric(extractSingleValue(diskReadData), 0),
    diskWriteBytesPerSec: roundMetric(extractSingleValue(diskWriteData), 0),
    netRxBytesPerSec: roundMetric(extractSingleValue(netRxData), 0),
    netTxBytesPerSec: roundMetric(extractSingleValue(netTxData), 0),
    rebootRequired: rawReboot === null ? null : rawReboot === 1,
  };

  return { ...server, status: getServerStatus(server) };
}

/**
 * Builds filesystem mount data from separate size and avail vector queries.
 * Pairs results by mountpoint label, computes usage %, and attaches inode stats.
 * Sorted by usage % descending so most-full filesystems appear first.
 */
export function buildFilesystems(
  sizeData: PrometheusData | null,
  availData: PrometheusData | null,
  inodeFilesData: PrometheusData | null,
  inodesFreeData: PrometheusData | null,
): FilesystemMount[] {
  if (!sizeData || sizeData.resultType !== 'vector') return [];

  return sizeData.result
    .map((sizeResult): FilesystemMount => {
      const mountpoint = sizeResult.metric.mountpoint ?? '';
      const device = sizeResult.metric.device ?? '';
      const fstype = sizeResult.metric.fstype ?? '';

      const totalBytes = valueAt(sizeResult);
      const availResult = availData?.resultType === 'vector'
        ? availData.result.find((r) => r.metric.mountpoint === mountpoint)
        : undefined;
      const availBytes = valueAt(availResult);

      const usedBytes = totalBytes !== null && availBytes !== null ? totalBytes - availBytes : null;
      const usagePercent = totalBytes !== null && availBytes !== null && totalBytes > 0
        ? roundMetric(((totalBytes - availBytes) / totalBytes) * 100, 1)
        : null;

      const totalGb = roundMetric(totalBytes !== null ? totalBytes / 1_073_741_824 : null, 2);
      const availGb = roundMetric(availBytes !== null ? availBytes / 1_073_741_824 : null, 2);
      const usedGb = roundMetric(usedBytes !== null ? usedBytes / 1_073_741_824 : null, 2);

      const inodeTotalResult = inodeFilesData?.resultType === 'vector'
        ? inodeFilesData.result.find((r) => r.metric.mountpoint === mountpoint)
        : undefined;
      const inodeFreeResult = inodesFreeData?.resultType === 'vector'
        ? inodesFreeData.result.find((r) => r.metric.mountpoint === mountpoint)
        : undefined;

      const inodesTotal = valueAt(inodeTotalResult);
      const inodesFreeVal = valueAt(inodeFreeResult);
      const inodeUsagePercent = inodesTotal !== null && inodesFreeVal !== null && inodesTotal > 0
        ? roundMetric(((inodesTotal - inodesFreeVal) / inodesTotal) * 100, 1)
        : null;

      return {
        mountpoint,
        device,
        fstype,
        usagePercent,
        usedGb,
        totalGb,
        availGb,
        inodeUsagePercent,
        inodesTotal: inodesTotal !== null ? Math.round(inodesTotal) : null,
        inodesFree: inodesFreeVal !== null ? Math.round(inodesFreeVal) : null,
      };
    })
    .filter((fs) => fs.mountpoint !== '')
    .sort((a, b) => (b.usagePercent ?? 0) - (a.usagePercent ?? 0));
}

/**
 * Parses per-core CPU idle metric into usage %.
 * node_exporter reports idle %, so we invert: usage = 100 - idle_rate * 100.
 */
export function buildCpuCores(data: PrometheusData | null): CpuCoreUsage[] {
  if (!data || data.resultType !== 'vector') return [];
  return data.result
    .map((result): CpuCoreUsage => ({
      cpu: result.metric.cpu ?? '?',
      usagePercent: roundMetric(
        valueAt(result) !== null ? 100 - (valueAt(result) as number) : null,
        1,
      ),
    }))
    .sort((a, b) => Number(a.cpu) - Number(b.cpu));
}

/**
 * Joins CPU and memory data by process group name.
 * Returns top processes sorted by CPU% descending.
 */
export function buildTopProcesses(
  cpuData: PrometheusData | null,
  memData: PrometheusData | null,
  countData: PrometheusData | null,
): TopProcess[] {
  if (!cpuData || cpuData.resultType !== 'vector') return [];

  return cpuData.result
    .map((cpuResult): TopProcess => {
      const name = cpuResult.metric.groupname ?? 'unknown';
      const cpuPercent = roundMetric(valueAt(cpuResult), 2);

      const memResult = memData?.resultType === 'vector'
        ? memData.result.find((r) => r.metric.groupname === name)
        : undefined;
      const countResult = countData?.resultType === 'vector'
        ? countData.result.find((r) => r.metric.groupname === name)
        : undefined;

      const memoryBytes = valueAt(memResult);
      const numProcs = valueAt(countResult);

      return {
        name,
        cpuPercent,
        memoryBytes: memoryBytes !== null ? Math.round(memoryBytes) : null,
        numProcs: numProcs !== null ? Math.round(numProcs) : null,
      };
    })
    .filter((p) => p.name !== 'unknown')
    .sort((a, b) => (b.cpuPercent ?? 0) - (a.cpuPercent ?? 0));
}

function normalizeTargetLabel(value: string | undefined) {
  if (!value) return '';
  return value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

function metricMatchesTarget(result: PrometheusVectorResult | PrometheusMatrixResult, target: string, aliases: string[] = []) {
  const expectedValues = [target, ...aliases]
    .map((value) => normalizeTargetLabel(value))
    .filter(Boolean);
  return Object.values(result.metric).some((value) => expectedValues.includes(normalizeTargetLabel(value)));
}

export function buildNetworkTarget(
  target: string,
  pingStatusData: PrometheusData | null,
  pingLatencyData: PrometheusData | null,
  metadata: Partial<NetworkTarget> = {},
): NetworkTarget {
  const aliases = [metadata.label].filter((value): value is string => Boolean(value));
  const statusResult = pingStatusData?.resultType === 'vector'
    ? pingStatusData.result.find((result) => metricMatchesTarget(result, target, aliases))
    : undefined;
  const latencyResult = pingLatencyData?.resultType === 'vector'
    ? pingLatencyData.result.find((result) => metricMatchesTarget(result, target, aliases))
    : undefined;

  const successValue = valueAt(statusResult);
  const latencyValue = valueAt(latencyResult);

  return {
    target,
    up: successValue === null ? null : successValue === 1,
    latencyMs: latencyValue === null ? null : roundMetric(latencyValue * 1000, 2),
    ...metadata,
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
  const additionalTargets = NETWORK_PING_TARGETS.map((target) => buildNetworkTarget(target.target, pingStatusData, pingLatencyData, {
    label: target.label,
    category: target.category,
    purpose: target.purpose,
  }));

  return {
    gateway,
    googleDns,
    cloudflareDns,
    additionalTargets,
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
  swapData: PrometheusData | null = null,
  diskReadData: PrometheusData | null = null,
  diskWriteData: PrometheusData | null = null,
  netRxData: PrometheusData | null = null,
  netTxData: PrometheusData | null = null,
): ServerRangePoint[] {
  const cpuValues = cpuData?.resultType === 'matrix' ? cpuData.result[0]?.values || [] : [];
  const ramValues = ramData?.resultType === 'matrix' ? ramData.result[0]?.values || [] : [];
  const loadValues = loadData?.resultType === 'matrix' ? loadData.result[0]?.values || [] : [];
  const swapValues = swapData?.resultType === 'matrix' ? swapData.result[0]?.values || [] : [];
  const diskReadValues = diskReadData?.resultType === 'matrix' ? diskReadData.result[0]?.values || [] : [];
  const diskWriteValues = diskWriteData?.resultType === 'matrix' ? diskWriteData.result[0]?.values || [] : [];
  const netRxValues = netRxData?.resultType === 'matrix' ? netRxData.result[0]?.values || [] : [];
  const netTxValues = netTxData?.resultType === 'matrix' ? netTxData.result[0]?.values || [] : [];

  return cpuValues.map(([timestamp, cpuRaw], index) => ({
    timestamp: timestamp * 1000,
    cpu: roundMetric(Number.parseFloat(cpuRaw), 2),
    ram: ramValues[index]?.[1] ? roundMetric(Number.parseFloat(ramValues[index][1]), 2) : null,
    load: loadValues[index]?.[1] ? roundMetric(Number.parseFloat(loadValues[index][1]), 2) : null,
    swap: swapValues[index]?.[1] ? roundMetric(Number.parseFloat(swapValues[index][1]), 2) : null,
    diskReadMBps: diskReadValues[index]?.[1]
      ? bytesToMBps(Number.parseFloat(diskReadValues[index][1]))
      : null,
    diskWriteMBps: diskWriteValues[index]?.[1]
      ? bytesToMBps(Number.parseFloat(diskWriteValues[index][1]))
      : null,
    netRxMBps: netRxValues[index]?.[1]
      ? bytesToMBps(Number.parseFloat(netRxValues[index][1]))
      : null,
    netTxMBps: netTxValues[index]?.[1]
      ? bytesToMBps(Number.parseFloat(netTxValues[index][1]))
      : null,
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
  const longest = [gateway, googleDns, cloudflareDns].reduce(
    (current, next) => next.length > current.length ? next : current,
    gateway,
  );

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
