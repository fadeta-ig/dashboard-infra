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
}

export interface NetworkRangePoint {
  timestamp: number;
  gateway: number | null;
  googleDns: number | null;
  cloudflareDns: number | null;
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
