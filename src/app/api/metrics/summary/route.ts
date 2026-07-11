import { type NextRequest } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';
import {
  buildNetworkMetrics,
  buildServerMetrics,
  buildTargets,
  combineQueryHealth,
  combineStatus,
  PROMQL,
  nowIso,
} from '@/lib/metrics';
import { getNetworkPingTargetConfigs } from '@/lib/config-store';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';
import type { SummaryResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const timestamp = nowIso();
  const [cpuData, ramUsageData, ramAvailData, diskData, loadData, targetsData, pingStatusData, pingLatencyData, hwmonTemperatureData, thermalZoneTemperatureData, pingTargets] = await Promise.all([
    prometheusInstantQuery(PROMQL.cpuUsage),
    prometheusInstantQuery(PROMQL.ramUsage),
    prometheusInstantQuery(PROMQL.ramAvailableGb),
    prometheusInstantQuery(PROMQL.diskRootUsage),
    prometheusInstantQuery(PROMQL.load1),
    prometheusInstantQuery(PROMQL.up),
    prometheusInstantQuery(PROMQL.pingSuccess),
    prometheusInstantQuery(PROMQL.pingLatency),
    prometheusInstantQuery(PROMQL.hwmonTemperature),
    prometheusInstantQuery(PROMQL.thermalZoneTemperature),
    getNetworkPingTargetConfigs(),
  ]);

  const server = buildServerMetrics(
    cpuData, ramUsageData, ramAvailData, diskData, loadData,
    null, null, null, null, null, null, null, null, null, null, null, null,
    hwmonTemperatureData, thermalZoneTemperatureData,
  );
  const network = buildNetworkMetrics(pingStatusData, pingLatencyData, timestamp, pingTargets);
  const targets = buildTargets(targetsData, timestamp);
  const queryHealth = combineQueryHealth(
    cpuData,
    ramUsageData,
    ramAvailData,
    diskData,
    loadData,
    targetsData,
    pingStatusData,
    pingLatencyData,
  );

  const response: SummaryResponse = {
    status: queryHealth === 'unknown' ? 'unknown' : combineStatus(server.status, network.internetStatus, targets),
    server,
    network,
    targets,
    timestamp,
    queryHealth,
  };

  return noStoreJson(response);
}
