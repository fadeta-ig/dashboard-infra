import { type NextRequest } from 'next/server';
import { ensureMonitoringSchema } from '@/lib/history';
import { getDatabaseUnavailableReason, isDatabaseConfigured, testDatabaseConnection } from '@/lib/db';
import { noStoreJson, enforceMetricsRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  if (!isDatabaseConfigured()) {
    return noStoreJson({
      ok: false,
      storageEnabled: false,
      message: getDatabaseUnavailableReason(),
    }, { status: 400 });
  }

  await testDatabaseConnection();
  await ensureMonitoringSchema();

  return noStoreJson({
    ok: true,
    storageEnabled: true,
    message: 'Schema monitoring berhasil diinisialisasi.',
  });
}
