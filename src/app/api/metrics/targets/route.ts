import { NextResponse } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const targetsData = await prometheusInstantQuery('up');

    const targets = targetsData?.result?.map((r: any) => ({
      job: r.metric.job,
      instance: r.metric.instance,
      up: parseFloat(r.value[1]) === 1,
      value: parseFloat(r.value[1])
    })) || [];

    return NextResponse.json({
      targets,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Targets API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
