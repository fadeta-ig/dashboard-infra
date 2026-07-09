import { type NextRequest } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';
import { buildServerMetrics, nowIso, PROMQL } from '@/lib/metrics';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const [
    cpuData,
    ramUsageData,
    ramAvailData,
    diskData,
    loadData,
    uptimeData,
    load5Data,
    load15Data,
    cpuCoreCountData,
    swapUsageData,
    swapUsedGbData,
    swapTotalGbData,
    diskReadData,
    diskWriteData,
    netRxData,
    netTxData,
    rebootData,
  ] = await Promise.all([
    prometheusInstantQuery(PROMQL.cpuUsage),
    prometheusInstantQuery(PROMQL.ramUsage),
    prometheusInstantQuery(PROMQL.ramAvailableGb),
    prometheusInstantQuery(PROMQL.diskRootUsage),
    prometheusInstantQuery(PROMQL.load1),
    prometheusInstantQuery(PROMQL.uptimeSeconds),
    prometheusInstantQuery(PROMQL.load5),
    prometheusInstantQuery(PROMQL.load15),
    prometheusInstantQuery(PROMQL.cpuCoreCount),
    prometheusInstantQuery(PROMQL.swapUsagePercent),
    prometheusInstantQuery(PROMQL.swapUsedGb),
    prometheusInstantQuery(PROMQL.swapTotalGb),
    prometheusInstantQuery(PROMQL.diskReadBytesPerSec),
    prometheusInstantQuery(PROMQL.diskWriteBytesPerSec),
    prometheusInstantQuery(PROMQL.netRxBytesPerSec),
    prometheusInstantQuery(PROMQL.netTxBytesPerSec),
    prometheusInstantQuery(PROMQL.rebootRequired),
  ]);

  return noStoreJson({
    ...buildServerMetrics(
      cpuData, ramUsageData, ramAvailData, diskData, loadData,
      uptimeData, load5Data, load15Data, cpuCoreCountData,
      swapUsageData, swapUsedGbData, swapTotalGbData,
      diskReadData, diskWriteData, netRxData, netTxData,
      rebootData,
    ),
    timestamp: nowIso(),
  });
}
