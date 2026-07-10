import { type NextRequest } from 'next/server';
import { listAuditEvents } from '@/lib/history';
import { getDatabaseUnavailableReason, isDatabaseConfigured } from '@/lib/db';
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
      events: [],
    }, { status: 200 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get('limit') || '100', 10);

  return noStoreJson({
    ok: true,
    storageEnabled: true,
    events: await listAuditEvents(limit),
  });
}
