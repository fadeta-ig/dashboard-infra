export type Status = 'healthy' | 'warning' | 'critical' | 'unknown';
export type InternetStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface PrometheusMetric {
  __name__?: string;
  job?: string;
  instance?: string;
  target?: string;
  [key: string]: string | undefined;
}

export interface PrometheusVectorResult {
  metric: PrometheusMetric;
  value: [number, string];
}

export interface PrometheusMatrixResult {
  metric: PrometheusMetric;
  values: [number, string][];
}

export interface PrometheusVectorData {
  resultType: 'vector';
  result: PrometheusVectorResult[];
}

export interface PrometheusMatrixData {
  resultType: 'matrix';
  result: PrometheusMatrixResult[];
}

export type PrometheusData = PrometheusVectorData | PrometheusMatrixData;

export interface TargetHealth {
  job: string;
  instance: string;
  up: boolean;
  value: number;
  lastChecked: string;
}

/** Core server snapshot — extended with all observability metrics */
export interface ServerMetrics {
  // ─── Core (existing) ───────────────────────────────────────────
  cpuUsage: number | null;
  ramUsage: number | null;
  ramAvailableGb: number | null;
  diskUsage: number | null;
  load1: number | null;
  status: Status;

  // ─── Uptime ────────────────────────────────────────────────────
  uptimeSeconds: number | null;

  // ─── Load Extended ─────────────────────────────────────────────
  load5: number | null;
  load15: number | null;

  // ─── CPU Detail ────────────────────────────────────────────────
  cpuCoreCount: number | null;

  // ─── Swap ──────────────────────────────────────────────────────
  swapUsagePercent: number | null;
  swapUsedGb: number | null;
  swapTotalGb: number | null;

  // ─── Disk I/O Throughput ───────────────────────────────────────
  diskReadBytesPerSec: number | null;
  diskWriteBytesPerSec: number | null;

  // ─── Network Server ────────────────────────────────────────────
  netRxBytesPerSec: number | null;
  netTxBytesPerSec: number | null;

  // ─── Reboot Required ───────────────────────────────────────────
  rebootRequired: boolean | null;
}

// ─── Filesystem per Mountpoint ──────────────────────────────────────────────

export interface FilesystemMount {
  mountpoint: string;
  device: string;
  fstype: string;
  usagePercent: number | null;
  usedGb: number | null;
  totalGb: number | null;
  availGb: number | null;
  /** null for vfat/fat32 which don't support inodes */
  inodeUsagePercent: number | null;
  inodesTotal: number | null;
  inodesFree: number | null;
}

// ─── CPU Per-Core ───────────────────────────────────────────────────────────

export interface CpuCoreUsage {
  cpu: string;
  usagePercent: number | null;
}

// ─── Top Processes (process_exporter) ───────────────────────────────────────

export interface TopProcess {
  name: string;
  cpuPercent: number | null;
  memoryBytes: number | null;
  numProcs: number | null;
}

// ─── Detail Response (heavy, polled every 60s) ──────────────────────────────

export interface ServerDetailResponse {
  filesystems: FilesystemMount[];
  cpuCores: CpuCoreUsage[];
  topProcesses: TopProcess[];
  processExporterAvailable: boolean;
  timestamp: string;
}

// ─── Network ────────────────────────────────────────────────────────────────

export interface NetworkTarget {
  target: string;
  up: boolean | null;
  latencyMs: number | null;
  label?: string;
  category?: string;
  purpose?: string;
}

export interface NetworkMetrics {
  gateway: NetworkTarget;
  googleDns: NetworkTarget;
  cloudflareDns: NetworkTarget;
  additionalTargets: NetworkTarget[];
  internetStatus: InternetStatus;
  timestamp: string;
}

// ─── Summary ────────────────────────────────────────────────────────────────

export interface SummaryResponse {
  status: Status;
  server: ServerMetrics;
  network: NetworkMetrics;
  targets: TargetHealth[];
  timestamp: string;
  queryHealth: Status;
}

// ─── Range Points ───────────────────────────────────────────────────────────

export interface ServerRangePoint {
  timestamp: number;
  cpu: number | null;
  ram: number | null;
  load: number | null;
  // Extended
  swap: number | null;
  diskReadMBps: number | null;
  diskWriteMBps: number | null;
  netRxMBps: number | null;
  netTxMBps: number | null;
}

export interface NetworkRangePoint {
  timestamp: number;
  [targetId: string]: number | null | undefined;
}

// ─── SNMP / MikroTik ────────────────────────────────────────────────────────

export interface SnmpMetricDiscovery {
  name: string;
  jobs: string[];
  instances: string[];
  sampleLabels: Record<string, string>;
}

export interface MikrotikDiscoveryResponse {
  message: string;
  metrics: SnmpMetricDiscovery[];
  totalSeries: number;
  timestamp: string;
}
