import { prometheusInstantQuery } from '@/lib/prometheus';
import { nowIso, valueAt } from '@/lib/metrics';
import { UBUNTU_SERVICES } from '@/lib/monitoring-config';
import type { PrometheusData, PrometheusVectorResult } from '@/lib/types';

const SYSTEMD_STATES = 'active|failed|inactive|activating|deactivating';

export interface ServiceHealthSummary {
  key: string;
  label: string;
  matcher: string;
  required: boolean;
  unit: string | null;
  state: string | null;
  active: boolean | null;
  metricAvailable: boolean;
}

export interface ServiceHealthSnapshot {
  collector: string;
  collectorAvailable: boolean;
  matchedUnitCount: number;
  availableUnits: Array<{ unit: string; state: string }>;
  missingRequired: string[];
  services: ServiceHealthSummary[];
  timestamp: string;
}

function unitName(result: PrometheusVectorResult) {
  return result.metric.name || result.metric.unit || '';
}

function matchesService(result: PrometheusVectorResult, matcher: string) {
  return new RegExp(matcher).test(unitName(result));
}

function activeStateRows(data: PrometheusData | null) {
  if (!data || data.resultType !== 'vector') return [];
  return data.result.filter((result) => valueAt(result) === 1);
}

function findCurrentServiceState(rows: PrometheusVectorResult[], matcher: string) {
  return rows.find((result) => matchesService(result, matcher));
}

function collectAvailableUnits(rows: PrometheusVectorResult[]) {
  return rows
    .map((result) => ({
      unit: unitName(result),
      state: result.metric.state || 'unknown',
    }))
    .filter((item) => item.unit)
    .sort((left, right) => left.unit.localeCompare(right.unit));
}

function collectMatchedUnits(rows: PrometheusVectorResult[]) {
  return UBUNTU_SERVICES.flatMap((service) => {
    const match = findCurrentServiceState(rows, service.matcher);
    if (!match) return [];

    return [{
      unit: unitName(match),
      state: match.metric.state || 'unknown',
    }];
  }).sort((left, right) => left.unit.localeCompare(right.unit));
}

export async function getServiceHealthSnapshot(): Promise<ServiceHealthSnapshot> {
  const [collectorProbeData, serviceData] = await Promise.all([
    prometheusInstantQuery('node_systemd_unit_state'),
    prometheusInstantQuery(`node_systemd_unit_state{state=~"${SYSTEMD_STATES}"}`),
  ]);

  const collectorAvailable = Boolean(
    collectorProbeData && collectorProbeData.resultType === 'vector' && collectorProbeData.result.length > 0,
  );
  const currentRows = activeStateRows(serviceData);
  const availableUnits = collectAvailableUnits(currentRows);
  const matchedUnits = collectMatchedUnits(currentRows);

  const services = UBUNTU_SERVICES.map((service) => {
    const match = findCurrentServiceState(currentRows, service.matcher);
    const state = match?.metric.state || null;

    return {
      key: service.key,
      label: service.label,
      matcher: service.matcher,
      required: service.required,
      unit: match ? unitName(match) : null,
      state,
      active: state === null ? null : state === 'active',
      metricAvailable: Boolean(match),
    };
  });

  const visibleServices = services.filter((service) => service.required || service.metricAvailable);
  const missingRequired = services
    .filter((service) => service.required && !service.metricAvailable)
    .map((service) => service.label);

  return {
    collector: 'node_systemd_unit_state',
    collectorAvailable,
    matchedUnitCount: matchedUnits.length,
    availableUnits: availableUnits.slice(0, 30),
    missingRequired,
    services: visibleServices,
    timestamp: nowIso(),
  };
}
