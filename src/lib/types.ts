export interface PrometheusMetric {
  job?: string;
  instance?: string;
  target?: string;
  [key: string]: string | undefined;
}

export interface PrometheusResult {
  metric: PrometheusMetric;
  value: [number, string];
  values?: [number, string][];
}

export interface PrometheusData {
  resultType: string;
  result: PrometheusResult[];
}

export interface TargetHealth {
  job: string;
  instance: string;
  up: boolean;
  value: number;
}
