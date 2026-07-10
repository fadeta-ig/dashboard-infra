import type { RowDataPacket } from 'mysql2/promise';
import { executeStatement, getDatabaseUnavailableReason, getPool, isDatabaseConfigured, queryRows } from '@/lib/db';
import { buildNetworkMetrics, buildServerMetrics, buildTargets, nowIso, PROMQL } from '@/lib/metrics';
import { prometheusInstantQuery, prometheusRangeQuery } from '@/lib/prometheus';
import { getReadinessSnapshot } from '@/lib/readiness';
import { getServiceHealthSnapshot } from '@/lib/service-health';
import { getMonitoringThresholds } from '@/lib/thresholds';

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
    metadata_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
];

function toMysqlDateTime(value: string) {
  return value.slice(0, 19).replace('T', ' ');
}

function safeJsonParse(value: unknown) {
  if (typeof value !== 'string') return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return value ?? null;
  return value instanceof Date ? value.toISOString() : value;
}

function toDateKey(value: string) {
  return value.slice(0, 10);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, round(value, 2)));
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
    incident_key: string;
    started_at: Date | string;
  }>(
    'SELECT id, incident_key, started_at FROM monitoring_incidents WHERE status = "open"',
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
}) {
  await executeStatement(
    `INSERT INTO monitoring_incidents
      (source, domain_key, incident_key, title, status, severity, entity_type, entity_key, entity_label, started_at, metadata_json)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
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
      JSON.stringify(params.metadata),
    ],
  );
}

async function resolveIncident(id: number, startedAt: Date | string, resolvedAtIso: string, metadata: Record<string, unknown>) {
  const started = new Date(startedAt);
  const resolved = new Date(resolvedAtIso);
  const durationSeconds = Math.max(0, Math.round((resolved.getTime() - started.getTime()) / 1000));
  await executeStatement(
    `UPDATE monitoring_incidents
     SET status = 'resolved',
         resolved_at = ?,
         duration_seconds = ?,
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
    getServiceHealthSnapshot(),
    getReadinessSnapshot(),
  ]);

  return {
    timestamp: nowIso(),
    targets: buildTargets(targetsData, nowIso()),
    network: buildNetworkMetrics(pingStatusData, pingLatencyData, nowIso()),
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
    (snapshot.server.temperatureCelsius !== null && snapshot.server.temperatureCelsius >= thresholds.server.temperatureCelsius.critical
      ? 20
      : snapshot.server.temperatureCelsius !== null && snapshot.server.temperatureCelsius >= thresholds.server.temperatureCelsius.warning
        ? 10
        : 0) +
    snapshot.services.services.filter((service) => service.required && service.active === false).length * 20 +
    snapshot.services.missingRequired.length * 10;
  scores.push({
    domainKey: 'server',
    score: clampScore(100 - serverPenalty),
    payload: {
      status: snapshot.server.status,
      rebootRequired: snapshot.server.rebootRequired,
      temperatureCelsius: snapshot.server.temperatureCelsius,
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
  const mikrotikScore = mikrotikTargets.length === 0
    ? 75
    : clampScore(100 - Math.min(mikrotikDownTargets * 25, 75));
  scores.push({
    domainKey: 'mikrotik',
    score: mikrotikScore,
    payload: {
      totalTargets: mikrotikTargets.length,
      downTargets: mikrotikDownTargets,
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
  ] = await Promise.all([
    prometheusRangeQuery(PROMQL.cpuUsage, start, end, step),
    prometheusRangeQuery(PROMQL.ramUsage, start, end, step),
    prometheusRangeQuery(PROMQL.diskRootUsage, start, end, step),
    prometheusRangeQuery(PROMQL.netRxBytesPerSec, start, end, step),
    prometheusRangeQuery(PROMQL.netTxBytesPerSec, start, end, step),
    prometheusRangeQuery(PROMQL.hwmonTemperature, start, end, step),
  ]);

  await Promise.all([
    upsertCapacityDaily(snapshotDate, 'server_cpu_percent', extractMatrixValues(cpuRange), { unit: 'percent' }),
    upsertCapacityDaily(snapshotDate, 'server_ram_percent', extractMatrixValues(ramRange), { unit: 'percent' }),
    upsertCapacityDaily(snapshotDate, 'server_disk_root_percent', extractMatrixValues(diskRange), { unit: 'percent' }),
    upsertCapacityDaily(snapshotDate, 'server_net_rx_bytes_per_sec', extractMatrixValues(netRxRange), { unit: 'bytes_per_sec' }),
    upsertCapacityDaily(snapshotDate, 'server_net_tx_bytes_per_sec', extractMatrixValues(netTxRange), { unit: 'bytes_per_sec' }),
    upsertCapacityDaily(snapshotDate, 'server_temperature_celsius', extractMatrixValues(tempRange), { unit: 'celsius' }),
  ]);
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

  for (const target of snapshot.targets) {
    const incidentKey = `target:${target.job}:${target.instance}`;
    const openIncident = openIncidents.get(incidentKey);

    if (!target.up && !openIncident) {
      await insertIncident({
        source: 'prometheus',
        domainKey: 'prometheus',
        incidentKey,
        title: `Target down: ${target.job} / ${target.instance}`,
        severity: 'critical',
        entityType: 'target',
        entityKey: incidentKey,
        entityLabel: `${target.job} / ${target.instance}`,
        startedAtIso: snapshot.timestamp,
        metadata: {
          value: target.value,
          lastChecked: target.lastChecked,
        },
      });
      openedCount += 1;
      continue;
    }

    if (target.up && openIncident) {
      await resolveIncident(openIncident.id, openIncident.started_at, snapshot.timestamp, {
        resolution: 'Target responded again',
        lastChecked: target.lastChecked,
      });
      resolvedCount += 1;
    }
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

export async function listIncidents(limit = 100) {
  await ensureMonitoringSchema();
  const safeLimit = Math.min(Math.max(limit, 1), 500);
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
    metadata_json: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `SELECT *
     FROM monitoring_incidents
     ORDER BY started_at DESC
     LIMIT ${safeLimit}`,
  );

  return rows.map((row) => ({
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
    metadata: safeJsonParse(row.metadata_json),
    createdAt: toIsoString(row.created_at) as string,
    updatedAt: toIsoString(row.updated_at) as string,
  })) satisfies IncidentRecord[];
}

export async function listAuditEvents(limit = 100) {
  await ensureMonitoringSchema();
  const safeLimit = Math.min(Math.max(limit, 1), 500);
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
     ORDER BY event_at DESC
     LIMIT ${safeLimit}`,
  );

  return rows.map((row) => ({
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
  })) satisfies AuditEventRecord[];
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
