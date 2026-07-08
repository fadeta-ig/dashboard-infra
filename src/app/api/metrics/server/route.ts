import { NextResponse } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';

export const dynamic = 'force-dynamic';

import { PrometheusData } from '@/lib/types';

function extractSingleValue(data: unknown): number {
  const d = data as PrometheusData;
  if (d?.resultType === 'vector' && d.result.length > 0) {
    return parseFloat(d.result[0].value[1]);
  }
  return 0;
}

export async function GET() {
  try {
    const [cpuData, ramUsageData, ramAvailData, diskData, loadData] = await Promise.all([
      prometheusInstantQuery('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'),
      prometheusInstantQuery('100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))'),
      prometheusInstantQuery('node_memory_MemAvailable_bytes / 1024 / 1024 / 1024'),
      prometheusInstantQuery('100 * (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})'),
      prometheusInstantQuery('node_load1')
    ]);

    const cpuUsage = extractSingleValue(cpuData);
    const ramUsage = extractSingleValue(ramUsageData);
    const ramAvailableGb = extractSingleValue(ramAvailData);
    const diskUsage = extractSingleValue(diskData);
    const load1 = extractSingleValue(loadData);

    return NextResponse.json({
      cpuUsage,
      ramUsage,
      ramAvailableGb,
      diskUsage,
      load1,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Server API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
