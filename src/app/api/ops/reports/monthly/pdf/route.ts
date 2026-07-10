import { type NextRequest } from 'next/server';
import { getDatabaseUnavailableReason, isDatabaseConfigured } from '@/lib/db';
import { buildMonthlyReport, buildMonthlyReportPdf, normalizeReportMonth } from '@/lib/reports';
import { enforceMetricsRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  if (!isDatabaseConfigured()) {
    return new Response(getDatabaseUnavailableReason() || 'Database unavailable', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  const { searchParams } = new URL(request.url);
  const reportMonth = normalizeReportMonth(searchParams.get('month'));
  const report = await buildMonthlyReport(reportMonth);
  const pdfBytes = await buildMonthlyReportPdf(report);
  const pdfBuffer = Buffer.from(pdfBytes);

  return new Response(pdfBuffer, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="monitoring-report-${reportMonth}.pdf"`,
    },
  });
}
