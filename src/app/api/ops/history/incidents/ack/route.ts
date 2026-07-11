import { type NextRequest } from 'next/server';
import { SESSION_COOKIE, getSessionUsername } from '@/lib/auth';
import { dispatchIncidentAlert } from '@/lib/alerts';
import { acknowledgeIncident } from '@/lib/history';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface AckPayload {
  id?: unknown;
  note?: unknown;
}

export async function POST(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const actor = await getSessionUsername(request.cookies.get(SESSION_COOKIE)?.value);
  if (!actor) {
    return noStoreJson({ ok: false, error: 'Session user tidak valid.' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as AckPayload;
  const id = typeof payload.id === 'number' ? payload.id : Number.parseInt(String(payload.id || ''), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return noStoreJson({ ok: false, error: 'ID incident tidak valid.' }, { status: 400 });
  }

  const result = await acknowledgeIncident({
    id,
    actor,
    note: typeof payload.note === 'string' ? payload.note : null,
  });

  if (result.changed && result.incident) {
    await dispatchIncidentAlert('acknowledged', {
      incidentKey: result.incident.incidentKey,
      title: result.incident.title,
      severity: result.incident.severity,
      status: 'open',
      source: result.incident.source,
      domainKey: result.incident.domainKey,
      entityType: result.incident.entityType,
      entityKey: result.incident.entityKey,
      entityLabel: result.incident.entityLabel,
      startedAt: result.incident.startedAt,
      resolvedAt: result.incident.resolvedAt,
      acknowledgedBy: result.incident.acknowledgedBy,
      acknowledgementNote: result.incident.acknowledgementNote,
      metadata: result.incident.metadata,
    });
  }

  return noStoreJson(result, { status: result.ok ? 200 : 409 });
}
