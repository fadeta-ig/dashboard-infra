import { type NextRequest } from 'next/server';
import { prometheusSeriesQuery } from '@/lib/prometheus';
import { buildSnmpDiscovery, nowIso } from '@/lib/metrics';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';
import type { MikrotikDiscoveryResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const series = await prometheusSeriesQuery([
    '{job="snmp_if_mib"}',
    '{job="snmp_switch_ports"}',
    '{job="snmp_exporter_self"}',
    '{job="snmp_system"}',
  ]);
  const metrics = buildSnmpDiscovery(series);

  const response: MikrotikDiscoveryResponse = {
    message: metrics.length > 0
      ? 'SNMP metrics ditemukan dari Prometheus. Gunakan daftar ini untuk validasi fase 2.'
      : 'Belum ada sample SNMP series yang ditemukan. Pastikan scrape SNMP exporter berhasil.',
    metrics,
    totalSeries: series?.length || 0,
    timestamp: nowIso(),
  };

  return noStoreJson(response);
}