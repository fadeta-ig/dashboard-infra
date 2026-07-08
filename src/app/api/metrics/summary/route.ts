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
    const [cpuData, ramUsageData, ramAvailData, diskData, loadData, targetsData, pingStatusData, pingLatencyData] = await Promise.all([
      prometheusInstantQuery('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'),
      prometheusInstantQuery('100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))'),
      prometheusInstantQuery('node_memory_MemAvailable_bytes / 1024 / 1024 / 1024'),
      prometheusInstantQuery('100 * (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})'),
      prometheusInstantQuery('node_load1'),
      prometheusInstantQuery('up'),
      prometheusInstantQuery('probe_success{job="blackbox_icmp"}'),
      prometheusInstantQuery('probe_duration_seconds{job="blackbox_icmp"}')
    ]);

    const cpuUsage = extractSingleValue(cpuData);
    const ramUsage = extractSingleValue(ramUsageData);
    const ramAvailableGb = extractSingleValue(ramAvailData);
    const diskUsage = extractSingleValue(diskData);
    const load1 = extractSingleValue(loadData);

    let serverStatus = 'healthy';
    if (cpuUsage > 85 || ramUsage > 85 || diskUsage > 90) serverStatus = 'critical';
    else if (cpuUsage >= 70 || ramUsage >= 75 || diskUsage >= 80) serverStatus = 'warning';

    // Parse network
    const parsePing = (targetIp: string) => {
      const pingStatus = pingStatusData as PrometheusData;
      const pingLatency = pingLatencyData as PrometheusData;
      const statusMatch = pingStatus?.result?.find((r) => r.metric.instance === targetIp || r.metric.target === targetIp);
      const latencyMatch = pingLatency?.result?.find((r) => r.metric.instance === targetIp || r.metric.target === targetIp);
      return {
        target: targetIp,
        up: statusMatch ? parseFloat(statusMatch.value[1]) === 1 : false,
        latencyMs: latencyMatch ? parseFloat(latencyMatch.value[1]) * 1000 : 0
      };
    };

    const gateway = parsePing('192.168.20.1');
    const googleDns = parsePing('8.8.8.8');
    const cloudflareDns = parsePing('1.1.1.1');

    let internetStatus = 'healthy';
    if (!gateway.up || (!googleDns.up && !cloudflareDns.up)) internetStatus = 'critical';
    else if (gateway.up && (!googleDns.up || !cloudflareDns.up)) internetStatus = 'degraded';

    const targetsDataParsed = targetsData as PrometheusData;
    const targets = targetsDataParsed?.result?.map((r) => ({
      job: r.metric.job || '',
      instance: r.metric.instance || '',
      up: parseFloat(r.value[1]) === 1,
      value: parseFloat(r.value[1])
    })) || [];

    const hasCriticalTarget = targets.some((t) => !t.up);
    let overallStatus = serverStatus;
    if (internetStatus === 'critical' || hasCriticalTarget) overallStatus = 'critical';
    else if (internetStatus === 'degraded' && overallStatus !== 'critical') overallStatus = 'warning';

    return NextResponse.json({
      status: overallStatus,
      server: { cpuUsage, ramUsage, ramAvailableGb, diskUsage, load1, status: serverStatus },
      network: { gateway, googleDns, cloudflareDns, internetStatus },
      targets,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Summary API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', status: 'unknown' }, { status: 500 });
  }
}
