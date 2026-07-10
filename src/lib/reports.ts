import path from 'node:path';
import { promises as fs } from 'node:fs';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { RowDataPacket } from 'mysql2/promise';
import { BRANDING } from '@/lib/branding';
import { executeStatement, getDatabaseUnavailableReason, isDatabaseConfigured, queryRows } from '@/lib/db';
import { buildTargets, PROMQL } from '@/lib/metrics';
import { prometheusInstantQuery } from '@/lib/prometheus';
import type { IncidentStatus } from '@/lib/history';

export interface MonthlyReportTargetAvailability {
  targetKey: string;
  label: string;
  status: IncidentStatus;
  incidentsCount: number;
  downtimeSeconds: number;
  availabilityPercent: number;
}

export interface MonthlyReportIncident {
  id: number;
  title: string;
  label: string;
  severity: 'warning' | 'critical';
  status: IncidentStatus;
  startedAt: string;
  resolvedAt: string | null;
  impactedDurationSeconds: number;
}

export interface MonthlyReportRecommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

export interface MonthlyReportData {
  reportMonth: string;
  generatedAt: string;
  window: {
    start: string;
    end: string;
    monitoredSeconds: number;
    isPartialMonth: boolean;
  };
  executiveSummary: {
    headline: string;
    summary: string;
    currentOpenIncidents: number;
    totalIncidents: number;
    totalDowntimeSeconds: number;
    overallAvailabilityPercent: number | null;
    auditEvents: number;
    criticalAuditEvents: number;
  };
  availability: {
    overallPercent: number | null;
    monitoredTargets: number;
    totalDowntimeSeconds: number;
    targets: MonthlyReportTargetAvailability[];
  };
  topIncidents: MonthlyReportIncident[];
  auditHighlights: {
    totalEvents: number;
    criticalEvents: number;
    warningEvents: number;
    topEventTypes: Array<{ eventType: string; count: number }>;
  };
  recommendations: MonthlyReportRecommendation[];
}

interface IncidentRow extends RowDataPacket {
  id: number;
  title: string;
  status: IncidentStatus;
  severity: 'warning' | 'critical';
  entity_key: string;
  entity_label: string;
  started_at: Date | string;
  resolved_at: Date | string | null;
}

