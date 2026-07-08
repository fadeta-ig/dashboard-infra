import { type NextRequest } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';
import { nowIso, valueAt } from '@/lib/metrics';
import { UBUNTU_SERVICES } from '@/lib/monitoring-config';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';
import type { PrometheusData, PrometheusVectorResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

function matchesService(result: PrometheusVectorResult, matcher: string) {
  const name = result.metric.name || result.metric.unit || '';
  return new RegExp(matcher).test(name);
}

function findCurrentServiceState(data: PrometheusData | null, matcher: string) {
  if (!data || data.resultType !== 'vector') return undefined;
  return data.result.find((result) => matchesService(result, matcher) && valueAt(result) === 1);
}

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const serviceRegex = UBUNTU_SERVICES.map((service) => `(${service.matcher})`).join('|');
  const serviceData = await prometheusInstantQuery(`node_systemd_unit_state{state=~"active|failed|inactive|activating|deactivating",name=~"${serviceRegex}"}`);
  const collectorAvailable = Boolean(serviceData && serviceData.resultType === 'vector' && serviceData.result.length > 0);

  const services = UBUNTU_SERVICES.map((service) => {
    const match = findCurrentServiceState(serviceData, service.matcher);
    const state = match?.metric.state || null;

    return {
      key: service.key,
      label: service.label,
      matcher: service.matcher,
      required: service.required,
      unit: match?.metric.name || match?.metric.unit || null,
      state,
      active: state === null ? null : state === 'active',
      metricAvailable: Boolean(match),
    };
  });

  return noStoreJson({
    collector: 'node_systemd_unit_state',
    collectorAvailable,
    services,
    timestamp: nowIso(),
  });
}