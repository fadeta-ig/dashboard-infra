import { type NextRequest } from 'next/server';
import { getDatabaseUnavailableReason, isDatabaseConfigured } from '@/lib/db';
import { buildMonthlyReport, normalizeReportMonth } from '@/lib/reports';
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
      report: null,
    });
  }

  const { searchParams } = new URL(request.url);
  const reportMonth = normalizeReportMonth(searchParams.get('month'));

  return noStoreJson({
    ok: true,
    storageEnabled: true,
    report: await buildMonthlyReport(reportMonth),
  });
}