interface AuditRow extends RowDataPacket {
  event_type: string;
  severity: 'info' | 'warning' | 'critical';
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatMonthLabel(month: string) {
  const [yearRaw, monthRaw] = month.split('-');
  const year = Number.parseInt(yearRaw, 10);
  const monthIndex = Number.parseInt(monthRaw, 10) - 1;
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return '0 menit';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes > 0 ? `${hours} jam ${remainingMinutes} menit` : `${hours} jam`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days} hari ${remainingHours} jam` : `${days} hari`;
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toMysqlDateTime(value: string) {
  return value.slice(0, 19).replace('T', ' ');
}

export function normalizeReportMonth(rawMonth: string | null | undefined) {
  if (rawMonth && /^\d{4}-\d{2}$/.test(rawMonth)) {
    return rawMonth;
  }

  const now = new Date();
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
}

function getReportWindow(reportMonth: string) {
  const [yearRaw, monthRaw] = reportMonth.split('-');
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`Format bulan report tidak valid: ${reportMonth}`);
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const now = new Date();
  const effectiveEnd = end.getTime() > now.getTime() ? now : end;

  return {
    start,
    end,
    effectiveEnd,
    monitoredSeconds: Math.max(0, Math.round((effectiveEnd.getTime() - start.getTime()) / 1000)),
    isPartialMonth: effectiveEnd.getTime() < end.getTime(),
  };
}

async function getMonitoredTargetMap() {
  const targetsData = await prometheusInstantQuery(PROMQL.up);
  const targets = buildTargets(targetsData, new Date().toISOString());
  return new Map(
    targets.map((target) => [
      `target:${target.job}:${target.instance}`,
      `${target.job} / ${target.instance}`,
    ]),
  );
}

function clipIncidentDuration(startedAt: string, resolvedAt: string | null, windowStart: Date, windowEnd: Date) {
  const startMs = Math.max(new Date(startedAt).getTime(), windowStart.getTime());
  const endMs = Math.min(new Date(resolvedAt ?? windowEnd.toISOString()).getTime(), windowEnd.getTime());
  if (endMs <= startMs) return 0;
  return Math.round((endMs - startMs) / 1000);
}

function buildRecommendations(report: {
  availabilityOverall: number | null;
  criticalAuditEvents: number;
  currentOpenIncidents: number;
  topIncidents: MonthlyReportIncident[];
}) {
  const recommendations: MonthlyReportRecommendation[] = [];

  if (report.currentOpenIncidents > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Tuntaskan incident yang masih open',
      detail: `${report.currentOpenIncidents} incident masih terbuka. Pastikan owner dan target waktu penanganan ditetapkan agar dampak tidak berlanjut ke bulan berikutnya.`,
    });
  }

  if (report.availabilityOverall !== null && report.availabilityOverall < 99) {
    recommendations.push({
      priority: 'high',
      title: 'Naikkan availability layanan',
      detail: `Availability bulan ini ${report.availabilityOverall.toFixed(2)}%. Fokus pada target dengan downtime terlama dan buat tindakan pencegahan agar SLA lebih stabil.`,
    });
  }

  if (report.criticalAuditEvents > 0) {
    recommendations.push({
      priority: 'medium',
      title: 'Tutup gap operasional kritis',
      detail: `Terdapat ${report.criticalAuditEvents} audit event kritis. Validasi collector, service penting, dan metric wajib agar blind spot monitoring berkurang.`,
    });
  }

  const longestIncident = report.topIncidents[0];
  if (longestIncident && longestIncident.impactedDurationSeconds >= 3600) {
    recommendations.push({
      priority: 'medium',
      title: 'Review akar masalah incident terpanjang',
      detail: `${longestIncident.title} berdampak selama ${formatDuration(longestIncident.impactedDurationSeconds)}. Buat postmortem singkat dan tambahkan kontrol pencegahan.`,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'low',
      title: 'Pertahankan baseline monitoring',
      detail: 'Kondisi bulan ini relatif stabil. Lanjutkan review mingguan, validasi alert, dan perluas coverage probe untuk menjaga tren tetap sehat.',
    });
  }

  return recommendations;
}

async function loadMonthlyIncidentRows(reportMonth: string) {
  const window = getReportWindow(reportMonth);
  return queryRows<IncidentRow>(
    `SELECT id, title, status, severity, entity_key, entity_label, started_at, resolved_at
     FROM monitoring_incidents
     WHERE started_at < ?
       AND (resolved_at IS NULL OR resolved_at >= ?)
     ORDER BY started_at DESC`,
    [toMysqlDateTime(window.end.toISOString()), toMysqlDateTime(window.start.toISOString())],
  );
}

async function loadMonthlyAuditRows(reportMonth: string) {
  const window = getReportWindow(reportMonth);
  return queryRows<AuditRow>(
    `SELECT event_type, severity
     FROM monitoring_audit_events
     WHERE event_at >= ? AND event_at < ?`,
    [toMysqlDateTime(window.start.toISOString()), toMysqlDateTime(window.end.toISOString())],
  );
}

async function persistReportSnapshot(reportMonth: string, payload: MonthlyReportData) {
  await executeStatement(
    `INSERT INTO report_snapshots (report_month, report_type, payload_json)
     VALUES (?, 'monthly_summary', ?)
     ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json), generated_at = CURRENT_TIMESTAMP`,
    [reportMonth, JSON.stringify(payload)],
  );
}

export async function buildMonthlyReport(reportMonthRaw: string | null | undefined) {
  if (!isDatabaseConfigured()) {
    throw new Error(getDatabaseUnavailableReason() || 'Database unavailable');
  }

  const reportMonth = normalizeReportMonth(reportMonthRaw);
  const window = getReportWindow(reportMonth);
  const [incidentRows, auditRows, targetMap] = await Promise.all([
    loadMonthlyIncidentRows(reportMonth),
    loadMonthlyAuditRows(reportMonth),
    getMonitoredTargetMap(),
  ]);

  const targetStats = new Map<string, MonthlyReportTargetAvailability>();

  for (const [targetKey, label] of targetMap.entries()) {
    targetStats.set(targetKey, {
      targetKey,
      label,
      status: 'resolved',
      incidentsCount: 0,
      downtimeSeconds: 0,
      availabilityPercent: 100,
    });
  }

  const topIncidents: MonthlyReportIncident[] = [];

  for (const row of incidentRows) {
    const startedAt = toIsoString(row.started_at) as string;
    const resolvedAt = toIsoString(row.resolved_at);
    const impactedDurationSeconds = clipIncidentDuration(startedAt, resolvedAt, window.start, window.effectiveEnd);
    const targetKey = row.entity_key;
    const existing = targetStats.get(targetKey) || {
      targetKey,
      label: row.entity_label,
      status: 'resolved' as IncidentStatus,
      incidentsCount: 0,
      downtimeSeconds: 0,
      availabilityPercent: 100,
    };

    existing.incidentsCount += 1;
    existing.downtimeSeconds += impactedDurationSeconds;
    if (row.status === 'open') existing.status = 'open';
    targetStats.set(targetKey, existing);

    topIncidents.push({
      id: row.id,
      title: row.title,
      label: row.entity_label,
      severity: row.severity,
      status: row.status,
      startedAt,
      resolvedAt,
      impactedDurationSeconds,
    });
  }

  const monitoredTargets = targetStats.size;
  let totalDowntimeSeconds = 0;
  const availabilityTargets = Array.from(targetStats.values())
    .map((target) => {
      totalDowntimeSeconds += target.downtimeSeconds;
      const availabilityPercent = window.monitoredSeconds > 0
        ? Math.max(0, round(100 - (target.downtimeSeconds / window.monitoredSeconds) * 100, 2))
        : 100;
      return {
        ...target,
        availabilityPercent,
      };
    })
    .sort((left, right) => {
      if (left.availabilityPercent !== right.availabilityPercent) {
        return left.availabilityPercent - right.availabilityPercent;
      }
      return right.downtimeSeconds - left.downtimeSeconds;
    });

  const overallPercent = monitoredTargets > 0 && window.monitoredSeconds > 0
    ? Math.max(0, round(100 - (totalDowntimeSeconds / (window.monitoredSeconds * monitoredTargets)) * 100, 2))
    : null;

  const topEventTypeMap = new Map<string, number>();
  let criticalAuditEvents = 0;
  let warningAuditEvents = 0;

  for (const row of auditRows) {
    topEventTypeMap.set(row.event_type, (topEventTypeMap.get(row.event_type) || 0) + 1);
    if (row.severity === 'critical') criticalAuditEvents += 1;
    if (row.severity === 'warning') warningAuditEvents += 1;
  }

  topIncidents.sort((left, right) => {
    if (left.impactedDurationSeconds !== right.impactedDurationSeconds) {
      return right.impactedDurationSeconds - left.impactedDurationSeconds;
    }
    if (left.severity !== right.severity) {
      return left.severity === 'critical' ? -1 : 1;
    }
    return right.startedAt.localeCompare(left.startedAt);
  });

  const currentOpenIncidents = incidentRows.filter((row) => row.status === 'open').length;

  const headline = overallPercent === null
    ? 'Belum ada data history yang cukup untuk membuat ringkasan bulanan.'
    : overallPercent >= 99.5 && currentOpenIncidents === 0
      ? 'Kondisi monitoring bulan ini stabil dan mayoritas target tersedia dengan baik.'
      : overallPercent >= 99
        ? 'Kondisi monitoring cukup stabil, namun masih ada beberapa gangguan yang perlu ditutup.'
        : 'Bulan ini terjadi gangguan yang cukup memengaruhi availability dan perlu tindak lanjut.';

  const summary = overallPercent === null
    ? 'Aktifkan collector history secara periodik agar incident dan audit log terkumpul untuk laporan bulan berikutnya.'
    : `Availability keseluruhan tercatat ${overallPercent.toFixed(2)}% dari ${monitoredTargets} target yang termonitor, dengan total downtime ${formatDuration(totalDowntimeSeconds)}.`;

  const report: MonthlyReportData = {
    reportMonth,
    generatedAt: new Date().toISOString(),
    window: {
      start: window.start.toISOString(),
      end: window.effectiveEnd.toISOString(),
      monitoredSeconds: window.monitoredSeconds,
      isPartialMonth: window.isPartialMonth,
    },
    executiveSummary: {
      headline,
      summary,
      currentOpenIncidents,
      totalIncidents: incidentRows.length,
      totalDowntimeSeconds,
      overallAvailabilityPercent: overallPercent,
      auditEvents: auditRows.length,
      criticalAuditEvents,
    },
    availability: {
      overallPercent,
      monitoredTargets,
      totalDowntimeSeconds,
      targets: availabilityTargets,
    },
    topIncidents: topIncidents.slice(0, 10),
    auditHighlights: {
      totalEvents: auditRows.length,
      criticalEvents: criticalAuditEvents,
      warningEvents: warningAuditEvents,
      topEventTypes: Array.from(topEventTypeMap.entries())
        .map(([eventType, count]) => ({ eventType, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
    },
    recommendations: buildRecommendations({
      availabilityOverall: overallPercent,
      criticalAuditEvents,
      currentOpenIncidents,
      topIncidents,
    }),
  };

  await persistReportSnapshot(reportMonth, report);
  return report;
}

async function loadLogoBytes() {
  const logoPath = path.resolve(process.cwd(), 'public', BRANDING.pdfLogoSrc.replace(/^\//, ''));
  return fs.readFile(logoPath);
}

function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) lines.push(currentLine);

  let cursorY = y;
  for (const line of lines) {
    page.drawText(line, {
      x,
      y: cursorY,
      size,
      color: rgb(0.15, 0.2, 0.28),
    });
    cursorY -= lineHeight;
  }

  return cursorY;
}

export async function buildMonthlyReportPdf(report: MonthlyReportData) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.setFont(font);

  const logoBytes = await loadLogoBytes();
  const logo = await pdf.embedPng(logoBytes);
  const logoDims = logo.scale(0.22);

  page.drawRectangle({
    x: 0,
    y: 760,
    width: 595,
    height: 82,
    color: rgb(0.95, 0.97, 0.99),
  });
  page.drawImage(logo, {
    x: 42,
    y: 776,
    width: logoDims.width,
    height: logoDims.height,
  });
  page.setFont(fontBold);
  page.drawText('Laporan Monitoring Bulanan', {
    x: 128,
    y: 804,
    size: 20,
    color: rgb(0.1, 0.16, 0.24),
  });
  page.setFont(font);
  page.drawText(`${BRANDING.appName} • ${formatMonthLabel(report.reportMonth)}`, {
    x: 128,
    y: 784,
    size: 11,
    color: rgb(0.36, 0.42, 0.5),
  });
  page.drawText(`Generated: ${formatDateTime(report.generatedAt)} UTC`, {
    x: 128,
    y: 768,
    size: 9,
    color: rgb(0.5, 0.56, 0.64),
  });

  let y = 730;
  page.setFont(fontBold);
  page.drawText('Executive Summary', { x: 42, y, size: 14, color: rgb(0.1, 0.16, 0.24) });
  y -= 24;
  page.setFont(font);
  y = drawWrappedText(page, font, report.executiveSummary.headline, 42, y, 510, 12, 16);
  y -= 8;
  y = drawWrappedText(page, font, report.executiveSummary.summary, 42, y, 510, 11, 15);

  y -= 18;
  const summaryItems = [
    `Availability keseluruhan: ${report.executiveSummary.overallAvailabilityPercent?.toFixed(2) ?? 'N/A'}%`,
    `Total incident: ${report.executiveSummary.totalIncidents}`,
    `Incident masih open: ${report.executiveSummary.currentOpenIncidents}`,
    `Total downtime: ${formatDuration(report.executiveSummary.totalDowntimeSeconds)}`,
    `Audit event: ${report.executiveSummary.auditEvents}`,
  ];
  for (const item of summaryItems) {
    page.drawText(`• ${item}`, { x: 52, y, size: 11, color: rgb(0.15, 0.2, 0.28) });
    y -= 15;
  }

  y -= 8;
  page.setFont(fontBold);
  page.drawText('Availability', { x: 42, y, size: 14, color: rgb(0.1, 0.16, 0.24) });
  y -= 22;
  page.setFont(font);
  for (const target of report.availability.targets.slice(0, 6)) {
    const line = `${target.label} | ${target.availabilityPercent.toFixed(2)}% | downtime ${formatDuration(target.downtimeSeconds)} | incident ${target.incidentsCount}`;
    y = drawWrappedText(page, font, line, 42, y, 510, 10, 13);
    y -= 4;
  }

  y -= 10;
  page.setFont(fontBold);
  page.drawText('Top Incident', { x: 42, y, size: 14, color: rgb(0.1, 0.16, 0.24) });
  y -= 22;
  page.setFont(font);
  for (const incident of report.topIncidents.slice(0, 5)) {
    const line = `${incident.title} | ${incident.status.toUpperCase()} | ${formatDuration(incident.impactedDurationSeconds)} | mulai ${formatDateTime(incident.startedAt)} UTC`;
    y = drawWrappedText(page, font, line, 42, y, 510, 10, 13);
    y -= 4;
  }

  y -= 10;
  page.setFont(fontBold);
  page.drawText('Rekomendasi', { x: 42, y, size: 14, color: rgb(0.1, 0.16, 0.24) });
  y -= 22;
  page.setFont(font);
  for (const recommendation of report.recommendations.slice(0, 4)) {
    const line = `${recommendation.priority.toUpperCase()} - ${recommendation.title}: ${recommendation.detail}`;
    y = drawWrappedText(page, font, line, 42, y, 510, 10, 13);
    y -= 6;
  }

  page.drawText(`Window laporan: ${formatDateTime(report.window.start)} UTC s.d. ${formatDateTime(report.window.end)} UTC`, {
    x: 42,
    y: 36,
    size: 9,
    color: rgb(0.5, 0.56, 0.64),
  });

  return pdf.save();
}
