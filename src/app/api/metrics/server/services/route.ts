import { type NextRequest } from 'next/server';
import { noStoreJson, enforceMetricsRateLimit } from '@/lib/rate-limit';
import { getServiceHealthSnapshot } from '@/lib/service-health';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  return noStoreJson(await getServiceHealthSnapshot());
}
