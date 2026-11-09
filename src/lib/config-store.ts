import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { ConfigError, normalizeConfigInput, type ConfigInput, type ConfigItemType } from '@/lib/config-validation';
export type { ConfigItemType } from '@/lib/config-validation';
import { executeStatement, getDatabaseUnavailableReason, getPool, isDatabaseConfigured, queryRows } from '@/lib/db';
import {
  MIKROTIK_INTERFACES,
  NETWORK_PING_TARGETS,
  UBUNTU_SERVICES,
  type MikrotikInterfaceConfig,
  type NetworkPingTargetConfig,
  type UbuntuServiceConfig,
} from '@/lib/monitoring-config';
import { nowIso } from '@/lib/metrics';
import { mysqlDateTimeToIsoString } from '@/lib/time';

export interface MonitoringConfigItem<TPayload = Record<string, unknown>> {
  id: number;
  type: ConfigItemType;
  key: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  payload: TPayload;
  createdAt: string;
  updatedAt: string;
  version: string;
}

export interface SlaPolicyConfig {
  category: string;
  label: string;
  targetAvailabilityPercent: number;
  responseMinutes: number;
  resolutionMinutes: number;
}

export interface MaintenanceWindowConfig {
  scope: 'all' | 'domain' | 'entity';
  value: string;
  startsAt: string;
  endsAt: string;
  reason: string;
}

const CONFIG_SCHEMA = `CREATE TABLE IF NOT EXISTS monitoring_config_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  item_type VARCHAR(64) NOT NULL,
  item_key VARCHAR(191) NOT NULL,
  label VARCHAR(191) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  payload_json JSON NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_monitoring_config_items_type_key (item_type, item_key),
  KEY idx_monitoring_config_items_type_enabled (item_type, enabled),
  KEY idx_monitoring_config_items_sort (item_type, sort_order)
)`;

let seedPromise: Promise<void> | null = null;
let schemaPromise: Promise<void> | null = null;

export const CONFIG_REVISION_SCHEMA = `CREATE TABLE IF NOT EXISTS monitoring_config_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  change_id CHAR(36) NOT NULL,
  actor VARCHAR(191) NOT NULL,
  operation VARCHAR(32) NOT NULL,
  before_json JSON NOT NULL,
  after_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_config_change (change_id)
)`;

