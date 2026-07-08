import { type NextRequest } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';
import { NETWORK_TARGETS, nowIso, roundMetric, valueAt } from '@/lib/metrics';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';
import type { PrometheusData, PrometheusVectorResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface InterfaceTraffic {
  name: string;
  instance: string;
  downloadMbps: number | null;
  uploadMbps: number | null;
}

function findGatewayValue(data: PrometheusData | null) {
  if (!data || data.resultType !== 'vector') return null;
  const match = data.result.find((result) => (
    result.metric.instance === NETWORK_TARGETS.gateway || result.metric.target === NETWORK_TARGETS.gateway
  ));
  return valueAt(match);
}

function interfaceName(result: PrometheusVectorResult) {
  return result.metric.ifName || result.metric.ifDescr || result.metric.ifIndex || 'unknown-interface';
}

function interfaceKey(result: PrometheusVectorResult) {
  return `${result.metric.instance || 'unknown'}:${interfaceName(result)}`;
}

function buildInterfaces(downloadData: PrometheusData | null, uploadData: PrometheusData | null): InterfaceTraffic[] {
  const interfaces = new Map<string, InterfaceTraffic>();

  if (downloadData?.resultType === 'vector') {
    for (const result of downloadData.result) {
      const key = interfaceKey(result);
      interfaces.set(key, {
        name: interfaceName(result),
        instance: result.metric.instance || 'unknown',
        downloadMbps: roundMetric(valueAt(result), 2),
        uploadMbps: null,
      });
    }
  }

  if (uploadData?.resultType === 'vector') {
    for (const result of uploadData.result) {
      const key = interfaceKey(result);
      const existing = interfaces.get(key) || {
        name: interfaceName(result),
        instance: result.metric.instance || 'unknown',
        downloadMbps: null,
        uploadMbps: null,
      };
      existing.uploadMbps = roundMetric(valueAt(result), 2);
      interfaces.set(key, existing);
    }
  }

  return Array.from(interfaces.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const [downloadData, uploadData, pingData, jitterData, lossData] = await Promise.all([
    prometheusInstantQuery('rate(ifHCInOctets{job=~"snmp_if_mib|snmp_switch_ports",instance="192.168.20.1"}[5m]) * 8 / 1000000'),
    prometheusInstantQuery('rate(ifHCOutOctets{job=~"snmp_if_mib|snmp_switch_ports",instance="192.168.20.1"}[5m]) * 8 / 1000000'),
    prometheusInstantQuery('probe_duration_seconds{job="blackbox_icmp"} * 1000'),
    prometheusInstantQuery('stddev_over_time(probe_duration_seconds{job="blackbox_icmp"}[5m]) * 1000'),
    prometheusInstantQuery('(1 - avg_over_time(probe_success{job="blackbox_icmp"}[5m])) * 100'),
  ]);

  const interfaces = buildInterfaces(downloadData, uploadData);
  const totalDownloadMbps = roundMetric(
    interfaces.reduce((total, item) => total + (item.downloadMbps || 0), 0),
    2,
  );
  const totalUploadMbps = roundMetric(
    interfaces.reduce((total, item) => total + (item.uploadMbps || 0), 0),
    2,
  );

  return noStoreJson({
    gateway: NETWORK_TARGETS.gateway,
    totalDownloadMbps: interfaces.length > 0 ? totalDownloadMbps : null,
    totalUploadMbps: interfaces.length > 0 ? totalUploadMbps : null,
    pingMs: roundMetric(findGatewayValue(pingData), 2),
    jitterMs: roundMetric(findGatewayValue(jitterData), 2),
    packetLossPercent: roundMetric(findGatewayValue(lossData), 2),
    interfaces,
    timestamp: nowIso(),
  });
}
