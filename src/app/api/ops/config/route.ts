import { type NextRequest } from 'next/server';
import { listConfigItems, upsertConfigItem, type ConfigItemType } from '@/lib/config-store';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const CONFIG_TYPES: ConfigItemType[] = ['network_target', 'mikrotik_interface', 'ubuntu_service', 'sla_policy', 'maintenance_window'];

function parseType(value: unknown): ConfigItemType | null {
  return typeof value === 'string' && CONFIG_TYPES.includes(value as ConfigItemType) ? value as ConfigItemType : null;
}

function parsePayload(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const type = parseType(request.nextUrl.searchParams.get('type'));
  return noStoreJson(await listConfigItems(type));
}

export async function POST(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const requestBody = body || {};
  const type = parseType(requestBody.type);
  const key = typeof requestBody.key === 'string' ? requestBody.key.trim() : '';
  const label = typeof requestBody.label === 'string' ? requestBody.label.trim() : '';
  const payload = parsePayload(requestBody.payload);
  if (!type || !key || !label || !payload) {
    return noStoreJson({ ok: false, error: 'type, key, label, dan payload JSON wajib valid.' }, { status: 400 });
  }

  await upsertConfigItem({
    type,
    key,
    label,
    enabled: requestBody.enabled !== false,
    sortOrder: Number.isFinite(Number(requestBody.sortOrder)) ? Number(requestBody.sortOrder) : 0,
    payload,
  });

  return noStoreJson({ ok: true, item: { type, key, label } });
}
