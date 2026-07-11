import nodemailer from 'nodemailer';
import type { RowDataPacket } from 'mysql2/promise';
import { executeStatement, queryRows } from '@/lib/db';
import { nowIso } from '@/lib/metrics';
import { toMysqlDateTime } from '@/lib/time';

const ALERT_TIMEOUT_MS = 5000;
const DEFAULT_ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const DEFAULT_ALERT_TIME_ZONE = 'Asia/Jakarta';

export type AlertEventType = 'opened' | 'resolved' | 'acknowledged';
export type AlertSeverity = 'warning' | 'critical';
type DeliveryStatus = 'sent' | 'failed' | 'skipped';

export interface AlertIncidentSnapshot {
  incidentKey: string;
  title: string;
  severity: AlertSeverity;
  status: 'open' | 'resolved';
  source: string;
  domainKey: string;
  entityType: string;
  entityKey: string;
  entityLabel: string;
  startedAt: string;
  resolvedAt?: string | null;
  metadata?: Record<string, unknown>;
  acknowledgedBy?: string | null;
  acknowledgementNote?: string | null;
}

function readCooldownMs() {
  const raw = process.env.ALERT_COOLDOWN_MS;
  if (!raw) return DEFAULT_ALERT_COOLDOWN_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_ALERT_COOLDOWN_MS;
}

function readCsvEnv(name: string) {
  return (process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAlertPayload(eventType: AlertEventType, incident: AlertIncidentSnapshot) {
  return {
    eventType,
    generatedAt: nowIso(),
    app: 'dashboard-infra',
    incident: {
      key: incident.incidentKey,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      source: incident.source,
      domainKey: incident.domainKey,
      entityType: incident.entityType,
      entityKey: incident.entityKey,
      entityLabel: incident.entityLabel,
      startedAt: incident.startedAt,
      resolvedAt: incident.resolvedAt || null,
      acknowledgedBy: incident.acknowledgedBy || null,
      acknowledgementNote: incident.acknowledgementNote || null,
      metadata: incident.metadata || {},
    },
  };
}

function eventLabel(eventType: AlertEventType) {
  if (eventType === 'opened') return 'OPEN';
  if (eventType === 'resolved') return 'RESOLVED';
  return 'ACK';
}

function formatMetadata(metadata: Record<string, unknown> | undefined) {
  const entries = Object.entries(metadata || {}).slice(0, 8);
  if (entries.length === 0) return '-';
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join('\n');
}

function formatAlertTimestamp(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: process.env.ALERT_TIME_ZONE || process.env.APP_TIME_ZONE || DEFAULT_ALERT_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(date);
}

function buildPlainTextMessage(eventType: AlertEventType, incident: AlertIncidentSnapshot) {
  return [
    `[${eventLabel(eventType)}] ${incident.severity.toUpperCase()} - ${incident.title}`,
    `Entity: ${incident.entityLabel}`,
    `Domain: ${incident.domainKey}`,
    `Status: ${incident.status}`,
    `Started: ${formatAlertTimestamp(incident.startedAt)}`,
    incident.resolvedAt ? `Resolved: ${formatAlertTimestamp(incident.resolvedAt)}` : null,
    incident.acknowledgedBy ? `Ack by: ${incident.acknowledgedBy}` : null,
    incident.acknowledgementNote ? `Ack note: ${incident.acknowledgementNote}` : null,
    `Key: ${incident.incidentKey}`,
    `Metadata:\n${formatMetadata(incident.metadata)}`,
  ].filter(Boolean).join('\n');
}

function buildEmailHtml(eventType: AlertEventType, incident: AlertIncidentSnapshot) {
  const rows = [
    ['Event', eventLabel(eventType)],
    ['Severity', incident.severity.toUpperCase()],
    ['Title', incident.title],
    ['Entity', incident.entityLabel],
    ['Domain', incident.domainKey],
    ['Status', incident.status],
    ['Started', formatAlertTimestamp(incident.startedAt)],
    ['Resolved', formatAlertTimestamp(incident.resolvedAt)],
    ['Ack By', incident.acknowledgedBy || '-'],
    ['Ack Note', incident.acknowledgementNote || '-'],
    ['Incident Key', incident.incidentKey],
  ];

  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a;">
      <h2 style="margin: 0 0 12px;">${eventLabel(eventType)} - ${incident.title}</h2>
      <table style="border-collapse: collapse; width: 100%; max-width: 760px;">
        ${rows.map(([label, value]) => `
          <tr>
            <td style="border: 1px solid #e2e8f0; padding: 8px; font-weight: 700; width: 160px;">${label}</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px;">${value}</td>
          </tr>
        `).join('')}
      </table>
      <pre style="margin-top: 16px; white-space: pre-wrap; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px;">${formatMetadata(incident.metadata)}</pre>
    </div>
  `;
}

async function recentSentDeliveryExists(
  incidentKey: string,
  eventType: AlertEventType,
  channel: string,
  cooldownMs: number,
) {
  if (cooldownMs <= 0) return false;
  const cooldownSeconds = Math.ceil(cooldownMs / 1000);
  const rows = await queryRows<RowDataPacket & { count_value: number }>(
    `SELECT COUNT(*) AS count_value
     FROM monitoring_alert_deliveries
     WHERE incident_key = ?
       AND event_type = ?
       AND channel = ?
       AND status = 'sent'
       AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)`,
    [incidentKey, eventType, channel, cooldownSeconds],
  );
  return Number(rows[0]?.count_value || 0) > 0;
}

async function insertDelivery(params: {
  incidentKey: string;
  eventType: AlertEventType;
  channel: string;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  deliveredAtIso: string | null;
  payload: Record<string, unknown>;
}) {
  await executeStatement(
    `INSERT INTO monitoring_alert_deliveries
      (incident_key, event_type, channel, status, attempts, last_error, delivered_at, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.incidentKey,
      params.eventType,
      params.channel,
      params.status,
      params.attempts,
      params.lastError,
      params.deliveredAtIso ? toMysqlDateTime(params.deliveredAtIso) : null,
      JSON.stringify(params.payload),
    ],
  );
}

