import { type NextRequest } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';
import { isDatabaseConfigured, queryRows, testDatabaseConnection } from '@/lib/db';
import { evaluateFreshness } from '@/lib/freshness';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';
import type { RowDataPacket } from 'mysql2/promise';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;
  const now = Date.now();
  const checkedAt = new Date(now).toISOString();
  const age = Number(process.env.METRICS_MAX_AGE_MS || 180000);
  const maxAge = Number.isFinite(age) && age >= 1000 ? age : 180000;
  const interval = Number(process.env.HISTORY_COLLECT_INTERVAL_MS || 60000);
  const collectorAge = Number.isFinite(interval) && interval >= 5000 ? interval * 3 : 180000;
  const [metrics, storage] = await Promise.all([
    prometheusInstantQuery('timestamp(up)'),
    (async () => {
      if (!isDatabaseConfigured()) return { database: false, heartbeat: null as string | null };
      try {
        await testDatabaseConnection();
        let heartbeat: string | null = null;
        try {
          const rows = await queryRows<RowDataPacket>("SELECT state_json FROM monitoring_state_snapshots WHERE state_key = 'collector:heartbeat'");
          const raw = rows[0]?.state_json;
          const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
          heartbeat = typeof state?.completedAt === 'string' ? state.completedAt : null;
        } catch { /* A new installation has no completed collection yet. */ }
        return { database: true, heartbeat };
      } catch { return { database: false, heartbeat: null as string | null }; }
    })(),
  ]);
  const samples = metrics?.resultType === 'vector' ? metrics.result.map((item) => Number(item.value[1]) * 1000).filter((value) => Number.isFinite(value) && value > 0) : [];
  const observed = samples.length ? new Date(Math.min(...samples)).toISOString() : null;
  return noStoreJson({
    checkedAt,
    sources: [
      { key: 'prometheus', label: 'Metrik Prometheus', detail: samples.length ? `${samples.length} target; waktu sampel tertua dipakai sebagai acuan.` : 'Sampel belum tersedia atau Prometheus tidak terjangkau.', freshness: evaluateFreshness(observed, maxAge) },
      { key: 'database', label: 'Penyimpanan MySQL', detail: storage.database ? 'Koneksi penyimpanan dapat diakses.' : 'Koneksi penyimpanan belum tersedia.', freshness: evaluateFreshness(storage.database ? new Date().toISOString() : null, maxAge) },
      { key: 'collector', label: 'Collector histori', detail: storage.heartbeat ? 'Waktu terakhir satu siklus pengumpulan selesai.' : 'Belum ada siklus selesai yang tercatat.', freshness: evaluateFreshness(storage.heartbeat, collectorAge) },
    ],
  });
}
