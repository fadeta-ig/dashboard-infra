import { type NextRequest } from 'next/server';
import { prometheusRangeQuery } from '@/lib/prometheus';
import { alignServerRange, parseRange, PROMQL } from '@/lib/metrics';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const { hours, step, range } = parseRange(searchParams.get('range'));
  const end = Math.floor(Date.now() / 1000);
  const start = end - hours * 3600;

  const [
    cpuData,
    ramData,
    loadData,
    swapData,
    diskReadData,
    diskWriteData,
    netRxData,
    netTxData,
  ] = await Promise.all([
    prometheusRangeQuery(PROMQL.cpuUsage, start, end, step),
    prometheusRangeQuery(PROMQL.ramUsage, start, end, step),
    prometheusRangeQuery(PROMQL.load1, start, end, step),
    prometheusRangeQuery(PROMQL.swapUsagePercent, start, end, step),
    prometheusRangeQuery(PROMQL.diskReadBytesPerSec, start, end, step),
    prometheusRangeQuery(PROMQL.diskWriteBytesPerSec, start, end, step),
    prometheusRangeQuery(PROMQL.netRxBytesPerSec, start, end, step),
    prometheusRangeQuery(PROMQL.netTxBytesPerSec, start, end, step),
  ]);

  return noStoreJson({
    range,
    points: alignServerRange(cpuData, ramData, loadData, swapData, diskReadData, diskWriteData, netRxData, netTxData),
  });
}
