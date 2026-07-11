import path from 'node:path';
import { promises as fs } from 'node:fs';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
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

export interface MonthlyReportHealthScore {
  domainKey: string;
  domainLabel: string;
  averageScore: number;
  latestScore: number;
  worstScore: number;
  status: string;
}

export interface MonthlyReportCapacityItem {
  metricKey: string;
  metricLabel: string;
  unit: string;
  averageValue: number | null;
  peakValue: number | null;
  p95Value: number | null;
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
    topEventTypes: Array<{ eventType: string; label: string; count: number }>;
  };
  operationalSummary: {
    healthScores: MonthlyReportHealthScore[];
    capacity: MonthlyReportCapacityItem[];
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

interface HealthScoreRow extends RowDataPacket {
  score_date: Date | string;
  domain_key: string;
  score: number | string;
  status: string;
}

interface CapacityRow extends RowDataPacket {
  metric_key: string;
  avg_value: number | string | null;
  peak_value: number | string | null;
  p95_value: number | string | null;
}

const REPORT_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

const DOMAIN_LABELS: Record<string, string> = {
  server: 'Server Ubuntu',
  network: 'Jaringan Lokal',
  internet: 'Koneksi Internet',
  prometheus: 'Sistem Monitoring',
  mikrotik: 'MikroTik',
};

const CAPACITY_LABELS: Record<string, { label: string; unit: string }> = {
  server_cpu_percent: { label: 'CPU server', unit: '%' },
  server_ram_percent: { label: 'RAM server', unit: '%' },
  server_disk_root_percent: { label: 'Disk root server', unit: '%' },
  server_net_rx_bytes_per_sec: { label: 'Traffic masuk server', unit: 'MB/s' },
  server_net_tx_bytes_per_sec: { label: 'Traffic keluar server', unit: 'MB/s' },
  server_temperature_celsius: { label: 'Suhu server', unit: 'C' },
  mikrotik_temperature_celsius: { label: 'Suhu MikroTik', unit: 'C' },
};

const AUDIT_EVENT_LABELS: Record<string, string> = {
  reboot_required_changed: 'Status kebutuhan restart server berubah',
  service_state_changed: 'Status service berubah',
  collector_health_changed: 'Kelengkapan data service berubah',
  metric_gap_changed: 'Kelengkapan data monitoring berubah',
  incident_acknowledged: 'Incident di-acknowledge operator',
};

const TARGET_JOB_LABELS: Record<string, string> = {
  node: 'Server Ubuntu',
  prometheus: 'Prometheus',
  blackbox_icmp: 'Koneksi jaringan',
  blackbox_icmp_mki_devices: 'Perangkat kantor',
  snmp_if_mib: 'MikroTik interface',
  snmp_system: 'MikroTik system',
  snmp_mikrotik_temperature: 'Suhu MikroTik',
};

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

function readableKey(value: string) {
  return value
    .replace(/^target:/, '')
    .replace(/[_:.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAuditEventLabel(eventType: string) {
  return AUDIT_EVENT_LABELS[eventType] || readableKey(eventType);
}

function formatDomainLabel(domainKey: string) {
  return DOMAIN_LABELS[domainKey] || readableKey(domainKey);
}

function formatStatusLabel(status: string) {
  if (status === 'healthy') return 'Sehat';
  if (status === 'warning') return 'Perlu perhatian';
  if (status === 'critical') return 'Kritis';
  if (status === 'open') return 'Masih berjalan';
  if (status === 'resolved') return 'Selesai';
  return readableKey(status);
}

function formatSeverityLabel(severity: string) {
  if (severity === 'critical') return 'Kritis';
  if (severity === 'warning') return 'Peringatan';
  return readableKey(severity);
}

function formatPriorityLabel(priority: MonthlyReportRecommendation['priority']) {
  if (priority === 'high') return 'Prioritas tinggi';
  if (priority === 'medium') return 'Prioritas sedang';
  return 'Prioritas rendah';
}

function formatTargetLabel(label: string) {
  const [job, ...rest] = label.split(' / ');
  const instance = rest.join(' / ').trim();
  if (instance) {
    return `${TARGET_JOB_LABELS[job] || readableKey(job)} - ${instance}`;
  }
  return label.replace(/^target:/, '').replace(/^blackbox_icmp(_mki_devices)?:/i, '').trim();
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toMysqlDateTime(value: string) {
  return value.slice(0, 19).replace('T', ' ');
}

export function normalizeReportMonth(rawMonth: string | null | undefined) {
  if (rawMonth && REPORT_MONTH_PATTERN.test(rawMonth)) {
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
      title: 'Tuntaskan gangguan yang masih berjalan',
      detail: `${report.currentOpenIncidents} gangguan masih terbuka. Pastikan owner dan target waktu penanganan ditetapkan agar dampak tidak berlanjut ke bulan berikutnya.`,
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
      detail: `Terdapat ${report.criticalAuditEvents} catatan operasional kritis. Validasi proses pengambilan data, service penting, dan data monitoring wajib agar area yang tidak terpantau berkurang.`,
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
      detail: 'Kondisi bulan ini relatif stabil. Lanjutkan review mingguan, validasi alert, dan perluas cakupan pengecekan layanan untuk menjaga tren tetap sehat.',
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

async function loadMonthlyHealthScoreRows(reportMonth: string) {
  const window = getReportWindow(reportMonth);
  return queryRows<HealthScoreRow>(
    `SELECT score_date, domain_key, score, status
     FROM health_scores
     WHERE score_date >= ? AND score_date < ?
     ORDER BY score_date ASC`,
    [window.start.toISOString().slice(0, 10), window.end.toISOString().slice(0, 10)],
  );
}

async function loadMonthlyCapacityRows(reportMonth: string) {
  const window = getReportWindow(reportMonth);
  return queryRows<CapacityRow>(
    `SELECT metric_key,
            AVG(avg_value) AS avg_value,
            MAX(peak_value) AS peak_value,
            MAX(p95_value) AS p95_value
     FROM capacity_daily
     WHERE snapshot_date >= ? AND snapshot_date < ?
     GROUP BY metric_key`,
    [window.start.toISOString().slice(0, 10), window.end.toISOString().slice(0, 10)],
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

function buildOperationalSummary(healthRows: HealthScoreRow[], capacityRows: CapacityRow[]) {
  const healthByDomain = new Map<string, HealthScoreRow[]>();
  for (const row of healthRows) {
    const rows = healthByDomain.get(row.domain_key) || [];
    rows.push(row);
    healthByDomain.set(row.domain_key, rows);
  }

  const healthScores = Array.from(healthByDomain.entries())
    .map(([domainKey, rows]) => {
      const sortedRows = [...rows].sort((left, right) => (
        new Date(left.score_date).getTime() - new Date(right.score_date).getTime()
      ));
      const scores = sortedRows
        .map((row) => toNumber(row.score))
        .filter((score): score is number => score !== null);
      const latest = sortedRows[sortedRows.length - 1];

      return {
        domainKey,
        domainLabel: formatDomainLabel(domainKey),
        averageScore: round(scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1), 2),
        latestScore: round(toNumber(latest?.score) ?? 0, 2),
        worstScore: round(scores.length > 0 ? Math.min(...scores) : 0, 2),
        status: formatStatusLabel(latest?.status || 'unknown'),
      };
    })
    .sort((left, right) => left.averageScore - right.averageScore);

  const capacity = capacityRows
    .filter((row) => CAPACITY_LABELS[row.metric_key])
    .map((row) => {
      const meta = CAPACITY_LABELS[row.metric_key];
      const convert = row.metric_key.endsWith('_bytes_per_sec')
        ? (value: number | null) => value === null ? null : round(value / 1_048_576, 2)
        : (value: number | null) => value === null ? null : round(value, 2);

      return {
        metricKey: row.metric_key,
        metricLabel: meta.label,
        unit: meta.unit,
        averageValue: convert(toNumber(row.avg_value)),
        peakValue: convert(toNumber(row.peak_value)),
        p95Value: convert(toNumber(row.p95_value)),
      };
    })
    .sort((left, right) => left.metricLabel.localeCompare(right.metricLabel));

  return { healthScores, capacity };
}

export async function buildMonthlyReport(reportMonthRaw: string | null | undefined) {
  if (!isDatabaseConfigured()) {
    throw new Error(getDatabaseUnavailableReason() || 'Database unavailable');
  }

  const reportMonth = normalizeReportMonth(reportMonthRaw);
  const window = getReportWindow(reportMonth);
  const [incidentRows, auditRows, targetMap, healthRows, capacityRows] = await Promise.all([
    loadMonthlyIncidentRows(reportMonth),
    loadMonthlyAuditRows(reportMonth),
    getMonitoredTargetMap(),
    loadMonthlyHealthScoreRows(reportMonth),
    loadMonthlyCapacityRows(reportMonth),
  ]);

  const targetStats = new Map<string, MonthlyReportTargetAvailability>();

  for (const [targetKey, label] of targetMap.entries()) {
    targetStats.set(targetKey, {
      targetKey,
      label: formatTargetLabel(label),
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
      label: formatTargetLabel(row.entity_label),
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
      label: formatTargetLabel(row.entity_label),
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
    ? 'Belum ada data histori yang cukup untuk membuat ringkasan bulanan.'
    : overallPercent >= 99.5 && currentOpenIncidents === 0
      ? 'Kondisi monitoring bulan ini stabil dan mayoritas target tersedia dengan baik.'
      : overallPercent >= 99
        ? 'Kondisi monitoring cukup stabil, namun masih ada beberapa gangguan yang perlu ditutup.'
        : 'Bulan ini terjadi gangguan yang cukup memengaruhi availability dan perlu tindak lanjut.';

  const summary = overallPercent === null
    ? 'Aktifkan pengumpulan data histori secara periodik agar gangguan dan catatan operasional terkumpul untuk laporan bulan berikutnya.'
    : `Availability keseluruhan tercatat ${overallPercent.toFixed(2)}% dari ${monitoredTargets} target yang termonitor, dengan total downtime ${formatDuration(totalDowntimeSeconds)}.`;
  const operationalSummary = buildOperationalSummary(healthRows, capacityRows);

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
        .map(([eventType, count]) => ({ eventType, label: formatAuditEventLabel(eventType), count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
    },
    operationalSummary,
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

function drawSectionTitle(page: PDFPage, fontBold: PDFFont, title: string, y: number) {
  page.setFont(fontBold);
  page.drawText(title, { x: 42, y, size: 14, color: rgb(0.1, 0.16, 0.24) });
  return y - 22;
}

function formatMetricValue(value: number | null, unit: string) {
  if (value === null) return 'Belum ada data';
  return `${value.toFixed(2)} ${unit}`;
}

function addReportPage(
  pdf: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  logo: PDFImage,
  logoDims: { width: number; height: number },
  report: MonthlyReportData,
) {
  const page = pdf.addPage([595, 842]);
  page.setFont(font);
  page.drawRectangle({ x: 0, y: 760, width: 595, height: 82, color: rgb(0.95, 0.97, 0.99) });
  page.drawImage(logo, { x: 42, y: 776, width: logoDims.width, height: logoDims.height });
  page.setFont(fontBold);
  page.drawText('Laporan Monitoring Bulanan', { x: 128, y: 804, size: 20, color: rgb(0.1, 0.16, 0.24) });
  page.setFont(font);
  page.drawText(`${BRANDING.appName} - ${formatMonthLabel(report.reportMonth)}`, { x: 128, y: 784, size: 11, color: rgb(0.36, 0.42, 0.5) });
  page.drawText(`Dibuat: ${formatDateTime(report.generatedAt)} UTC`, { x: 128, y: 768, size: 9, color: rgb(0.5, 0.56, 0.64) });
  page.drawText(`Periode data: ${formatDateTime(report.window.start)} UTC sampai ${formatDateTime(report.window.end)} UTC`, {
    x: 42,
    y: 36,
    size: 9,
    color: rgb(0.5, 0.56, 0.64),
  });
  return { page, y: 730 };
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
  page.drawText(`${BRANDING.appName} - ${formatMonthLabel(report.reportMonth)}`, {
    x: 128,
    y: 784,
    size: 11,
    color: rgb(0.36, 0.42, 0.5),
  });
  page.drawText(`Dibuat: ${formatDateTime(report.generatedAt)} UTC`, {
    x: 128,
    y: 768,
    size: 9,
    color: rgb(0.5, 0.56, 0.64),
  });

  let y = 730;
  page.setFont(fontBold);
  page.drawText('Ringkasan Manajemen', { x: 42, y, size: 14, color: rgb(0.1, 0.16, 0.24) });
  y -= 24;
  page.setFont(font);
  y = drawWrappedText(page, font, report.executiveSummary.headline, 42, y, 510, 12, 16);
  y -= 8;
  y = drawWrappedText(page, font, report.executiveSummary.summary, 42, y, 510, 11, 15);

  y -= 18;
  const summaryItems = [
    `Ketersediaan keseluruhan: ${report.executiveSummary.overallAvailabilityPercent?.toFixed(2) ?? 'N/A'}%`,
    `Total gangguan: ${report.executiveSummary.totalIncidents}`,
    `Gangguan masih berjalan: ${report.executiveSummary.currentOpenIncidents}`,
    `Total waktu gangguan: ${formatDuration(report.executiveSummary.totalDowntimeSeconds)}`,
    `Catatan operasional: ${report.executiveSummary.auditEvents}`,
  ];
  for (const item of summaryItems) {
    page.drawText(`- ${item}`, { x: 52, y, size: 11, color: rgb(0.15, 0.2, 0.28) });
    y -= 15;
  }

  y -= 8;
  page.setFont(fontBold);
  page.drawText('Ketersediaan Layanan', { x: 42, y, size: 14, color: rgb(0.1, 0.16, 0.24) });
  y -= 22;
  page.setFont(font);
  for (const target of report.availability.targets.slice(0, 6)) {
    const line = `${target.label} | ketersediaan ${target.availabilityPercent.toFixed(2)}% | waktu gangguan ${formatDuration(target.downtimeSeconds)} | gangguan ${target.incidentsCount}`;
    y = drawWrappedText(page, font, line, 42, y, 510, 10, 13);
    y -= 4;
  }

  y -= 10;
  page.setFont(fontBold);
  page.drawText('Incident Berdampak Terbesar', { x: 42, y, size: 14, color: rgb(0.1, 0.16, 0.24) });
  y -= 22;
  page.setFont(font);
  for (const incident of report.topIncidents.slice(0, 5)) {
    const line = `${incident.title} | ${formatStatusLabel(incident.status)} | ${formatDuration(incident.impactedDurationSeconds)} | mulai ${formatDateTime(incident.startedAt)} UTC`;
    y = drawWrappedText(page, font, line, 42, y, 510, 10, 13);
    y -= 4;
  }

  y -= 10;
  page.setFont(fontBold);
  page.drawText('Rekomendasi', { x: 42, y, size: 14, color: rgb(0.1, 0.16, 0.24) });
  y -= 22;
  page.setFont(font);
  for (const recommendation of report.recommendations.slice(0, 4)) {
    const line = `${formatPriorityLabel(recommendation.priority)} - ${recommendation.title}: ${recommendation.detail}`;
    y = drawWrappedText(page, font, line, 42, y, 510, 10, 13);
    y -= 6;
  }

  page.drawText(`Window laporan: ${formatDateTime(report.window.start)} UTC s.d. ${formatDateTime(report.window.end)} UTC`, {
    x: 42,
    y: 36,
    size: 9,
    color: rgb(0.5, 0.56, 0.64),
  });

  let detail = addReportPage(pdf, font, fontBold, logo, logoDims, report);
  let detailPage = detail.page;
  let detailY = detail.y;
  const ensureDetailSpace = (height: number) => {
    if (detailY - height >= 62) return;
    detail = addReportPage(pdf, font, fontBold, logo, logoDims, report);
    detailPage = detail.page;
    detailY = detail.y;
  };

  detailY = drawSectionTitle(detailPage, fontBold, 'Kesehatan Operasional', detailY);
  if (report.operationalSummary.healthScores.length === 0) {
    detailY = drawWrappedText(
      detailPage,
      font,
      'Belum ada health score bulanan. Jalankan collector history secara periodik agar tren kesehatan dapat dihitung.',
      42,
      detailY,
      510,
      10,
      13,
    );
  } else {
    for (const score of report.operationalSummary.healthScores.slice(0, 5)) {
      ensureDetailSpace(36);
      const line = `${score.domainLabel}: rata-rata ${score.averageScore.toFixed(2)}, skor terakhir ${score.latestScore.toFixed(2)}, skor terendah ${score.worstScore.toFixed(2)}, status ${score.status}.`;
      detailY = drawWrappedText(detailPage, font, line, 42, detailY, 510, 10, 13);
      detailY -= 5;
    }
  }

  detailY -= 14;
  ensureDetailSpace(120);
  detailY = drawSectionTitle(detailPage, fontBold, 'Kapasitas dan Tren Sumber Daya', detailY);
  if (report.operationalSummary.capacity.length === 0) {
    detailY = drawWrappedText(detailPage, font, 'Belum ada data kapasitas harian untuk bulan ini.', 42, detailY, 510, 10, 13);
  } else {
    for (const item of report.operationalSummary.capacity.slice(0, 7)) {
      ensureDetailSpace(32);
      const line = `${item.metricLabel}: rata-rata ${formatMetricValue(item.averageValue, item.unit)}, puncak ${formatMetricValue(item.peakValue, item.unit)}, P95 ${formatMetricValue(item.p95Value, item.unit)}.`;
      detailY = drawWrappedText(detailPage, font, line, 42, detailY, 510, 10, 13);
      detailY -= 4;
    }
  }

  detailY -= 14;
  ensureDetailSpace(170);
  detailY = drawSectionTitle(detailPage, fontBold, 'Ketersediaan per Target', detailY);
  for (const target of report.availability.targets.slice(0, 12)) {
    ensureDetailSpace(34);
    const line = `${target.label}: ketersediaan ${target.availabilityPercent.toFixed(2)}%, waktu gangguan ${formatDuration(target.downtimeSeconds)}, gangguan ${target.incidentsCount}, status ${formatStatusLabel(target.status)}.`;
    detailY = drawWrappedText(detailPage, font, line, 42, detailY, 510, 10, 13);
    detailY -= 4;
  }

  detailY -= 14;
  ensureDetailSpace(150);
  detailY = drawSectionTitle(detailPage, fontBold, 'Incident Berdampak Terbesar', detailY);
  if (report.topIncidents.length === 0) {
    detailY = drawWrappedText(detailPage, font, 'Tidak ada incident tercatat pada periode laporan ini.', 42, detailY, 510, 10, 13);
  } else {
    for (const incident of report.topIncidents.slice(0, 8)) {
      ensureDetailSpace(44);
      const resolvedText = incident.resolvedAt ? `selesai ${formatDateTime(incident.resolvedAt)} UTC` : 'belum selesai';
      const line = `${incident.title}. Target: ${incident.label}. Tingkat: ${formatSeverityLabel(incident.severity)}. Status: ${formatStatusLabel(incident.status)}. Dampak: ${formatDuration(incident.impactedDurationSeconds)}, mulai ${formatDateTime(incident.startedAt)} UTC, ${resolvedText}.`;
      detailY = drawWrappedText(detailPage, font, line, 42, detailY, 510, 10, 13);
      detailY -= 5;
    }
  }

  detailY -= 14;
  ensureDetailSpace(120);
  detailY = drawSectionTitle(detailPage, fontBold, 'Catatan Operasional', detailY);
  detailY = drawWrappedText(
    detailPage,
    font,
    `Total catatan ${report.auditHighlights.totalEvents}; kritis ${report.auditHighlights.criticalEvents}; peringatan ${report.auditHighlights.warningEvents}.`,
    42,
    detailY,
    510,
    10,
    13,
  );
  detailY -= 7;
  for (const item of report.auditHighlights.topEventTypes) {
    ensureDetailSpace(24);
    detailY = drawWrappedText(detailPage, font, `${item.label}: ${item.count} kali.`, 42, detailY, 510, 10, 13);
    detailY -= 3;
  }

  detailY -= 14;
  ensureDetailSpace(130);
  detailY = drawSectionTitle(detailPage, fontBold, 'Catatan Perhitungan', detailY);
  const notes = [
    'Gangguan lintas bulan dihitung hanya pada durasi yang masuk ke periode laporan.',
    report.window.isPartialMonth
      ? 'Bulan ini masih berjalan, sehingga angka memakai data sampai waktu laporan dibuat.'
      : 'Periode laporan mencakup satu bulan kalender penuh.',
    'Ketersediaan dihitung dari total waktu gangguan dibandingkan waktu pemantauan target.',
  ];
  for (const note of notes) {
    ensureDetailSpace(24);
    detailY = drawWrappedText(detailPage, font, `- ${note}`, 42, detailY, 510, 10, 13);
    detailY -= 3;
  }

  return pdf.save();
}
