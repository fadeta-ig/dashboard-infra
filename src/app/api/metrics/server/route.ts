import { type NextRequest } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';
import { buildServerMetrics, nowIso, PROMQL } from '@/lib/metrics';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const [cpuData, ramUsageData, ramAvailData, diskData, loadData] = await Promise.all([
    prometheusInstantQuery(PROMQL.cpuUsage),
    prometheusInstantQuery(PROMQL.ramUsage),
    prometheusInstantQuery(PROMQL.ramAvailableGb),
    prometheusInstantQuery(PROMQL.diskRootUsage),
    prometheusInstantQuery(PROMQL.load1),
  ]);

  return noStoreJson({
    ...buildServerMetrics(cpuData, ramUsageData, ramAvailData, diskData, loadData),
    timestamp: nowIso(),
  });
}
