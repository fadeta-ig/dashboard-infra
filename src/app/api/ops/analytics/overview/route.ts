import { type NextRequest } from 'next/server';
import { getDatabaseUnavailableReason, isDatabaseConfigured } from '@/lib/db';
import { listCapacityDaily, listHealthScores } from '@/lib/history';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  if (!isDatabaseConfigured()) {
    return noStoreJson({
      ok: false,
      storageEnabled: false,
      message: getDatabaseUnavailableReason(),
      healthScores: [],
      capacityDaily: [],
    });
  }

  const { searchParams } = new URL(request.url);
  const days = Number.parseInt(searchParams.get('days') || '14', 10);

  return noStoreJson({
    ok: true,
    storageEnabled: true,
    healthScores: await listHealthScores(days),
    capacityDaily: await listCapacityDaily(days),
  });
}
