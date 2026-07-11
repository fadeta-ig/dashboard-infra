import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { dispatchIncidentAlert, type AlertIncidentSnapshot } from '@/lib/alerts';
import { executeStatement, getDatabaseUnavailableReason, getPool, isDatabaseConfigured, queryRows } from '@/lib/db';
import { buildNetworkMetrics, buildServerMetrics, buildTargets, nowIso, PROMQL } from '@/lib/metrics';
import { getMikrotikTemperatureRange, getMikrotikTemperatureSnapshot } from '@/lib/mikrotik-temperature';
import { prometheusInstantQuery, prometheusRangeQuery } from '@/lib/prometheus';
import { getReadinessSnapshot } from '@/lib/readiness';
import { getServiceHealthSnapshot } from '@/lib/service-health';
import { getMonitoringThresholds, thresholdStatus } from '@/lib/thresholds';
import { paginationMeta, paginationOffset, type PaginationMeta } from '@/lib/pagination';
import { mysqlDateTimeToIsoString as toIsoString, toMysqlDateTime, utcDateKey as toDateKey } from '@/lib/time';

export type IncidentSeverity = 'warning' | 'critical';
export type IncidentStatus = 'open' | 'resolved';
export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface IncidentRecord {
  id: number;
  source: string;
  domainKey: string;
  incidentKey: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  entityType: string;
  entityKey: string;
  entityLabel: string;
  startedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgementNote: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEventRecord {
  id: number;
  eventType: string;
  source: string;
  severity: AuditSeverity;
  entityKey: string;
  entityLabel: string;
  message: string;
  payload: Record<string, unknown>;
  eventAt: string;
  createdAt: string;
}

export interface HealthScoreRecord {
  id: number;
  scoreDate: string;
  domainKey: string;
  score: number;
  status: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CapacityDailyRecord {
  id: number;
  snapshotDate: string;
  metricKey: string;
  avgValue: number | null;
  peakValue: number | null;
  p95Value: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AlertDeliveryRecord {
  id: number;
  incidentKey: string;
  eventType: string;
  channel: string;
  status: string;
  attempts: number;
  lastError: string | null;
  deliveredAt: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface IncidentListSummary {
  total: number;
  open: number;
  resolved: number;
}

export interface IncidentListResult {
  incidents: IncidentRecord[];
  pagination: PaginationMeta;
  summary: IncidentListSummary;
}

export interface AuditListSummary {
  total: number;
  info: number;
  warning: number;
  critical: number;
}

export interface AuditListResult {
  events: AuditEventRecord[];
  pagination: PaginationMeta;
  summary: AuditListSummary;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS monitoring_incidents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(64) NOT NULL,
    domain_key VARCHAR(64) NOT NULL,
    incident_key VARCHAR(191) NOT NULL,
    title VARCHAR(191) NOT NULL,
    status VARCHAR(16) NOT NULL,
    severity VARCHAR(16) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_key VARCHAR(191) NOT NULL,
    entity_label VARCHAR(191) NOT NULL,
    started_at DATETIME NOT NULL,
    resolved_at DATETIME NULL,
    duration_seconds INT NULL,
    acknowledged_at DATETIME NULL,
    acknowledged_by VARCHAR(191) NULL,
    acknowledgement_note VARCHAR(255) NULL,
    open_incident_key VARCHAR(191) NULL,
    metadata_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_monitoring_incidents_open (open_incident_key),
    KEY idx_monitoring_incidents_status (status),
    KEY idx_monitoring_incidents_started_at (started_at),
    KEY idx_monitoring_incidents_entity_key (entity_key)
  )`,
  `CREATE TABLE IF NOT EXISTS monitoring_audit_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    source VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL,
    entity_key VARCHAR(191) NOT NULL,
    entity_label VARCHAR(191) NOT NULL,
    message VARCHAR(255) NOT NULL,
    payload_json JSON NULL,
    event_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_monitoring_audit_events_type (event_type),
    KEY idx_monitoring_audit_events_event_at (event_at)
  )`,
  `CREATE TABLE IF NOT EXISTS monitoring_state_snapshots (
    state_key VARCHAR(128) NOT NULL PRIMARY KEY,
    state_json JSON NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS report_snapshots (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    report_month VARCHAR(7) NOT NULL,
    report_type VARCHAR(32) NOT NULL,
    payload_json JSON NOT NULL,
    generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_report_snapshot (report_month, report_type)
  )`,
  `CREATE TABLE IF NOT EXISTS health_scores (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    score_date DATE NOT NULL,
    domain_key VARCHAR(64) NOT NULL,
    score DECIMAL(5,2) NOT NULL,
    status VARCHAR(16) NOT NULL,
    payload_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_health_score (score_date, domain_key)
  )`,
  `CREATE TABLE IF NOT EXISTS capacity_daily (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    metric_key VARCHAR(128) NOT NULL,
    avg_value DECIMAL(12,4) NULL,
    peak_value DECIMAL(12,4) NULL,
    p95_value DECIMAL(12,4) NULL,
    payload_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_capacity_daily (snapshot_date, metric_key)
  )`,
  `CREATE TABLE IF NOT EXISTS monitoring_alert_deliveries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    incident_key VARCHAR(191) NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    channel VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    last_error VARCHAR(255) NULL,
    delivered_at DATETIME NULL,
    payload_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_monitoring_alert_deliveries_incident (incident_key),
    KEY idx_monitoring_alert_deliveries_event (event_type),
    KEY idx_monitoring_alert_deliveries_created_at (created_at)
  )`,
];

function safeJsonParse(value: unknown) {
  if (typeof value !== 'string') return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, round(value, 2)));
}

async function columnExists(tableName: string, columnName: string) {
  const rows = await queryRows<RowDataPacket & { count_value: number }>(
    `SELECT COUNT(*) AS count_value
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  return Number(rows[0]?.count_value || 0) > 0;
}

async function indexExists(tableName: string, indexName: string) {
  const rows = await queryRows<RowDataPacket & { count_value: number }>(
    `SELECT COUNT(*) AS count_value
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [tableName, indexName],
  );
  return Number(rows[0]?.count_value || 0) > 0;
}

async function ensureColumn(tableName: string, columnName: string, statement: string) {
  if (await columnExists(tableName, columnName)) return;
  await executeStatement(statement);
}

async function ensureIndex(tableName: string, indexName: string, statement: string) {
  if (await indexExists(tableName, indexName)) return;
  await executeStatement(statement);
}

async function ensureMonitoringMigrations() {
  await ensureColumn(
    'monitoring_incidents',
    'acknowledged_at',
    'ALTER TABLE monitoring_incidents ADD COLUMN acknowledged_at DATETIME NULL AFTER duration_seconds',
  );
  await ensureColumn(
    'monitoring_incidents',
    'acknowledged_by',
    'ALTER TABLE monitoring_incidents ADD COLUMN acknowledged_by VARCHAR(191) NULL AFTER acknowledged_at',
  );
  await ensureColumn(
    'monitoring_incidents',
    'acknowledgement_note',
    'ALTER TABLE monitoring_incidents ADD COLUMN acknowledgement_note VARCHAR(255) NULL AFTER acknowledged_by',
  );
  await ensureColumn(
    'monitoring_incidents',
    'open_incident_key',
    'ALTER TABLE monitoring_incidents ADD COLUMN open_incident_key VARCHAR(191) NULL AFTER acknowledgement_note',
  );

  await executeStatement(
    `UPDATE monitoring_incidents
     SET open_incident_key = incident_key
     WHERE status = 'open' AND open_incident_key IS NULL`,
  );
  await executeStatement(
    `UPDATE monitoring_incidents duplicate_row
     JOIN monitoring_incidents keeper
       ON keeper.incident_key = duplicate_row.incident_key
      AND keeper.status = 'open'
      AND keeper.id < duplicate_row.id
     SET duplicate_row.open_incident_key = NULL
     WHERE duplicate_row.status = 'open'`,
  );

  await ensureIndex(
    'monitoring_incidents',
    'uniq_monitoring_incidents_open',
    'ALTER TABLE monitoring_incidents ADD UNIQUE KEY uniq_monitoring_incidents_open (open_incident_key)',
  );
}

export async function ensureMonitoringSchema() {
  if (!isDatabaseConfigured()) {
    throw new Error(getDatabaseUnavailableReason() || 'Database unavailable');
  }

  const connection = await getPool().getConnection();
  try {
    for (const statement of SCHEMA_STATEMENTS) {
      await connection.execute(statement);
    }
  } finally {
    connection.release();
  }

  await ensureMonitoringMigrations();
}

async function getStoredState<T>(stateKey: string): Promise<T | null> {
  const rows = await queryRows<RowDataPacket & { state_json: string }>(
    'SELECT state_json FROM monitoring_state_snapshots WHERE state_key = ? LIMIT 1',
    [stateKey],
  );
  if (rows.length === 0) return null;
  return safeJsonParse(rows[0].state_json) as T;
}

async function setStoredState(stateKey: string, value: unknown) {
  await executeStatement(
    `INSERT INTO monitoring_state_snapshots (state_key, state_json)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)`,
    [stateKey, JSON.stringify(value)],
  );
}

async function getOpenIncidentMap() {
  const rows = await queryRows<RowDataPacket & {
    id: number;
    source: string;
    domain_key: string;
    incident_key: string;
    title: string;
    severity: IncidentSeverity;
    entity_type: string;
    entity_key: string;
    entity_label: string;
    started_at: Date | string;
    metadata_json: string | null;
  }>(
    `SELECT id, source, domain_key, incident_key, title, severity, entity_type, entity_key, entity_label, started_at, metadata_json
     FROM monitoring_incidents
     WHERE status = "open" AND open_incident_key IS NOT NULL
     ORDER BY started_at ASC`,
  );
  return new Map(rows.map((row) => [row.incident_key, row]));
}

async function insertIncident(params: {
  source: string;
  domainKey: string;
  incidentKey: string;
  title: string;
  severity: IncidentSeverity;
  entityType: string;
  entityKey: string;
  entityLabel: string;
  startedAtIso: string;
  metadata: Record<string, unknown>;
}): Promise<boolean> {
  const [result] = await getPool().execute<ResultSetHeader>(
    `INSERT IGNORE INTO monitoring_incidents
      (source, domain_key, incident_key, title, status, severity, entity_type, entity_key, entity_label, started_at, open_incident_key, metadata_json)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.source,
      params.domainKey,
      params.incidentKey,
      params.title,
      params.severity,
      params.entityType,
      params.entityKey,
      params.entityLabel,
      toMysqlDateTime(params.startedAtIso),
      params.incidentKey,
      JSON.stringify(params.metadata),
    ],
  );
  return result.affectedRows > 0;
}

