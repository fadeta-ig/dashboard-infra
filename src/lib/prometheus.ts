import type { PrometheusData, PrometheusMetric } from '@/lib/types';

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://127.0.0.1:9090';
const TIMEOUT_MS = 5000;

interface PrometheusApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  errorType?: string;
  error?: string;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isPrometheusData(value: unknown): value is PrometheusData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { resultType?: unknown; result?: unknown };
  return (
    (candidate.resultType === 'vector' || candidate.resultType === 'matrix') &&
    Array.isArray(candidate.result)
  );
}

function normalizePrometheusUrl() {
  return PROMETHEUS_URL.replace(/\/$/, '');
}

async function fetchPrometheusData<T>(url: URL, validator: (value: unknown) => value is T): Promise<T | null> {
  try {
    const response = await fetchWithTimeout(url.toString());

    if (!response.ok) {
      throw new Error(`Prometheus API returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as PrometheusApiResponse<T>;

    if (payload.status !== 'success' || !validator(payload.data)) {
      throw new Error(payload.errorType || 'Invalid Prometheus response');
    }

    return payload.data;
  } catch (error) {
    console.error('Prometheus request failed:', error);
    return null;
  }
}

export async function prometheusInstantQuery(query: string): Promise<PrometheusData | null> {
  const url = new URL(`${normalizePrometheusUrl()}/api/v1/query`);
  url.searchParams.set('query', query);
  return fetchPrometheusData(url, isPrometheusData);
}

export async function prometheusRangeQuery(
  query: string,
  start: number,
  end: number,
  step: string,
): Promise<PrometheusData | null> {
  const url = new URL(`${normalizePrometheusUrl()}/api/v1/query_range`);
  url.searchParams.set('query', query);
  url.searchParams.set('start', String(start));
  url.searchParams.set('end', String(end));
  url.searchParams.set('step', step);
  return fetchPrometheusData(url, isPrometheusData);
}

function isMetricSeries(value: unknown): value is PrometheusMetric[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === 'object');
}

export async function prometheusSeriesQuery(matchers: string[]): Promise<PrometheusMetric[] | null> {
  const url = new URL(`${normalizePrometheusUrl()}/api/v1/series`);
  for (const matcher of matchers) {
    url.searchParams.append('match[]', matcher);
  }
  return fetchPrometheusData(url, isMetricSeries);
}
