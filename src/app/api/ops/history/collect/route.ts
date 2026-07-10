import { type NextRequest } from 'next/server';
import { runHistoryCollection } from '@/lib/history';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const result = await runHistoryCollection();
  return noStoreJson(result, { status: result.ok ? 200 : 400 });
}
