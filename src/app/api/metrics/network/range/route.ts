import { type NextRequest } from 'next/server';
import { prometheusRangeQuery } from '@/lib/prometheus';
import { alignNetworkRange, parseRange, PROMQL } from '@/lib/metrics';
import { getNetworkPingTargetConfigs } from '@/lib/config-store';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const { hours, step, range } = parseRange(searchParams.get('range'));
  const end = Math.floor(Date.now() / 1000);
  const start = end - hours * 3600;
  const [latencyData, pingTargets] = await Promise.all([
    prometheusRangeQuery(PROMQL.pingLatency, start, end, step),
    getNetworkPingTargetConfigs(),
  ]);

  return noStoreJson({
    range,
    points: alignNetworkRange(latencyData, pingTargets),
  });
}
