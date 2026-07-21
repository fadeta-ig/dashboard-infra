import { type NextRequest } from 'next/server';
import { getActiveMaintenanceWindows, getNetworkPingTargetConfigs, getSlaPolicyConfigs } from '@/lib/config-store';
import { listIncidentsPage } from '@/lib/history';
import { buildNetworkMetrics, nowIso, PROMQL } from '@/lib/metrics';
import { prometheusInstantQuery } from '@/lib/prometheus';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const timestamp = nowIso();
  const [pingStatusData, pingLatencyData, pingTargets, slaPolicies, maintenanceWindows, incidentResult] = await Promise.all([
    prometheusInstantQuery(PROMQL.pingSuccess),
    prometheusInstantQuery(PROMQL.pingLatency),
    getNetworkPingTargetConfigs(),
    getSlaPolicyConfigs(),
    getActiveMaintenanceWindows(timestamp),
    listIncidentsPage({ page: 1, pageSize: 10, status: 'open', sort: 'severity', direction: 'desc' }),
  ]);

  const network = buildNetworkMetrics(pingStatusData, pingLatencyData, timestamp, pingTargets);
  const targets = network.additionalTargets;
  const categories = Array.from(new Set(targets.map((target) => target.category || 'network'))).sort();
  const categoryHealth = categories.map((category) => {
    const items = targets.filter((target) => (target.category || 'network') === category);
    const down = items.filter((target) => target.up === false).length;
    const unknown = items.filter((target) => target.up === null).length;
    const up = items.filter((target) => target.up === true).length;
    const latencyValues = items.map((target) => target.latencyMs).filter((value): value is number => value !== null);
    const avgLatencyMs = latencyValues.length > 0
      ? Math.round((latencyValues.reduce((total, value) => total + value, 0) / latencyValues.length) * 100) / 100
      : null;
    const policy = slaPolicies.find((item) => item.category === category);

    return {
      category,
      label: policy?.label || category,
      status: down > 0 ? 'critical' : unknown > 0 ? 'warning' : 'healthy',
      total: items.length,
      up,
      down,
      unknown,
      avgLatencyMs,
      sla: policy || null,
    };
  });

  return noStoreJson({
    ok: true,
    timestamp,
    internetStatus: network.internetStatus,
    categories: categoryHealth,
    openIncidents: incidentResult.incidents,
    maintenanceWindows,
  });
}