async function updateOpenIncident(params: {
  id: number;
  title: string;
  severity: IncidentSeverity;
  metadata: Record<string, unknown>;
}) {
  await executeStatement(
    `UPDATE monitoring_incidents
     SET title = ?,
         severity = ?,
         metadata_json = ?
     WHERE id = ? AND status = 'open'`,
    [params.title, params.severity, JSON.stringify(params.metadata), params.id],
  );
}

async function resolveIncident(id: number, startedAt: Date | string, resolvedAtIso: string, metadata: Record<string, unknown>) {
  const started = new Date(toIsoString(startedAt) as string);
  const resolved = new Date(resolvedAtIso);
  const durationSeconds = Math.max(0, Math.round((resolved.getTime() - started.getTime()) / 1000));
  await executeStatement(
    `UPDATE monitoring_incidents
     SET status = 'resolved',
         resolved_at = ?,
         duration_seconds = ?,
         open_incident_key = NULL,
         metadata_json = ?
     WHERE id = ?`,
    [toMysqlDateTime(resolvedAtIso), durationSeconds, JSON.stringify(metadata), id],
  );
}

async function insertAuditEvent(params: {
  eventType: string;
  source: string;
  severity: AuditSeverity;
  entityKey: string;
  entityLabel: string;
  message: string;
  payload: Record<string, unknown>;
  eventAtIso: string;
}) {
  await executeStatement(
    `INSERT INTO monitoring_audit_events
      (event_type, source, severity, entity_key, entity_label, message, payload_json, event_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.eventType,
      params.source,
      params.severity,
      params.entityKey,
      params.entityLabel,
      params.message,
      JSON.stringify(params.payload),
      toMysqlDateTime(params.eventAtIso),
    ],
  );
}

function buildServiceStateMap(snapshot: Awaited<ReturnType<typeof getServiceHealthSnapshot>>) {
  return Object.fromEntries(
    snapshot.services.map((service) => [
      service.key,
      {
        unit: service.unit,
        state: service.state,
        active: service.active,
        metricAvailable: service.metricAvailable,
      },
    ]),
  );
}

async function collectCurrentState() {
  const [
    targetsData,
    pingStatusData,
    pingLatencyData,
    cpuData,
    ramUsageData,
    ramAvailData,
    diskData,
    loadData,
    uptimeData,
    load5Data,
    load15Data,
    cpuCoreCountData,
    swapUsageData,
    swapUsedGbData,
    swapTotalGbData,
    diskReadData,
    diskWriteData,
    netRxData,
    netTxData,
    rebootData,
    hwmonTemperatureData,
    thermalZoneTemperatureData,
    mikrotikTemperature,
    serviceSnapshot,
    readinessSnapshot,
  ] = await Promise.all([
    prometheusInstantQuery(PROMQL.up),
    prometheusInstantQuery(PROMQL.pingSuccess),
    prometheusInstantQuery(PROMQL.pingLatency),
    prometheusInstantQuery(PROMQL.cpuUsage),
    prometheusInstantQuery(PROMQL.ramUsage),
    prometheusInstantQuery(PROMQL.ramAvailableGb),
    prometheusInstantQuery(PROMQL.diskRootUsage),
    prometheusInstantQuery(PROMQL.load1),
    prometheusInstantQuery(PROMQL.uptimeSeconds),
    prometheusInstantQuery(PROMQL.load5),
    prometheusInstantQuery(PROMQL.load15),
    prometheusInstantQuery(PROMQL.cpuCoreCount),
    prometheusInstantQuery(PROMQL.swapUsagePercent),
    prometheusInstantQuery(PROMQL.swapUsedGb),
    prometheusInstantQuery(PROMQL.swapTotalGb),
    prometheusInstantQuery(PROMQL.diskReadBytesPerSec),
    prometheusInstantQuery(PROMQL.diskWriteBytesPerSec),
    prometheusInstantQuery(PROMQL.netRxBytesPerSec),
    prometheusInstantQuery(PROMQL.netTxBytesPerSec),
    prometheusInstantQuery(PROMQL.rebootRequired),
    prometheusInstantQuery(PROMQL.hwmonTemperature),
    prometheusInstantQuery(PROMQL.thermalZoneTemperature),
    getMikrotikTemperatureSnapshot(),
    getServiceHealthSnapshot(),
    getReadinessSnapshot(),
  ]);

  return {
    timestamp: nowIso(),
    targets: buildTargets(targetsData, nowIso()),
    network: buildNetworkMetrics(pingStatusData, pingLatencyData, nowIso()),
    mikrotikTemperature,
    server: buildServerMetrics(
      cpuData,
      ramUsageData,
      ramAvailData,
      diskData,
      loadData,
      uptimeData,
      load5Data,
      load15Data,
      cpuCoreCountData,
      swapUsageData,
      swapUsedGbData,
      swapTotalGbData,
      diskReadData,
      diskWriteData,
      netRxData,
      netTxData,
      rebootData,
      hwmonTemperatureData,
      thermalZoneTemperatureData,
    ),
    services: serviceSnapshot,
    readiness: readinessSnapshot,
  };
}

function evaluateScoreStatus(score: number) {
  if (score >= 90) return 'healthy';
  if (score >= 75) return 'warning';
  return 'critical';
}

async function upsertHealthScore(scoreDate: string, domainKey: string, score: number, payload: Record<string, unknown>) {
  const status = evaluateScoreStatus(score);
  await executeStatement(
    `INSERT INTO health_scores (score_date, domain_key, score, status, payload_json)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE score = VALUES(score), status = VALUES(status), payload_json = VALUES(payload_json)`,
    [scoreDate, domainKey, score, status, JSON.stringify(payload)],
  );
}

function buildHealthScores(snapshot: Awaited<ReturnType<typeof collectCurrentState>>) {
  const thresholds = getMonitoringThresholds();
  const scores: Array<{ domainKey: string; score: number; payload: Record<string, unknown> }> = [];

  const serverPenalty =
    (snapshot.server.status === 'critical' ? 35 : snapshot.server.status === 'warning' ? 15 : 0) +
    (snapshot.server.rebootRequired ? 10 : 0) +
    snapshot.services.services.filter((service) => service.required && service.active === false).length * 20 +
    snapshot.services.missingRequired.length * 10;
  scores.push({
    domainKey: 'server',
    score: clampScore(100 - serverPenalty),
    payload: {
      status: snapshot.server.status,
      rebootRequired: snapshot.server.rebootRequired,
      missingRequiredServices: snapshot.services.missingRequired,
    },
  });

  const networkDownCount = snapshot.network.additionalTargets.filter((target) => target.up === false).length;
  const networkPenalty =
    (snapshot.network.gateway.up === false ? 35 : 0) +
    networkDownCount * 5;
  scores.push({
    domainKey: 'network',
    score: clampScore(100 - networkPenalty),
    payload: {
      gateway: snapshot.network.gateway.up,
      additionalDownCount: networkDownCount,
    },
  });

  const internetPenalty = snapshot.network.internetStatus === 'critical'
    ? 50
    : snapshot.network.internetStatus === 'degraded'
      ? 20
      : snapshot.network.internetStatus === 'unknown'
        ? 30
        : 0;
  scores.push({
    domainKey: 'internet',
    score: clampScore(100 - internetPenalty),
    payload: {
      internetStatus: snapshot.network.internetStatus,
      googleDns: snapshot.network.googleDns.up,
      cloudflareDns: snapshot.network.cloudflareDns.up,
    },
  });

  const prometheusDownTargets = snapshot.targets.filter((target) => !target.up).length;
  const prometheusPenalty =
    (!snapshot.readiness.prometheusReachable ? 50 : 0) +
    snapshot.readiness.categories.filter((category) => category.status === 'missing').length * 15 +
    snapshot.readiness.categories.filter((category) => category.status === 'partial').length * 8 +
    Math.min(prometheusDownTargets * 3, 30);
  scores.push({
    domainKey: 'prometheus',
    score: clampScore(100 - prometheusPenalty),
    payload: {
      prometheusReachable: snapshot.readiness.prometheusReachable,
      downTargets: prometheusDownTargets,
      readiness: snapshot.readiness.categories.map((category) => ({
        key: category.key,
        status: category.status,
      })),
    },
  });

  const mikrotikTargets = snapshot.targets.filter((target) => /mikrotik|snmp/i.test(target.job));
  const mikrotikDownTargets = mikrotikTargets.filter((target) => !target.up).length;
  const mikrotikTemperaturePenalty =
    snapshot.mikrotikTemperature.temperatureCelsius !== null && snapshot.mikrotikTemperature.temperatureCelsius >= thresholds.mikrotik.temperatureCelsius.critical
      ? 20
      : snapshot.mikrotikTemperature.temperatureCelsius !== null && snapshot.mikrotikTemperature.temperatureCelsius >= thresholds.mikrotik.temperatureCelsius.warning
        ? 10
        : 0;
  const mikrotikScore = mikrotikTargets.length === 0
    ? clampScore(75 - mikrotikTemperaturePenalty)
    : clampScore(100 - Math.min(mikrotikDownTargets * 25, 75) - mikrotikTemperaturePenalty);
  scores.push({
    domainKey: 'mikrotik',
    score: mikrotikScore,
    payload: {
      totalTargets: mikrotikTargets.length,
      downTargets: mikrotikDownTargets,
      temperatureCelsius: snapshot.mikrotikTemperature.temperatureCelsius,
      temperatureMetric: snapshot.mikrotikTemperature.metricName,
    },
  });

  return scores;
}

function extractMatrixValues(data: Awaited<ReturnType<typeof prometheusRangeQuery>>) {
  if (!data || data.resultType !== 'matrix' || data.result.length === 0) return [] as number[];
  return data.result[0].values
    .map(([, value]) => Number.parseFloat(value))
    .filter((value) => Number.isFinite(value));
}

function calculateP95(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[index];
}

async function upsertCapacityDaily(snapshotDate: string, metricKey: string, values: number[], payload: Record<string, unknown>) {
  const avgValue = values.length > 0 ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 4) : null;
  const peakValue = values.length > 0 ? round(Math.max(...values), 4) : null;
  const p95Value = values.length > 0 ? round(calculateP95(values) ?? 0, 4) : null;

  await executeStatement(
    `INSERT INTO capacity_daily (snapshot_date, metric_key, avg_value, peak_value, p95_value, payload_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       avg_value = VALUES(avg_value),
       peak_value = VALUES(peak_value),
       p95_value = VALUES(p95_value),
       payload_json = VALUES(payload_json)`,
    [snapshotDate, metricKey, avgValue, peakValue, p95Value, JSON.stringify(payload)],
  );
}

async function updateCapacitySnapshots(snapshot: Awaited<ReturnType<typeof collectCurrentState>>) {
  const snapshotDate = toDateKey(snapshot.timestamp);
  const start = Math.floor(new Date(`${snapshotDate}T00:00:00.000Z`).getTime() / 1000);
  const end = Math.floor(new Date(snapshot.timestamp).getTime() / 1000);
  const step = '15m';

  const [
    cpuRange,
    ramRange,
    diskRange,
    netRxRange,
    netTxRange,
    tempRange,
    mikrotikTempRange,
  ] = await Promise.all([
    prometheusRangeQuery(PROMQL.cpuUsage, start, end, step),
    prometheusRangeQuery(PROMQL.ramUsage, start, end, step),
    prometheusRangeQuery(PROMQL.diskRootUsage, start, end, step),
    prometheusRangeQuery(PROMQL.netRxBytesPerSec, start, end, step),
    prometheusRangeQuery(PROMQL.netTxBytesPerSec, start, end, step),
    prometheusRangeQuery(PROMQL.hwmonTemperature, start, end, step),
    getMikrotikTemperatureRange(start, end, step),
  ]);

  await Promise.all([
    upsertCapacityDaily(snapshotDate, 'server_cpu_percent', extractMatrixValues(cpuRange), { unit: 'percent' }),
    upsertCapacityDaily(snapshotDate, 'server_ram_percent', extractMatrixValues(ramRange), { unit: 'percent' }),
    upsertCapacityDaily(snapshotDate, 'server_disk_root_percent', extractMatrixValues(diskRange), { unit: 'percent' }),
    upsertCapacityDaily(snapshotDate, 'server_net_rx_bytes_per_sec', extractMatrixValues(netRxRange), { unit: 'bytes_per_sec' }),
    upsertCapacityDaily(snapshotDate, 'server_net_tx_bytes_per_sec', extractMatrixValues(netTxRange), { unit: 'bytes_per_sec' }),
    upsertCapacityDaily(snapshotDate, 'server_temperature_celsius', extractMatrixValues(tempRange), { unit: 'celsius', note: 'VM sensor may be unavailable' }),
    upsertCapacityDaily(snapshotDate, 'mikrotik_temperature_celsius', mikrotikTempRange.values, { unit: 'celsius', metric: mikrotikTempRange.metricName }),
  ]);
}

interface IncidentCandidate {
  active: boolean | null;
  source: string;
  domainKey: string;
  incidentKey: string;
  title: string;
  severity: IncidentSeverity;
  entityType: string;
  entityKey: string;
  entityLabel: string;
  metadata: Record<string, unknown>;
  notifyOnOpen?: boolean;
  notifyOnResolved?: boolean;
}

interface LatencyToleranceState {
  active: boolean;
  activeSinceIso: string | null;
  lastSeenIso: string | null;
  lastStatus: string | null;
  lastValue: number | null;
}

const DEFAULT_LATENCY_TOLERANT_DOMAINS = ['fingerprint', 'cctv'];
const DEFAULT_LATENCY_TOLERANT_WARNING_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_LATENCY_TOLERANT_CRITICAL_AFTER_MS = 8 * 60 * 60 * 1000;

function readDurationMs(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readCsvEnv(name: string, fallback: string[]) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const values = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return values.length > 0 ? values : fallback;
}

function latencyToleranceConfig() {
  return {
    domains: readCsvEnv('THRESHOLD_NETWORK_LATENCY_TOLERANT_DOMAINS', DEFAULT_LATENCY_TOLERANT_DOMAINS),
    warningAfterMs: readDurationMs('THRESHOLD_NETWORK_LATENCY_TOLERANT_WARNING_AFTER_MS', DEFAULT_LATENCY_TOLERANT_WARNING_AFTER_MS),
    criticalAfterMs: readDurationMs('THRESHOLD_NETWORK_LATENCY_TOLERANT_CRITICAL_AFTER_MS', DEFAULT_LATENCY_TOLERANT_CRITICAL_AFTER_MS),
  };
}

function isLatencyToleranceCandidate(candidate: IncidentCandidate) {
  if (candidate.source !== 'threshold' || !candidate.entityKey.startsWith('latency_ms:')) return false;
  return latencyToleranceConfig().domains.includes(candidate.domainKey.toLowerCase());
}

function severityFromStatus(status: 'healthy' | 'warning' | 'critical' | 'unknown') {
  if (status === 'critical') return 'critical';
  if (status === 'warning') return 'warning';
  return null;
}

function thresholdCandidate(params: {
  domainKey: string;
  metricKey: string;
  label: string;
  value: number | null;
  unit: string;
  warning: number;
  critical: number;
}): IncidentCandidate {
  const status = thresholdStatus(params.value, {
    warning: params.warning,
    critical: params.critical,
  });
  const severity = severityFromStatus(status);

  return {
    active: status === 'unknown' ? null : severity !== null,
    source: 'threshold',
    domainKey: params.domainKey,
    incidentKey: `threshold:${params.domainKey}:${params.metricKey}`,
    title: `${params.label} melewati threshold`,
    severity: severity || 'warning',
    entityType: 'metric',
    entityKey: params.metricKey,
    entityLabel: params.label,
    metadata: {
      value: params.value,
      unit: params.unit,
      warning: params.warning,
      critical: params.critical,
      status,
    },
  };
}

function buildThresholdIncidentCandidates(snapshot: Awaited<ReturnType<typeof collectCurrentState>>): IncidentCandidate[] {
  const thresholds = getMonitoringThresholds();
  const candidates: IncidentCandidate[] = [
    thresholdCandidate({
      domainKey: 'server',
      metricKey: 'cpu_usage_percent',
      label: 'CPU server',
      value: snapshot.server.cpuUsage,
      unit: 'percent',
      ...thresholds.server.cpuUsagePercent,
    }),
    thresholdCandidate({
      domainKey: 'server',
      metricKey: 'ram_usage_percent',
      label: 'RAM server',
      value: snapshot.server.ramUsage,
      unit: 'percent',
      ...thresholds.server.ramUsagePercent,
    }),
    thresholdCandidate({
      domainKey: 'server',
      metricKey: 'disk_root_usage_percent',
      label: 'Disk root server',
      value: snapshot.server.diskUsage,
      unit: 'percent',
      ...thresholds.server.diskUsagePercent,
    }),
    thresholdCandidate({
      domainKey: 'server',
      metricKey: 'load1',
      label: 'Load average 1 menit',
      value: snapshot.server.load1,
      unit: 'load',
      ...thresholds.server.load1,
    }),
    thresholdCandidate({
      domainKey: 'server',
      metricKey: 'temperature_celsius',
      label: 'Suhu server',
      value: snapshot.server.temperatureCelsius,
      unit: 'celsius',
      ...thresholds.server.temperatureCelsius,
    }),
    thresholdCandidate({
      domainKey: 'mikrotik',
      metricKey: 'temperature_celsius',
      label: 'Suhu MikroTik',
      value: snapshot.mikrotikTemperature.temperatureCelsius,
      unit: 'celsius',
      ...thresholds.mikrotik.temperatureCelsius,
    }),
  ];

  for (const target of [
    snapshot.network.gateway,
    snapshot.network.googleDns,
    snapshot.network.cloudflareDns,
    ...snapshot.network.additionalTargets,
  ]) {
    const key = target.target.replace(/[^a-z0-9_.-]/gi, '_');
    const candidate = thresholdCandidate({
      domainKey: target.category || 'network',
      metricKey: `latency_ms:${key}`,
      label: `Latency ${target.label || target.target}`,
      value: target.latencyMs,
      unit: 'ms',
      ...thresholds.network.pingMs,
    });
    candidate.metadata = {
      ...candidate.metadata,
      target: target.target,
      targetUp: target.up,
    };
    if (target.up === false && target.latencyMs === null) {
      candidate.active = true;
      candidate.severity = 'critical';
      candidate.metadata.status = 'timeout';
    }
    candidates.push(candidate);
  }

  return candidates;
}

function targetIncidentCandidate(target: ReturnType<typeof buildTargets>[number]): IncidentCandidate {
  const incidentKey = `target:${target.job}:${target.instance}`;
  return {
    active: target.up === null ? null : !target.up,
    source: 'prometheus',
    domainKey: 'prometheus',
    incidentKey,
    title: `Target down: ${target.job} / ${target.instance}`,
    severity: 'critical',
    entityType: 'target',
    entityKey: incidentKey,
    entityLabel: `${target.job} / ${target.instance}`,
    metadata: {
      value: target.value,
      lastChecked: target.lastChecked,
    },
  };
}

function candidateToAlertSnapshot(
  candidate: IncidentCandidate,
  status: 'open' | 'resolved',
  startedAtIso: string,
  resolvedAtIso: string | null = null,
): AlertIncidentSnapshot {
  return {
    incidentKey: candidate.incidentKey,
    title: candidate.title,
    severity: candidate.severity,
    status,
    source: candidate.source,
    domainKey: candidate.domainKey,
    entityType: candidate.entityType,
    entityKey: candidate.entityKey,
    entityLabel: candidate.entityLabel,
    startedAt: startedAtIso,
    resolvedAt: resolvedAtIso,
    metadata: candidate.metadata,
  };
}

function openRowToAlertSnapshot(
  row: Awaited<ReturnType<typeof getOpenIncidentMap>> extends Map<string, infer T> ? T : never,
  resolvedAtIso: string,
): AlertIncidentSnapshot {
  return {
    incidentKey: row.incident_key,
    title: row.title,
    severity: row.severity,
    status: 'resolved',
    source: row.source,
    domainKey: row.domain_key,
    entityType: row.entity_type,
    entityKey: row.entity_key,
    entityLabel: row.entity_label,
    startedAt: toIsoString(row.started_at) as string,
    resolvedAt: resolvedAtIso,
    metadata: safeJsonParse(row.metadata_json),
  };
}

async function applyLatencyTolerance(candidate: IncidentCandidate, timestamp: string): Promise<IncidentCandidate> {
  if (!isLatencyToleranceCandidate(candidate)) return candidate;

  const config = latencyToleranceConfig();
  const stateKey = `latency:tolerance:${candidate.incidentKey}`;
  const currentStatus = String(candidate.metadata.status || 'unknown');

  if (candidate.active !== true) {
    await setStoredState(stateKey, {
      active: false,
      activeSinceIso: null,
      lastSeenIso: timestamp,
      lastStatus: currentStatus,
      lastValue: typeof candidate.metadata.value === 'number' ? candidate.metadata.value : null,
    } satisfies LatencyToleranceState);
    return {
      ...candidate,
      metadata: {
        ...candidate.metadata,
        tolerance: {
          enabled: true,
          resetAt: timestamp,
          warningAfterMs: config.warningAfterMs,
          criticalAfterMs: config.criticalAfterMs,
        },
      },
    };
  }

  const previousState = await getStoredState<LatencyToleranceState>(stateKey);
  const activeSinceIso = previousState?.active && previousState.activeSinceIso ? previousState.activeSinceIso : timestamp;
  const badForMs = Math.max(0, new Date(timestamp).getTime() - new Date(activeSinceIso).getTime());
  const latestValue = typeof candidate.metadata.value === 'number' ? candidate.metadata.value : null;
  await setStoredState(stateKey, {
    active: true,
    activeSinceIso,
    lastSeenIso: timestamp,
    lastStatus: currentStatus,
    lastValue: latestValue,
  } satisfies LatencyToleranceState);

  const toleranceMetadata = {
    enabled: true,
    activeSince: activeSinceIso,
    badForSeconds: Math.round(badForMs / 1000),
    warningAfterMs: config.warningAfterMs,
    criticalAfterMs: config.criticalAfterMs,
  };

  if (badForMs < config.warningAfterMs) {
    return {
      ...candidate,
      active: null,
      severity: 'warning',
      metadata: {
        ...candidate.metadata,
        status: 'suppressed_flap',
        tolerance: toleranceMetadata,
      },
      notifyOnOpen: false,
      notifyOnResolved: false,
    };
  }

  if (badForMs < config.criticalAfterMs) {
    return {
      ...candidate,
      active: true,
      severity: 'warning',
      title: `${candidate.entityLabel} tidak stabil`,
      metadata: {
        ...candidate.metadata,
        status: 'warning',
        tolerance: toleranceMetadata,
      },
      notifyOnOpen: false,
      notifyOnResolved: false,
    };
  }

  return {
    ...candidate,
    active: true,
    severity: 'critical',
    title: `${candidate.entityLabel} timeout lebih dari ${Math.round(config.criticalAfterMs / 3_600_000)} jam`,
    metadata: {
      ...candidate.metadata,
      status: 'critical_timeout',
      tolerance: toleranceMetadata,
    },
    notifyOnOpen: true,
    notifyOnResolved: true,
  };
}

async function processIncidentCandidate(
  rawCandidate: IncidentCandidate,
  openIncidents: Awaited<ReturnType<typeof getOpenIncidentMap>>,
  timestamp: string,
) {
  const candidate = await applyLatencyTolerance(rawCandidate, timestamp);
  const openIncident = openIncidents.get(candidate.incidentKey);

  if (candidate.active === true && !openIncident) {
    const inserted = await insertIncident({
      source: candidate.source,
      domainKey: candidate.domainKey,
      incidentKey: candidate.incidentKey,
      title: candidate.title,
      severity: candidate.severity,
      entityType: candidate.entityType,
      entityKey: candidate.entityKey,
      entityLabel: candidate.entityLabel,
      startedAtIso: timestamp,
      metadata: candidate.metadata,
    });

    if (!inserted) return { opened: 0, resolved: 0 };

    if (candidate.notifyOnOpen !== false) {
      await dispatchIncidentAlert('opened', candidateToAlertSnapshot(candidate, 'open', timestamp));
    }
    return { opened: 1, resolved: 0 };
  }

  if (candidate.active === true && openIncident) {
    if (openIncident.severity !== candidate.severity || openIncident.title !== candidate.title) {
      await updateOpenIncident({
        id: openIncident.id,
        title: candidate.title,
        severity: candidate.severity,
        metadata: candidate.metadata,
      });
      if (candidate.notifyOnOpen !== false && candidate.severity === 'critical' && openIncident.severity !== 'critical') {
        await dispatchIncidentAlert(
          'opened',
          candidateToAlertSnapshot(candidate, 'open', toIsoString(openIncident.started_at) as string),
        );
      }
    }
    return { opened: 0, resolved: 0 };
  }

  if (candidate.active === false && openIncident) {
    await resolveIncident(openIncident.id, openIncident.started_at, timestamp, {
      resolution: 'Condition recovered',
      latest: candidate.metadata,
    });
    if (candidate.notifyOnResolved !== false) {
      await dispatchIncidentAlert('resolved', openRowToAlertSnapshot(openIncident, timestamp));
    }
    return { opened: 0, resolved: 1 };
  }

  return { opened: 0, resolved: 0 };
}

export async function runHistoryCollection() {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      storageEnabled: false,
      message: getDatabaseUnavailableReason(),
    };
  }

  await ensureMonitoringSchema();
  const snapshot = await collectCurrentState();
  const openIncidents = await getOpenIncidentMap();
  let openedCount = 0;
  let resolvedCount = 0;
  let auditCount = 0;

  const incidentCandidates = [
    ...snapshot.targets.map(targetIncidentCandidate),
    ...buildThresholdIncidentCandidates(snapshot),
  ];

  for (const candidate of incidentCandidates) {
    const result = await processIncidentCandidate(candidate, openIncidents, snapshot.timestamp);
    openedCount += result.opened;
    resolvedCount += result.resolved;
  }

  const previousRebootState = await getStoredState<{ rebootRequired: boolean | null }>('server:reboot-required');
  if (previousRebootState?.rebootRequired !== snapshot.server.rebootRequired) {
    await insertAuditEvent({
      eventType: 'reboot_required_changed',
      source: 'server',
      severity: snapshot.server.rebootRequired ? 'warning' : 'info',
      entityKey: 'server:reboot-required',
      entityLabel: 'Server reboot required',
      message: snapshot.server.rebootRequired ? 'Server sekarang membutuhkan reboot.' : 'Status reboot required kembali normal.',
      payload: { rebootRequired: snapshot.server.rebootRequired },
      eventAtIso: snapshot.timestamp,
    });
    auditCount += 1;
  }
  await setStoredState('server:reboot-required', { rebootRequired: snapshot.server.rebootRequired });

  const previousServiceState = await getStoredState<Record<string, { state: string | null; active: boolean | null; metricAvailable: boolean }>>('services:health');
  const currentServiceState = buildServiceStateMap(snapshot.services);
  if (previousServiceState) {
    for (const [serviceKey, current] of Object.entries(currentServiceState)) {
      const previous = previousServiceState[serviceKey];
      if (!previous) continue;
      if (
        previous.state !== current.state ||
        previous.active !== current.active ||
        previous.metricAvailable !== current.metricAvailable
      ) {
        const service = snapshot.services.services.find((item) => item.key === serviceKey);
        await insertAuditEvent({
          eventType: 'service_state_changed',
          source: 'server',
          severity: current.active === false ? 'critical' : 'info',
          entityKey: `service:${serviceKey}`,
          entityLabel: service?.label || serviceKey,
          message: `Status service ${service?.label || serviceKey} berubah dari ${previous.state || 'unknown'} ke ${current.state || 'unknown'}.`,
          payload: { previous, current },
          eventAtIso: snapshot.timestamp,
        });
        auditCount += 1;
      }
    }
  }
  await setStoredState('services:health', currentServiceState);

  const previousCollectorState = await getStoredState<{ collectorAvailable: boolean; missingRequired: string[] }>('services:collector');
  const currentCollectorState = {
    collectorAvailable: snapshot.services.collectorAvailable,
    missingRequired: snapshot.services.missingRequired,
  };
  if (
    !previousCollectorState ||
    previousCollectorState.collectorAvailable !== currentCollectorState.collectorAvailable ||
    JSON.stringify(previousCollectorState.missingRequired) !== JSON.stringify(currentCollectorState.missingRequired)
  ) {
    await insertAuditEvent({
      eventType: 'collector_health_changed',
      source: 'server',
      severity: currentCollectorState.collectorAvailable ? 'info' : 'warning',
      entityKey: 'collector:node_systemd_unit_state',
      entityLabel: 'Systemd collector',
      message: currentCollectorState.collectorAvailable
        ? 'Collector systemd tersedia.'
        : 'Collector systemd tidak tersedia atau unit wajib belum termatch.',
      payload: currentCollectorState,
      eventAtIso: snapshot.timestamp,
    });
    auditCount += 1;
  }
  await setStoredState('services:collector', currentCollectorState);

  const previousReadinessState = await getStoredState<Record<string, { status: string; requiredReady: number; requiredTotal: number }>>('readiness:categories');
  const currentReadinessState = Object.fromEntries(
    snapshot.readiness.categories.map((category) => [
      category.key,
      {
        status: category.status,
        requiredReady: category.requiredReady,
        requiredTotal: category.requiredTotal,
      },
    ]),
  );
  if (previousReadinessState) {
    for (const [categoryKey, current] of Object.entries(currentReadinessState)) {
      const previous = previousReadinessState[categoryKey];
      if (!previous) continue;
      if (
        previous.status !== current.status ||
        previous.requiredReady !== current.requiredReady ||
        previous.requiredTotal !== current.requiredTotal
      ) {
        const category = snapshot.readiness.categories.find((item) => item.key === categoryKey);
        await insertAuditEvent({
          eventType: 'metric_gap_changed',
          source: 'prometheus',
          severity: current.status === 'missing' ? 'critical' : current.status === 'partial' ? 'warning' : 'info',
          entityKey: `readiness:${categoryKey}`,
          entityLabel: category?.title || categoryKey,
          message: `Readiness ${category?.title || categoryKey} berubah ke status ${current.status}.`,
          payload: { previous, current },
          eventAtIso: snapshot.timestamp,
        });
        auditCount += 1;
      }
    }
  }
  await setStoredState('readiness:categories', currentReadinessState);

  const scoreDate = toDateKey(snapshot.timestamp);
  for (const score of buildHealthScores(snapshot)) {
    await upsertHealthScore(scoreDate, score.domainKey, score.score, score.payload);
  }

  await updateCapacitySnapshots(snapshot);

  return {
    ok: true,
    storageEnabled: true,
    timestamp: snapshot.timestamp,
    openedCount,
    resolvedCount,
    auditCount,
  };
}

function normalizeStatusFilter(status: string | null | undefined): IncidentStatus | null {
  return status === 'open' || status === 'resolved' ? status : null;
}

function normalizeAuditSeverityFilter(severity: string | null | undefined): AuditSeverity | null {
  return severity === 'info' || severity === 'warning' || severity === 'critical' ? severity : null;
}

function mapIncidentRow(row: RowDataPacket & {
  id: number;
  source: string;
  domain_key: string;
  incident_key: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  entity_type: string;
  entity_key: string;
  entity_label: string;
  started_at: Date | string;
  resolved_at: Date | string | null;
  duration_seconds: number | null;
  acknowledged_at: Date | string | null;
  acknowledged_by: string | null;
  acknowledgement_note: string | null;
  metadata_json: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}) {
  return {
    id: row.id,
    source: row.source,
    domainKey: row.domain_key,
    incidentKey: row.incident_key,
    title: row.title,
    status: row.status,
    severity: row.severity,
    entityType: row.entity_type,
    entityKey: row.entity_key,
    entityLabel: row.entity_label,
    startedAt: toIsoString(row.started_at) as string,
    resolvedAt: toIsoString(row.resolved_at) as string | null,
    durationSeconds: row.duration_seconds,
    acknowledgedAt: toIsoString(row.acknowledged_at) as string | null,
    acknowledgedBy: row.acknowledged_by,
    acknowledgementNote: row.acknowledgement_note,
    metadata: safeJsonParse(row.metadata_json),
    createdAt: toIsoString(row.created_at) as string,
    updatedAt: toIsoString(row.updated_at) as string,
  } satisfies IncidentRecord;
}

async function getIncidentSummary(): Promise<IncidentListSummary> {
  const rows = await queryRows<RowDataPacket & {
    total: number | string;
    open_count: number | string | null;
    resolved_count: number | string | null;
  }>(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'open') AS open_count,
       SUM(status = 'resolved') AS resolved_count
     FROM monitoring_incidents`,
  );
  const row = rows[0];
  return {
    total: Number(row?.total || 0),
    open: Number(row?.open_count || 0),
    resolved: Number(row?.resolved_count || 0),
  };
}

export async function listIncidentsPage(options: {
  page?: number;
  pageSize?: number;
  status?: string | null;
} = {}): Promise<IncidentListResult> {
  await ensureMonitoringSchema();
  const statusFilter = normalizeStatusFilter(options.status);
  const whereSql = statusFilter ? 'WHERE status = ?' : '';
  const whereParams = statusFilter ? [statusFilter] : [];
  const countRows = await queryRows<RowDataPacket & { total: number | string }>(
    `SELECT COUNT(*) AS total FROM monitoring_incidents ${whereSql}`,
    whereParams,
  );
  const pagination = paginationMeta(Number(countRows[0]?.total || 0), options.page || 1, options.pageSize || 25);
  const offset = paginationOffset(pagination);
  const rows = await queryRows<RowDataPacket & {
    id: number;
    source: string;
    domain_key: string;
    incident_key: string;
    title: string;
    status: IncidentStatus;
    severity: IncidentSeverity;
    entity_type: string;
    entity_key: string;
    entity_label: string;
    started_at: Date | string;
    resolved_at: Date | string | null;
    duration_seconds: number | null;
    acknowledged_at: Date | string | null;
    acknowledged_by: string | null;
    acknowledgement_note: string | null;
    metadata_json: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `SELECT *
     FROM monitoring_incidents
     ${whereSql}
     ORDER BY started_at DESC
     LIMIT ${pagination.pageSize} OFFSET ${offset}`,
    whereParams,
  );

  return {
    incidents: rows.map(mapIncidentRow),
    pagination,
    summary: await getIncidentSummary(),
  };
}

export async function listIncidents(limit = 100) {
  const result = await listIncidentsPage({ page: 1, pageSize: limit });
  return result.incidents;
}

async function getIncidentById(id: number) {
  const rows = await queryRows<RowDataPacket & {
    id: number;
    source: string;
    domain_key: string;
    incident_key: string;
    title: string;
    status: IncidentStatus;
    severity: IncidentSeverity;
    entity_type: string;
    entity_key: string;
    entity_label: string;
    started_at: Date | string;
    resolved_at: Date | string | null;
    duration_seconds: number | null;
    acknowledged_at: Date | string | null;
    acknowledged_by: string | null;
    acknowledgement_note: string | null;
    metadata_json: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    'SELECT * FROM monitoring_incidents WHERE id = ? LIMIT 1',
    [id],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    source: row.source,
    domainKey: row.domain_key,
    incidentKey: row.incident_key,
    title: row.title,
    status: row.status,
    severity: row.severity,
    entityType: row.entity_type,
    entityKey: row.entity_key,
    entityLabel: row.entity_label,
    startedAt: toIsoString(row.started_at) as string,
    resolvedAt: toIsoString(row.resolved_at) as string | null,
    durationSeconds: row.duration_seconds,
    acknowledgedAt: toIsoString(row.acknowledged_at) as string | null,
    acknowledgedBy: row.acknowledged_by,
    acknowledgementNote: row.acknowledgement_note,
    metadata: safeJsonParse(row.metadata_json),
    createdAt: toIsoString(row.created_at) as string,
    updatedAt: toIsoString(row.updated_at) as string,
  } satisfies IncidentRecord;
}

export async function acknowledgeIncident(params: {
  id: number;
  actor: string;
  note: string | null;
}) {
  await ensureMonitoringSchema();

  const acknowledgedAtIso = nowIso();
  const actor = params.actor.trim().slice(0, 191);
  const note = params.note?.trim().slice(0, 255) || null;
  const [result] = await getPool().execute<ResultSetHeader>(
    `UPDATE monitoring_incidents
     SET acknowledged_at = COALESCE(acknowledged_at, ?),
         acknowledged_by = COALESCE(acknowledged_by, ?),
         acknowledgement_note = COALESCE(acknowledgement_note, ?)
     WHERE id = ? AND status = 'open'`,
    [toMysqlDateTime(acknowledgedAtIso), actor, note, params.id],
  );

  const incident = await getIncidentById(params.id);
  if (!incident) {
    return {
      ok: false,
      message: 'Incident tidak ditemukan.',
      incident: null,
      changed: false,
    };
  }

  const changed = result.affectedRows > 0 && incident.acknowledgedBy === actor;
  if (changed) {
    await insertAuditEvent({
      eventType: 'incident_acknowledged',
      source: 'operator',
      severity: 'info',
      entityKey: incident.incidentKey,
      entityLabel: incident.entityLabel,
      message: `Incident ${incident.entityLabel} di-acknowledge oleh ${actor}.`,
      payload: {
        incidentId: incident.id,
        incidentKey: incident.incidentKey,
        note,
      },
      eventAtIso: acknowledgedAtIso,
    });
  }

  return {
    ok: incident.status === 'open',
    message: incident.status === 'open' ? 'Incident sudah di-acknowledge.' : 'Incident sudah resolved dan tidak bisa di-acknowledge.',
    incident,
    changed,
  };
}

export async function listAuditEvents(limit = 100) {
  const result = await listAuditEventsPage({ page: 1, pageSize: limit });
  return result.events;
}

function mapAuditRow(row: RowDataPacket & {
  id: number;
  event_type: string;
  source: string;
  severity: AuditSeverity;
  entity_key: string;
  entity_label: string;
  message: string;
  payload_json: string | null;
  event_at: Date | string;
  created_at: Date | string;
}) {
  return {
    id: row.id,
    eventType: row.event_type,
    source: row.source,
    severity: row.severity,
    entityKey: row.entity_key,
    entityLabel: row.entity_label,
    message: row.message,
    payload: safeJsonParse(row.payload_json),
    eventAt: toIsoString(row.event_at) as string,
    createdAt: toIsoString(row.created_at) as string,
  } satisfies AuditEventRecord;
}

async function getAuditSummary(): Promise<AuditListSummary> {
  const rows = await queryRows<RowDataPacket & {
    total: number | string;
    info_count: number | string | null;
    warning_count: number | string | null;
    critical_count: number | string | null;
  }>(
    `SELECT
       COUNT(*) AS total,
       SUM(severity = 'info') AS info_count,
       SUM(severity = 'warning') AS warning_count,
       SUM(severity = 'critical') AS critical_count
     FROM monitoring_audit_events`,
  );
  const row = rows[0];
  return {
    total: Number(row?.total || 0),
    info: Number(row?.info_count || 0),
    warning: Number(row?.warning_count || 0),
    critical: Number(row?.critical_count || 0),
  };
}

export async function listAuditEventsPage(options: {
  page?: number;
  pageSize?: number;
  severity?: string | null;
} = {}): Promise<AuditListResult> {
  await ensureMonitoringSchema();
  const severityFilter = normalizeAuditSeverityFilter(options.severity);
  const whereSql = severityFilter ? 'WHERE severity = ?' : '';
  const whereParams = severityFilter ? [severityFilter] : [];
  const countRows = await queryRows<RowDataPacket & { total: number | string }>(
    `SELECT COUNT(*) AS total FROM monitoring_audit_events ${whereSql}`,
    whereParams,
  );
  const pagination = paginationMeta(Number(countRows[0]?.total || 0), options.page || 1, options.pageSize || 25);
  const offset = paginationOffset(pagination);
  const rows = await queryRows<RowDataPacket & {
    id: number;
    event_type: string;
    source: string;
    severity: AuditSeverity;
    entity_key: string;
    entity_label: string;
    message: string;
    payload_json: string | null;
    event_at: Date | string;
    created_at: Date | string;
  }>(
    `SELECT *
     FROM monitoring_audit_events
     ${whereSql}
     ORDER BY event_at DESC
     LIMIT ${pagination.pageSize} OFFSET ${offset}`,
    whereParams,
  );

  return {
    events: rows.map(mapAuditRow),
    pagination,
    summary: await getAuditSummary(),
  };
}

export async function listHealthScores(days = 14) {
  await ensureMonitoringSchema();
  const safeDays = Math.min(Math.max(days, 1), 90);
  const rows = await queryRows<RowDataPacket & {
    id: number;
    score_date: Date | string;
    domain_key: string;
    score: number | string;
    status: string;
    payload_json: string | null;
    created_at: Date | string;
  }>(
    `SELECT *
     FROM health_scores
     WHERE score_date >= DATE_SUB(UTC_DATE(), INTERVAL ${safeDays - 1} DAY)
     ORDER BY score_date DESC, domain_key ASC`,
  );

  return rows.map((row) => ({
    id: row.id,
    scoreDate: toIsoString(row.score_date) as string,
    domainKey: row.domain_key,
    score: typeof row.score === 'number' ? row.score : Number.parseFloat(row.score),
    status: row.status,
    payload: safeJsonParse(row.payload_json),
    createdAt: toIsoString(row.created_at) as string,
  })) satisfies HealthScoreRecord[];
}

export async function listCapacityDaily(days = 14) {
  await ensureMonitoringSchema();
  const safeDays = Math.min(Math.max(days, 1), 90);
  const rows = await queryRows<RowDataPacket & {
    id: number;
    snapshot_date: Date | string;
    metric_key: string;
    avg_value: number | string | null;
    peak_value: number | string | null;
    p95_value: number | string | null;
    payload_json: string | null;
    created_at: Date | string;
  }>(
    `SELECT *
     FROM capacity_daily
     WHERE snapshot_date >= DATE_SUB(UTC_DATE(), INTERVAL ${safeDays - 1} DAY)
     ORDER BY snapshot_date DESC, metric_key ASC`,
  );

  const toNumber = (value: number | string | null) =>
    value === null ? null : typeof value === 'number' ? value : Number.parseFloat(value);

  return rows.map((row) => ({
    id: row.id,
    snapshotDate: toIsoString(row.snapshot_date) as string,
    metricKey: row.metric_key,
    avgValue: toNumber(row.avg_value),
    peakValue: toNumber(row.peak_value),
    p95Value: toNumber(row.p95_value),
    payload: safeJsonParse(row.payload_json),
    createdAt: toIsoString(row.created_at) as string,
  })) satisfies CapacityDailyRecord[];
}
