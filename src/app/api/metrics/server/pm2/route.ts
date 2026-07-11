import { type NextRequest } from 'next/server';
import { getPm2HealthSnapshot } from '@/lib/pm2-health';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  return noStoreJson(await getPm2HealthSnapshot());
}
