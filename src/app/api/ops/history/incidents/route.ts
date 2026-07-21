import { type NextRequest } from 'next/server';
import { listIncidentsPage } from '@/lib/history';
import { getDatabaseUnavailableReason, isDatabaseConfigured } from '@/lib/db';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  if (!isDatabaseConfigured()) {
    return noStoreJson({
      ok: false,
      storageEnabled: false,
      message: getDatabaseUnavailableReason(),
      incidents: [],
      pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 },
      summary: { total: 0, open: 0, resolved: 0 },
    }, { status: 200 });
  }

  const { searchParams } = request.nextUrl;
  const page = Number.parseInt(searchParams.get('page') || '1', 10);
  const pageSize = Number.parseInt(searchParams.get('pageSize') || searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10);
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const sort = searchParams.get('sort');
  const direction = searchParams.get('direction');
  const result = await listIncidentsPage({ page, pageSize, status, search, sort, direction });

  return noStoreJson({
    ok: true,
    storageEnabled: true,
    ...result,
  });
}
