import { type NextRequest } from 'next/server';
import { listConfigItems, listConfigRevisions, restoreConfigRevision, saveConfigChanges } from '@/lib/config-store';
import { CONFIG_TYPES, ConfigError, normalizeConfigInput, planUplinkTransfer, type ConfigItemType } from '@/lib/config-validation';
import { getSessionUsername, SESSION_COOKIE } from '@/lib/auth';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  if (error instanceof ConfigError) return noStoreJson({ ok: false, error: error.message }, { status: error.status });
  console.error('Monitoring configuration failed:', error instanceof Error ? error.message : 'unknown');
  return noStoreJson({ ok: false, error: 'Penyimpanan konfigurasi tidak dapat diakses. Periksa koneksi MySQL lalu coba lagi.' }, { status: 503 });
}

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;
  try {
    const raw = request.nextUrl.searchParams.get('type');
    if (raw && !CONFIG_TYPES.includes(raw as ConfigItemType)) throw new ConfigError('Jenis konfigurasi tidak dikenal.');
    const result = await listConfigItems(raw as ConfigItemType | null);
    return noStoreJson({ ...result, revisions: await listConfigRevisions() });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;
  const actor = await getSessionUsername(request.cookies.get(SESSION_COOKIE)?.value);
  if (!actor) return noStoreJson({ ok: false, error: 'Silakan login untuk mengubah konfigurasi.' }, { status: 401 });
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host')) throw new ConfigError('Origin permintaan tidak sesuai.', 403);
    const raw = await request.text();
    if (raw.length > 64000) throw new ConfigError('Permintaan konfigurasi terlalu besar.', 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { throw new ConfigError('Format JSON tidak valid.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ConfigError('Permintaan tidak valid.');
    let result;
    if (body.action === 'restore') {
      if (typeof body.changeId !== 'string' || !/^[a-f\d-]{36}$/i.test(body.changeId)) throw new ConfigError('ID riwayat tidak valid.');
      result = await restoreConfigRevision(body.changeId, actor);
    } else if (body.action === 'transfer') {
      const current = await listConfigItems('mikrotik_interface');
      if (!current.storageEnabled) throw new ConfigError('Penyimpanan belum aktif.', 503);
      const versions = body.versions as Record<string, string> | undefined;
      const inputs = current.items.map((item) => ({ ...item, expectedVersion: versions?.[item.key] ?? null }));
      const changes = planUplinkTransfer(inputs, String(body.fromKey || ''), String(body.toKey || ''), String(body.logicalKey || ''));
      result = await saveConfigChanges(changes, actor, 'transfer');
    } else if (!body.action || body.action === 'save') {
      result = await saveConfigChanges([normalizeConfigInput(body)], actor);
    } else { throw new ConfigError('Aksi konfigurasi tidak dikenal.'); }
    return noStoreJson({ ok: true, ...result });
  } catch (error) { return failure(error); }
}
