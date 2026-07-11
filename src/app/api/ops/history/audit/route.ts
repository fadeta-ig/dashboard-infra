import { type NextRequest } from 'next/server';
import { listAuditEventsPage } from '@/lib/history';
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
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
      summary: { total: 0, info: 0, warning: 0, critical: 0 },
    }, { status: 200 });
  }

  const { searchParams } = request.nextUrl;
  const page = Number.parseInt(searchParams.get('page') || '1', 10);
  const pageSize = Number.parseInt(searchParams.get('pageSize') || searchParams.get('limit') || '25', 10);
  const severity = searchParams.get('severity');
  const result = await listAuditEventsPage({ page, pageSize, severity });

  return noStoreJson({
    ok: true,
    storageEnabled: true,
    ...result,
  });
}
