import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const DEFAULT_MYSQL_PORT = 3307;

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

loadDotEnv();

function readEnv(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : fallback;
}

const host = readEnv('MYSQL_HOST', '127.0.0.1');
const portRaw = readEnv('MYSQL_PORT', String(DEFAULT_MYSQL_PORT));
const user = readEnv('MYSQL_USER', 'root');
const password = process.env.MYSQL_PASSWORD ?? '';
const database = readEnv('MYSQL_DATABASE', 'infra');
const port = Number.parseInt(portRaw, 10);

if (!database) {
  throw new Error('MYSQL_DATABASE wajib diisi.');
}

async function columnExists(tableName, columnName) {
  const [rows] = await rootConnection.execute(
    `SELECT COUNT(*) AS count_value
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  return Number(rows[0]?.count_value || 0) > 0;
}

async function indexExists(tableName, indexName) {
  const [rows] = await rootConnection.execute(
    `SELECT COUNT(*) AS count_value
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [tableName, indexName],
  );
  return Number(rows[0]?.count_value || 0) > 0;
}

async function ensureColumn(tableName, columnName, statement) {
  if (await columnExists(tableName, columnName)) return;
  await rootConnection.execute(statement);
}

async function ensureIndex(tableName, indexName, statement) {
  if (await indexExists(tableName, indexName)) return;
  await rootConnection.execute(statement);
}

async function runMigrations() {
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
  await rootConnection.execute(
    `UPDATE monitoring_incidents
     SET open_incident_key = incident_key
     WHERE status = 'open' AND open_incident_key IS NULL`,
  );
  await rootConnection.execute(
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

const schemaStatements = [
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
  `CREATE TABLE IF NOT EXISTS monitoring_config_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    item_type VARCHAR(64) NOT NULL,
    item_key VARCHAR(191) NOT NULL,
    label VARCHAR(191) NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    payload_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_monitoring_config_items_type_key (item_type, item_key),
    KEY idx_monitoring_config_items_type_enabled (item_type, enabled),
    KEY idx_monitoring_config_items_sort (item_type, sort_order)
  )`,
];

const rootConnection = await mysql.createConnection({
  host,
  port: Number.isFinite(port) ? port : DEFAULT_MYSQL_PORT,
  user,
  password,
});

try {
  await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await rootConnection.query(`USE \`${database}\``);

  for (const statement of schemaStatements) {
    await rootConnection.query(statement);
  }
  await runMigrations();

  console.log(`Database '${database}' ready on ${host}:${port}.`);
  console.log('Tables initialized: monitoring_incidents, monitoring_audit_events, monitoring_state_snapshots, report_snapshots, health_scores, capacity_daily, monitoring_alert_deliveries, monitoring_config_items');
} finally {
  await rootConnection.end();
}
