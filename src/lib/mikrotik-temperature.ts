import { roundMetric } from '@/lib/metrics';
import { prometheusInstantQuery, prometheusRangeQuery, prometheusSeriesQuery } from '@/lib/prometheus';

const MIKROTIK_INSTANCE = '192.168.20.1';
const BASE_MATCHER = `instance="${MIKROTIK_INSTANCE}"`;
const PREFERRED_METRICS = [
  'mikrotik_temperature_celsius',
  'mtxrHlTemperature',
  'mtxrHlTemp',
  'mtxrSystemTemperature',
  'mikrotikTemperature',
  'entPhySensorValue',
] as const;

interface TemperatureMetricChoice {
  metricName: string;
}

export interface MikrotikTemperatureSnapshot {
  temperatureCelsius: number | null;
  metricName: string | null;
  available: boolean;
}

function normalizeTemperatureValue(rawValue: number, metricName: string) {
  if (!Number.isFinite(rawValue)) return null;

  if (rawValue >= 0 && rawValue <= 120) {
    return roundMetric(rawValue, 2);
  }

  if (/entPhySensorValue/i.test(metricName)) {
    if (rawValue > 120 && rawValue <= 1200) return roundMetric(rawValue / 10, 2);
    if (rawValue > 1200 && rawValue <= 120000) return roundMetric(rawValue / 1000, 2);
  }

  if (rawValue > 120 && rawValue <= 1200) return roundMetric(rawValue / 10, 2);
  if (rawValue > 1200 && rawValue <= 120000) return roundMetric(rawValue / 1000, 2);

  return null;
}

async function discoverCandidateMetrics() {
  const series = await prometheusSeriesQuery([
    `{${BASE_MATCHER}}`,
  ]);

  const discovered = new Set<string>();
  for (const item of series || []) {
    const metricName = item.__name__;
    if (metricName && /temp|thermal/i.test(metricName)) {
      discovered.add(metricName);
    }
  }

  const preferred = PREFERRED_METRICS.filter((metric) => discovered.has(metric));
  const remaining = Array.from(discovered)
    .filter((metric) => !preferred.includes(metric as (typeof PREFERRED_METRICS)[number]))
    .sort();

  return [...preferred, ...remaining];
}

async function resolveTemperatureMetric(): Promise<TemperatureMetricChoice | null> {
  const candidates = await discoverCandidateMetrics();

  for (const metricName of candidates) {
    const instant = await prometheusInstantQuery(`max(${metricName}{${BASE_MATCHER}})`);
    if (!instant || instant.resultType !== 'vector' || instant.result.length === 0) continue;
    const rawValue = Number.parseFloat(instant.result[0].value[1]);
    const normalized = normalizeTemperatureValue(rawValue, metricName);
    if (normalized === null) continue;
    return { metricName };
  }

  return null;
}

export async function getMikrotikTemperatureSnapshot(): Promise<MikrotikTemperatureSnapshot> {
  const metric = await resolveTemperatureMetric();
  if (!metric) {
    return {
      temperatureCelsius: null,
      metricName: null,
      available: false,
    };
  }

  const instant = await prometheusInstantQuery(`max(${metric.metricName}{${BASE_MATCHER}})`);
  if (!instant || instant.resultType !== 'vector' || instant.result.length === 0) {
    return {
      temperatureCelsius: null,
      metricName: metric.metricName,
      available: false,
    };
  }

  const rawValue = Number.parseFloat(instant.result[0].value[1]);
  const normalized = normalizeTemperatureValue(rawValue, metric.metricName);
  return {
    temperatureCelsius: normalized,
    metricName: metric.metricName,
    available: normalized !== null,
  };
}

export async function getMikrotikTemperatureRange(start: number, end: number, step: string) {
  const metric = await resolveTemperatureMetric();
  if (!metric) {
    return {
      metricName: null,
      values: [] as number[],
    };
  }

  const range = await prometheusRangeQuery(`max(${metric.metricName}{${BASE_MATCHER}})`, start, end, step);
  if (!range || range.resultType !== 'matrix' || range.result.length === 0) {
    return {
      metricName: metric.metricName,
      values: [] as number[],
    };
  }

  const values = range.result[0].values
    .map(([, rawValue]) => normalizeTemperatureValue(Number.parseFloat(rawValue), metric.metricName))
    .filter((value): value is number => value !== null);

  return {
    metricName: metric.metricName,
    values,
  };
}
