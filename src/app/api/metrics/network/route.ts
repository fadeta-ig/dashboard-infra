import { type NextRequest } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';
import { buildNetworkMetrics, PROMQL } from '@/lib/metrics';
import { getNetworkPingTargetConfigs } from '@/lib/config-store';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const [pingStatusData, pingLatencyData, pingTargets] = await Promise.all([
    prometheusInstantQuery(PROMQL.pingSuccess),
    prometheusInstantQuery(PROMQL.pingLatency),
    getNetworkPingTargetConfigs(),
  ]);

  return noStoreJson(buildNetworkMetrics(pingStatusData, pingLatencyData, undefined, pingTargets));
}