function parsePayload(value: unknown) {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mapConfigRow(row: RowDataPacket & {
  id: number;
  item_type: ConfigItemType;
  item_key: string;
  label: string;
  enabled: number | boolean;
  sort_order: number;
  payload_json: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  revision?: number | string;
}) {
  return {
    id: row.id,
    type: row.item_type,
    key: row.item_key,
    label: row.label,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    payload: parsePayload(row.payload_json),
    createdAt: mysqlDateTimeToIsoString(row.created_at) as string,
    updatedAt: mysqlDateTimeToIsoString(row.updated_at) as string,
    version: String(row.revision || 1),
  } satisfies MonitoringConfigItem;
}

function defaultSlaPolicies(): Array<Omit<MonitoringConfigItem<SlaPolicyConfig>, 'id' | 'createdAt' | 'updatedAt' | 'version'>> {
  return [
    {
      type: 'sla_policy',
      key: 'internet',
      label: 'Internet',
      enabled: true,
      sortOrder: 10,
      payload: { category: 'internet', label: 'Internet', targetAvailabilityPercent: 99.5, responseMinutes: 15, resolutionMinutes: 120 },
    },
    {
      type: 'sla_policy',
      key: 'network',
      label: 'Network Core',
      enabled: true,
      sortOrder: 20,
      payload: { category: 'network', label: 'Network Core', targetAvailabilityPercent: 99.5, responseMinutes: 15, resolutionMinutes: 180 },
    },
    {
      type: 'sla_policy',
      key: 'fingerprint',
      label: 'Fingerprint',
      enabled: true,
      sortOrder: 30,
      payload: { category: 'fingerprint', label: 'Fingerprint', targetAvailabilityPercent: 98, responseMinutes: 60, resolutionMinutes: 480 },
    },
    {
      type: 'sla_policy',
      key: 'cctv',
      label: 'CCTV',
      enabled: true,
      sortOrder: 40,
      payload: { category: 'cctv', label: 'CCTV', targetAvailabilityPercent: 98, responseMinutes: 60, resolutionMinutes: 480 },
    },
    {
      type: 'sla_policy',
      key: 'server',
      label: 'Server',
      enabled: true,
      sortOrder: 50,
      payload: { category: 'server', label: 'Server', targetAvailabilityPercent: 99.5, responseMinutes: 15, resolutionMinutes: 180 },
    },
  ];
}

type MonitoringConfigSeed = Omit<MonitoringConfigItem<unknown>, 'id' | 'createdAt' | 'updatedAt' | 'version'>;

function defaultConfigItems(): MonitoringConfigSeed[] {
  return [
    ...NETWORK_PING_TARGETS.map((target, index) => ({
      type: 'network_target' as const,
      key: target.key,
      label: target.label,
      enabled: true,
      sortOrder: (index + 1) * 10,
      payload: target as unknown as Record<string, unknown>,
    })),
    ...MIKROTIK_INTERFACES.map((item, index) => ({
      type: 'mikrotik_interface' as const,
      key: item.name,
      label: item.displayName,
      enabled: true,
      sortOrder: (index + 1) * 10,
      payload: item as unknown as Record<string, unknown>,
    })),
    ...UBUNTU_SERVICES.map((service, index) => ({
      type: 'ubuntu_service' as const,
      key: service.key,
      label: service.label,
      enabled: true,
      sortOrder: (index + 1) * 10,
      payload: service as unknown as Record<string, unknown>,
    })),
    ...defaultSlaPolicies(),
  ];
}

export async function ensureConfigSchema() {
  if (!isDatabaseConfigured()) return false;
  schemaPromise ||= (async () => {
    await executeStatement(CONFIG_SCHEMA);
    const columns = await queryRows<RowDataPacket>("SHOW COLUMNS FROM monitoring_config_items LIKE 'revision'");
    if (!columns.length) {
      try { await executeStatement('ALTER TABLE monitoring_config_items ADD COLUMN revision BIGINT UNSIGNED NOT NULL DEFAULT 1'); }
      catch (error) { if ((error as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw error; }
    }
    await executeStatement(CONFIG_REVISION_SCHEMA);
  })().catch((error) => { schemaPromise = null; throw error; });
  await schemaPromise;
  return true;
}

export async function seedDefaultConfigItems() {
  if (!isDatabaseConfigured()) return;
  seedPromise ||= (async () => {
    if (!(await ensureConfigSchema())) return;
    for (const item of defaultConfigItems()) {
      await executeStatement(
        `INSERT IGNORE INTO monitoring_config_items
          (item_type, item_key, label, enabled, sort_order, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [item.type, item.key, item.label, item.enabled ? 1 : 0, item.sortOrder, JSON.stringify(item.payload)],
      );
    }
  })().catch((error) => { seedPromise = null; throw error; });
  await seedPromise;
}

export async function listConfigItems(type?: ConfigItemType | null) {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      storageEnabled: false,
      message: getDatabaseUnavailableReason(),
      items: [] as MonitoringConfigItem[],
    };
  }
  await seedDefaultConfigItems();
  const params = type ? [type] : [];
  const rows = await queryRows<RowDataPacket & {
    id: number;
    item_type: ConfigItemType;
    item_key: string;
    label: string;
    enabled: number;
    sort_order: number;
    payload_json: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `SELECT *
     FROM monitoring_config_items
     ${type ? 'WHERE item_type = ?' : ''}
     ORDER BY item_type ASC, sort_order ASC, label ASC`,
    params,
  );

  return {
    ok: true,
    storageEnabled: true,
    items: rows.map(mapConfigRow),
  };
}

export async function saveConfigChanges(inputs: ConfigInput[], actor: string, operation = 'save') {
  if (!isDatabaseConfigured()) throw new ConfigError('Penyimpanan konfigurasi belum tersedia.', 503);
  if (!inputs.length || inputs.length > 20) throw new ConfigError('Jumlah perubahan tidak valid.');
  const changes = inputs.map(normalizeConfigInput).sort((a, b) => `${a.type}:${a.key}`.localeCompare(`${b.type}:${b.key}`));
  if (new Set(changes.map((item) => `${item.type}:${item.key}`)).size !== changes.length) throw new ConfigError('Identitas perubahan ganda.');
  await seedDefaultConfigItems();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const before: Array<MonitoringConfigItem | null> = [];
    const after: MonitoringConfigItem[] = [];
    for (const item of changes) {
      const [rows] = await connection.query<RowDataPacket[]>('SELECT * FROM monitoring_config_items WHERE item_type = ? AND item_key = ? FOR UPDATE', [item.type, item.key]);
      const current = rows[0] ? mapConfigRow(rows[0] as Parameters<typeof mapConfigRow>[0]) : null;
      if ((current?.version ?? null) !== item.expectedVersion) throw new ConfigError(`${item.label} sudah berubah atau identitas sudah digunakan. Muat ulang sebelum menyimpan.`, 409);
      before.push(current);
      if (current) {
        await connection.execute('UPDATE monitoring_config_items SET label = ?, enabled = ?, sort_order = ?, payload_json = ?, revision = revision + 1 WHERE id = ?', [item.label, item.enabled ? 1 : 0, item.sortOrder, JSON.stringify(item.payload), current.id]);
      } else {
        await connection.execute('INSERT INTO monitoring_config_items (item_type, item_key, label, enabled, sort_order, payload_json) VALUES (?, ?, ?, ?, ?, ?)', [item.type, item.key, item.label, item.enabled ? 1 : 0, item.sortOrder, JSON.stringify(item.payload)]);
      }
      const [saved] = await connection.query<RowDataPacket[]>('SELECT * FROM monitoring_config_items WHERE item_type = ? AND item_key = ?', [item.type, item.key]);
      after.push(mapConfigRow(saved[0] as Parameters<typeof mapConfigRow>[0]));
    }
    const changeId = randomUUID();
    await connection.execute('INSERT INTO monitoring_config_revisions (change_id, actor, operation, before_json, after_json) VALUES (?, ?, ?, ?, ?)', [changeId, actor.slice(0, 191), operation, JSON.stringify(before), JSON.stringify(after)]);
    await connection.commit();
    return { changeId, items: after };
  } catch (error) {
    await connection.rollback();
    if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes((error as { code?: string }).code || '')) throw new ConfigError('Konfigurasi sedang berubah di sesi lain. Muat ulang lalu coba lagi.', 409);
    throw error;
  } finally { connection.release(); }
}

function parseSnapshots(value: unknown): Array<MonitoringConfigItem | null> {
  return (typeof value === 'string' ? JSON.parse(value) : value) as Array<MonitoringConfigItem | null>;
}

export async function listConfigRevisions() {
  if (!isDatabaseConfigured()) return [];
  await ensureConfigSchema();
  const rows = await queryRows<RowDataPacket>('SELECT * FROM monitoring_config_revisions ORDER BY id DESC LIMIT 20');
  return rows.map((row) => ({ changeId: String(row.change_id), actor: String(row.actor), operation: String(row.operation), createdAt: mysqlDateTimeToIsoString(row.created_at), before: parseSnapshots(row.before_json), after: parseSnapshots(row.after_json) }));
}

export async function restoreConfigRevision(changeId: string, actor: string) {
  await ensureConfigSchema();
  const rows = await queryRows<RowDataPacket>('SELECT * FROM monitoring_config_revisions WHERE change_id = ?', [changeId]);
  if (!rows.length) throw new ConfigError('Riwayat perubahan tidak ditemukan.', 404);
  const before = parseSnapshots(rows[0].before_json);
  const after = parseSnapshots(rows[0].after_json);
  const changes = after.map((snapshot, index) => {
    if (!snapshot) throw new ConfigError('Riwayat konfigurasi tidak valid.');
    const previous = before[index];
    return { ...(previous || { ...snapshot, enabled: false }), expectedVersion: snapshot.version };
  });
  return saveConfigChanges(changes, actor, 'restore');
}

async function listEnabledPayloads<T>(type: ConfigItemType, fallback: T[]) {
  if (!isDatabaseConfigured()) return fallback;
  try {
    await seedDefaultConfigItems();
    const result = await listConfigItems(type);
    const items = result.items.filter((item) => item.enabled);
    return items.map((item) => item.payload as T);
  } catch {
    return fallback;
  }
}

export async function getNetworkPingTargetConfigs() {
  return listEnabledPayloads<NetworkPingTargetConfig>('network_target', NETWORK_PING_TARGETS);
}

export async function getMikrotikInterfaceConfigs() {
  return listEnabledPayloads<MikrotikInterfaceConfig>('mikrotik_interface', MIKROTIK_INTERFACES);
}

export async function getUbuntuServiceConfigs() {
  return listEnabledPayloads<UbuntuServiceConfig>('ubuntu_service', UBUNTU_SERVICES);
}

export async function getSlaPolicyConfigs() {
  return listEnabledPayloads<SlaPolicyConfig>('sla_policy', defaultSlaPolicies().map((item) => item.payload));
}

export async function getMaintenanceWindowConfigs() {
  return listEnabledPayloads<MaintenanceWindowConfig>('maintenance_window', []);
}

export async function getActiveMaintenanceWindows(timestamp = nowIso()) {
  const nowMs = new Date(timestamp).getTime();
  const windows = await getMaintenanceWindowConfigs();
  return windows.filter((window) => {
    const start = new Date(window.startsAt).getTime();
    const end = new Date(window.endsAt).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && start <= nowMs && nowMs <= end;
  });
}

export function maintenanceWindowMatches(
  window: MaintenanceWindowConfig,
  candidate: { domainKey: string; entityKey: string; incidentKey: string },
) {
  const value = window.value.trim().toLowerCase();
  if (window.scope === 'all') return true;
  if (window.scope === 'domain') return candidate.domainKey.toLowerCase() === value;
  return candidate.entityKey.toLowerCase().includes(value) || candidate.incidentKey.toLowerCase().includes(value);
}
