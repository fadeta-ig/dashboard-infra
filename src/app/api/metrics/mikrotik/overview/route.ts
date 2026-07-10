import { type NextRequest } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';
import { metricMatchesTarget, NETWORK_TARGETS, nowIso, roundMetric, valueAt } from '@/lib/metrics';
import { MIKROTIK_INTERFACES, type InterfaceRole } from '@/lib/monitoring-config';
import { getMikrotikTemperatureSnapshot } from '@/lib/mikrotik-temperature';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';
import type { PrometheusData, PrometheusVectorResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface InterfaceTraffic {
  name: string;
  displayName: string;
  role: InterfaceRole;
  comment?: string;
  isp?: 'ISP 1' | 'ISP 2';
  instance: string;
  expectedUp: boolean;
  operationalStatus: 'up' | 'down' | 'unknown';
  downloadMbps: number | null;
  uploadMbps: number | null;
  downloadCapacityMbps: number | null;
  uploadCapacityMbps: number | null;
  downloadUtilizationPercent: number | null;
  uploadUtilizationPercent: number | null;
  errors5m: number | null;
  discards5m: number | null;
  metricAvailable: boolean;
  includeInWanTotal: boolean;
}

const SNMP_INTERFACE_SELECTOR = 'job="snmp_if_mib",instance="192.168.20.1"';

function findGatewayValue(data: PrometheusData | null) {
  if (!data || data.resultType !== 'vector') return null;
  const match = data.result.find((result) => metricMatchesTarget(result, NETWORK_TARGETS.gateway));
  return valueAt(match);
}

function interfaceName(result: PrometheusVectorResult) {
  return result.metric.ifName || result.metric.ifDescr || result.metric.ifAlias || result.metric.ifIndex || 'unknown-interface';
}

function normalizeInterfaceName(name: string) {
  return name.trim().toLowerCase();
}

function findResultByInterface(data: PrometheusData | null, name: string) {
  if (!data || data.resultType !== 'vector') return undefined;
  const normalized = normalizeInterfaceName(name);
  return data.result.find((result) => normalizeInterfaceName(interfaceName(result)) === normalized);
}

function utilization(value: number | null, capacity: number | undefined) {
  if (value === null || !capacity || capacity <= 0) return null;
  return roundMetric((value / capacity) * 100, 2);
}

function operStatusFromValue(value: number | null): 'up' | 'down' | 'unknown' {
  if (value === null) return 'unknown';
  return value === 1 ? 'up' : 'down';
}

function metricAvailable(data: PrometheusData | null) {
  return data?.resultType === 'vector' && data.result.length > 0;
}

function buildConfiguredInterfaces(
  downloadData: PrometheusData | null,
  uploadData: PrometheusData | null,
  operStatusData: PrometheusData | null,
  errorsData: PrometheusData | null,
  discardsData: PrometheusData | null,
): InterfaceTraffic[] {
  return MIKROTIK_INTERFACES.map((config) => {
    const downloadResult = findResultByInterface(downloadData, config.name);
    const uploadResult = findResultByInterface(uploadData, config.name);
    const operStatusResult = findResultByInterface(operStatusData, config.name);
    const errorsResult = findResultByInterface(errorsData, config.name);
    const discardsResult = findResultByInterface(discardsData, config.name);
    const downloadMbps = roundMetric(valueAt(downloadResult), 2);
    const uploadMbps = roundMetric(valueAt(uploadResult), 2);
    const operationalStatus = operStatusFromValue(valueAt(operStatusResult));

    return {
      name: config.name,
      displayName: config.displayName,
      role: config.role,
      comment: config.comment,
      isp: config.isp,
      instance: downloadResult?.metric.instance || uploadResult?.metric.instance || operStatusResult?.metric.instance || NETWORK_TARGETS.gateway,
      expectedUp: config.expectedUp,
      operationalStatus,
      downloadMbps,
      uploadMbps,
      downloadCapacityMbps: config.downloadCapacityMbps || null,
      uploadCapacityMbps: config.uploadCapacityMbps || null,
      downloadUtilizationPercent: utilization(downloadMbps, config.downloadCapacityMbps),
      uploadUtilizationPercent: utilization(uploadMbps, config.uploadCapacityMbps),
      errors5m: roundMetric(valueAt(errorsResult), 0),
      discards5m: roundMetric(valueAt(discardsResult), 0),
      metricAvailable: Boolean(downloadResult || uploadResult || operStatusResult || errorsResult || discardsResult),
      includeInWanTotal: config.includeInWanTotal ?? (config.role === 'wan'),
    };
  });
}

function uptimeFromSysUpTime(data: PrometheusData | null) {
  const rawValue = data && data.resultType === 'vector' ? valueAt(data.result[0]) : null;
  if (rawValue === null) return null;
  return roundMetric(rawValue / 100, 0);
}

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const [downloadData, uploadData, operStatusData, errorsData, discardsData, uptimeData, pingData, jitterData, lossData, temperature] = await Promise.all([
    prometheusInstantQuery(`rate(ifHCInOctets{${SNMP_INTERFACE_SELECTOR}}[5m]) * 8 / 1000000`),
    prometheusInstantQuery(`rate(ifHCOutOctets{${SNMP_INTERFACE_SELECTOR}}[5m]) * 8 / 1000000`),
    prometheusInstantQuery(`ifOperStatus{${SNMP_INTERFACE_SELECTOR}}`),
    prometheusInstantQuery(`increase(ifInErrors{${SNMP_INTERFACE_SELECTOR}}[5m]) + increase(ifOutErrors{${SNMP_INTERFACE_SELECTOR}}[5m])`),
    prometheusInstantQuery(`increase(ifInDiscards{${SNMP_INTERFACE_SELECTOR}}[5m]) + increase(ifOutDiscards{${SNMP_INTERFACE_SELECTOR}}[5m])`),
    prometheusInstantQuery('sysUpTime{job="snmp_system",instance="192.168.20.1"}'),
    prometheusInstantQuery('probe_duration_seconds{job="blackbox_icmp"} * 1000'),
    prometheusInstantQuery('stddev_over_time(probe_duration_seconds{job="blackbox_icmp"}[5m]) * 1000'),
    prometheusInstantQuery('(1 - avg_over_time(probe_success{job="blackbox_icmp"}[5m])) * 100'),
    getMikrotikTemperatureSnapshot(),
  ]);

  const interfaces = buildConfiguredInterfaces(downloadData, uploadData, operStatusData, errorsData, discardsData);
  const wanInterfaces = interfaces.filter((item) => item.role === 'wan' && item.includeInWanTotal);
  const liveInterfaces = interfaces.filter((item) => item.metricAvailable);
  const totalDownloadMbps = roundMetric(
    wanInterfaces.reduce((total, item) => total + (item.downloadMbps || 0), 0),
    2,
  );
  const totalUploadMbps = roundMetric(
    wanInterfaces.reduce((total, item) => total + (item.uploadMbps || 0), 0),
    2,
  );
  const totalErrors5m = roundMetric(interfaces.reduce((total, item) => total + (item.errors5m || 0), 0), 0);
  const totalDiscards5m = roundMetric(interfaces.reduce((total, item) => total + (item.discards5m || 0), 0), 0);
  const totalDownloadCapacityMbps = wanInterfaces.reduce((total, item) => total + (item.downloadCapacityMbps || 0), 0);
  const totalUploadCapacityMbps = wanInterfaces.reduce((total, item) => total + (item.uploadCapacityMbps || 0), 0);
  const missingRequiredMetrics = [
    { metric: 'ifHCInOctets', available: metricAvailable(downloadData) },
    { metric: 'ifHCOutOctets', available: metricAvailable(uploadData) },
    { metric: 'ifOperStatus', available: metricAvailable(operStatusData) },
    { metric: 'ifInErrors/ifOutErrors', available: metricAvailable(errorsData) },
    { metric: 'ifInDiscards/ifOutDiscards', available: metricAvailable(discardsData) },
    { metric: 'sysUpTime', available: metricAvailable(uptimeData) },
  ].filter((item) => !item.available).map((item) => item.metric);

  return noStoreJson({
    gateway: NETWORK_TARGETS.gateway,
    routerUptimeSeconds: uptimeFromSysUpTime(uptimeData),
    totalDownloadMbps: liveInterfaces.length > 0 ? totalDownloadMbps : null,
    totalUploadMbps: liveInterfaces.length > 0 ? totalUploadMbps : null,
    totalDownloadCapacityMbps,
    totalUploadCapacityMbps,
    totalDownloadUtilizationPercent: liveInterfaces.length > 0 ? utilization(totalDownloadMbps, totalDownloadCapacityMbps) : null,
    totalUploadUtilizationPercent: liveInterfaces.length > 0 ? utilization(totalUploadMbps, totalUploadCapacityMbps) : null,
    totalErrors5m: liveInterfaces.length > 0 ? totalErrors5m : null,
    totalDiscards5m: liveInterfaces.length > 0 ? totalDiscards5m : null,
    temperatureCelsius: temperature.temperatureCelsius,
    temperatureMetric: temperature.metricName,
    temperatureAvailable: temperature.available,
    pingMs: roundMetric(findGatewayValue(pingData), 2),
    jitterMs: roundMetric(findGatewayValue(jitterData), 2),
    packetLossPercent: roundMetric(findGatewayValue(lossData), 2),
    interfaces,
    configuredInterfaceCount: interfaces.length,
    liveInterfaceMetricCount: liveInterfaces.length,
    missingRequiredMetrics,
    timestamp: nowIso(),
  });
}
