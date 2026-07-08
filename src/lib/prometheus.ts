const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://127.0.0.1:9090';
const TIMEOUT_MS = 5000;

/**
 * Helper to fetch data with a timeout.
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store', // Always fetch fresh data from Prometheus
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * Execute an instant query against Prometheus.
 */
export async function prometheusInstantQuery(query: string) {
  try {
    const url = new URL(`${PROMETHEUS_URL}/api/v1/query`);
    url.searchParams.append('query', query);

    const response = await fetchWithTimeout(url.toString());
    
    if (!response.ok) {
      throw new Error(`Prometheus API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Prometheus instant query failed:', error);
    return null;
  }
}

/**
 * Execute a range query against Prometheus.
 */
export async function prometheusRangeQuery(query: string, start: number, end: number, step: string) {
  try {
    const url = new URL(`${PROMETHEUS_URL}/api/v1/query_range`);
    url.searchParams.append('query', query);
    url.searchParams.append('start', start.toString());
    url.searchParams.append('end', end.toString());
    url.searchParams.append('step', step);

    const response = await fetchWithTimeout(url.toString());
    
    if (!response.ok) {
      throw new Error(`Prometheus API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Prometheus range query failed:', error);
    return null;
  }
}
