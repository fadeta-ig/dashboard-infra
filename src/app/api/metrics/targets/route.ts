import { type NextRequest } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';
import { buildTargets, nowIso, PROMQL } from '@/lib/metrics';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const timestamp = nowIso();
  const targetsData = await prometheusInstantQuery(PROMQL.up);

  return noStoreJson({
    targets: buildTargets(targetsData, timestamp),
    timestamp,
  });
}
