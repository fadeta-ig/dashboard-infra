import { NextResponse } from 'next/server';
import { prometheusRangeQuery } from '@/lib/prometheus';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rangeStr = searchParams.get('range') || '1h';
  
  let hours = 1;
  let step = '1m';
  if (rangeStr === '6h') { hours = 6; step = '5m'; }
  if (rangeStr === '24h') { hours = 24; step = '15m'; }

  const end = Math.floor(Date.now() / 1000);
  const start = end - (hours * 3600);

  try {
    const [cpuData, ramData, loadData] = await Promise.all([
      prometheusRangeQuery('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)', start, end, step),
      prometheusRangeQuery('100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))', start, end, step),
      prometheusRangeQuery('node_load1', start, end, step)
    ]);

    // Format for recharts
    const chartData = [];
    const cpuParsed = cpuData as any; // Using any briefly for complex deeply nested structures or we can cast appropriately.
    const ramParsed = ramData as any;
    const loadParsed = loadData as any;
    const timestamps = cpuParsed?.result?.[0]?.values?.map((v: [number, string]) => v[0]) || [];

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      chartData.push({
        timestamp: ts * 1000,
        cpu: cpuParsed?.result?.[0]?.values?.[i]?.[1] ? parseFloat(cpuParsed.result[0].values[i][1]) : 0,
        ram: ramParsed?.result?.[0]?.values?.[i]?.[1] ? parseFloat(ramParsed.result[0].values[i][1]) : 0,
        load: loadParsed?.result?.[0]?.values?.[i]?.[1] ? parseFloat(loadParsed.result[0].values[i][1]) : 0,
      });
    }

    return NextResponse.json(chartData);
  } catch (error) {
    console.error('Server Range API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