async function recordSkipped(
  eventType: AlertEventType,
  incident: AlertIncidentSnapshot,
  channel: string,
  reason: string,
  payload: Record<string, unknown>,
) {
  await insertDelivery({
    incidentKey: incident.incidentKey,
    eventType,
    channel,
    status: 'skipped',
    attempts: 0,
    lastError: reason,
    deliveredAtIso: null,
    payload,
  });
}

async function deliverChannel(params: {
  eventType: AlertEventType;
  incident: AlertIncidentSnapshot;
  channel: string;
  payload: Record<string, unknown>;
  enabled: boolean;
  disabledReason: string;
  sender: () => Promise<void>;
}) {
  if (!params.enabled) {
    await recordSkipped(params.eventType, params.incident, params.channel, params.disabledReason, params.payload);
    return;
  }

  if (await recentSentDeliveryExists(params.incident.incidentKey, params.eventType, params.channel, readCooldownMs())) {
    await recordSkipped(params.eventType, params.incident, params.channel, 'cooldown active', params.payload);
    return;
  }

  try {
    await params.sender();
    await insertDelivery({
      incidentKey: params.incident.incidentKey,
      eventType: params.eventType,
      channel: params.channel,
      status: 'sent',
      attempts: 1,
      lastError: null,
      deliveredAtIso: nowIso(),
      payload: params.payload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown alert delivery error';
    console.error(`Alert delivery failed for ${params.channel}:`, error);
    await insertDelivery({
      incidentKey: params.incident.incidentKey,
      eventType: params.eventType,
      channel: params.channel,
      status: 'failed',
      attempts: 1,
      lastError: message.slice(0, 255),
      deliveredAtIso: null,
      payload: params.payload,
    });
  }
}

async function postJson(url: string, payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function sendWebhook(payload: Record<string, unknown>) {
  const headers: Record<string, string> = {};
  if (process.env.ALERT_WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}`;
  }
  await postJson(process.env.ALERT_WEBHOOK_URL as string, payload, headers);
}

async function sendEmail(eventType: AlertEventType, incident: AlertIncidentSnapshot) {
  const port = Number.parseInt(process.env.ALERT_EMAIL_SMTP_PORT || '587', 10);
  const secure = (process.env.ALERT_EMAIL_SMTP_SECURE || '').toLowerCase() === 'true';
  const user = process.env.ALERT_EMAIL_SMTP_USER;
  const pass = process.env.ALERT_EMAIL_SMTP_PASS;
  const to = readCsvEnv('ALERT_EMAIL_TO');
  const from = process.env.ALERT_EMAIL_FROM || user;

  if (!from || to.length === 0) {
    throw new Error('Email sender or recipient is not configured');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.ALERT_EMAIL_SMTP_HOST,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  await transporter.sendMail({
    from,
    to,
    subject: `[InfraDash ${eventLabel(eventType)}] ${incident.severity.toUpperCase()} - ${incident.title}`,
    text: buildPlainTextMessage(eventType, incident),
    html: buildEmailHtml(eventType, incident),
  });
}

async function sendWhatsapp(eventType: AlertEventType, incident: AlertIncidentSnapshot) {
  const token = process.env.ALERT_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.ALERT_WHATSAPP_PHONE_NUMBER_ID;
  const recipients = readCsvEnv('ALERT_WHATSAPP_TO');
  const apiVersion = process.env.ALERT_WHATSAPP_API_VERSION || 'v20.0';

  if (!token || !phoneNumberId || recipients.length === 0) {
    throw new Error('WhatsApp token, phone number id, or recipient is not configured');
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const text = buildPlainTextMessage(eventType, incident).slice(0, 3900);

  await Promise.all(recipients.map((recipient) => postJson(
    url,
    {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: text,
      },
    },
    {
      Authorization: `Bearer ${token}`,
    },
  )));
}

export async function dispatchIncidentAlert(eventType: AlertEventType, incident: AlertIncidentSnapshot) {
  const payload = buildAlertPayload(eventType, incident);

  await Promise.all([
    deliverChannel({
      eventType,
      incident,
      channel: 'webhook',
      payload,
      enabled: Boolean(process.env.ALERT_WEBHOOK_URL?.trim()),
      disabledReason: 'ALERT_WEBHOOK_URL is not configured',
      sender: () => sendWebhook(payload),
    }),
    deliverChannel({
      eventType,
      incident,
      channel: 'email',
      payload,
      enabled: Boolean(process.env.ALERT_EMAIL_SMTP_HOST && readCsvEnv('ALERT_EMAIL_TO').length > 0),
      disabledReason: 'ALERT_EMAIL_SMTP_HOST or ALERT_EMAIL_TO is not configured',
      sender: () => sendEmail(eventType, incident),
    }),
    deliverChannel({
      eventType,
      incident,
      channel: 'whatsapp',
      payload,
      enabled: Boolean(
        process.env.ALERT_WHATSAPP_TOKEN &&
        process.env.ALERT_WHATSAPP_PHONE_NUMBER_ID &&
        readCsvEnv('ALERT_WHATSAPP_TO').length > 0,
      ),
      disabledReason: 'ALERT_WHATSAPP_TOKEN, ALERT_WHATSAPP_PHONE_NUMBER_ID, or ALERT_WHATSAPP_TO is not configured',
      sender: () => sendWhatsapp(eventType, incident),
    }),
  ]);
}
