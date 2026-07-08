import { NextResponse } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [pingStatusData, pingLatencyData] = await Promise.all([
      prometheusInstantQuery('probe_success{job="blackbox_icmp"}'),
      prometheusInstantQuery('probe_duration_seconds{job="blackbox_icmp"}')
    ]);

    const parsePing = (targetIp: string) => {
      const statusMatch = pingStatusData?.result?.find((r: any) => r.metric.instance === targetIp || r.metric.target === targetIp);
      const latencyMatch = pingLatencyData?.result?.find((r: any) => r.metric.instance === targetIp || r.metric.target === targetIp);
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

    return NextResponse.json({
      gateway,
      googleDns,
      cloudflareDns,
      internetStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Network API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
