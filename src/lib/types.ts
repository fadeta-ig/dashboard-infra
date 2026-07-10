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

export interface ServerMetrics {
  cpuUsage: number | null;
  ramUsage: number | null;
  ramAvailableGb: number | null;
  diskUsage: number | null;
  load1: number | null;
  status: Status;
  uptimeSeconds: number | null;
  load5: number | null;
  load15: number | null;
  cpuCoreCount: number | null;
  swapUsagePercent: number | null;
  swapUsedGb: number | null;
  swapTotalGb: number | null;
  diskReadBytesPerSec: number | null;
  diskWriteBytesPerSec: number | null;
  netRxBytesPerSec: number | null;
  netTxBytesPerSec: number | null;
  rebootRequired: boolean | null;
  temperatureCelsius: number | null;
  temperatureSource: string | null;
}

export interface FilesystemMount {
  mountpoint: string;
  device: string;
  fstype: string;
  usagePercent: number | null;
  usedGb: number | null;
  totalGb: number | null;
  availGb: number | null;
  inodeUsagePercent: number | null;
  inodesTotal: number | null;
  inodesFree: number | null;
}

export interface CpuCoreUsage {
  cpu: string;
  usagePercent: number | null;
}

export interface TopProcess {
  name: string;
  cpuPercent: number | null;
  memoryBytes: number | null;
  numProcs: number | null;
}

export interface TemperatureSensor {
  sensor: string;
  chip: string | null;
  label: string | null;
  temperatureCelsius: number | null;
}

export interface ServerDetailResponse {
  filesystems: FilesystemMount[];
  cpuCores: CpuCoreUsage[];
  topProcesses: TopProcess[];
  processExporterAvailable: boolean;
  temperatureSensors: TemperatureSensor[];
  temperatureAvailable: boolean;
  timestamp: string;
}

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

export interface SummaryResponse {
  status: Status;
  server: ServerMetrics;
  network: NetworkMetrics;
  targets: TargetHealth[];
  timestamp: string;
  queryHealth: Status;
}

export interface ServerRangePoint {
  timestamp: number;
  cpu: number | null;
  ram: number | null;
  load: number | null;
  swap: number | null;
  diskReadMBps: number | null;
  diskWriteMBps: number | null;
  netRxMBps: number | null;
  netTxMBps: number | null;
  temperatureCelsius: number | null;
}

export interface NetworkRangePoint {
  timestamp: number;
  [targetId: string]: number | null | undefined;
}

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
