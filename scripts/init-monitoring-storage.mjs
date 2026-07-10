import mysql from 'mysql2/promise';

const DEFAULT_MYSQL_PORT = 3307;

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

  console.log(`Database '${database}' ready on ${host}:${port}.`);
  console.log('Tables initialized: monitoring_incidents, monitoring_audit_events, monitoring_state_snapshots, report_snapshots, health_scores, capacity_daily');
} finally {
  await rootConnection.end();
}
