import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
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

export type ConfigItemType = 'network_target' | 'mikrotik_interface' | 'ubuntu_service' | 'sla_policy' | 'maintenance_window';

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
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_monitoring_config_items_type_key (item_type, item_key),
  KEY idx_monitoring_config_items_type_enabled (item_type, enabled),
  KEY idx_monitoring_config_items_sort (item_type, sort_order)
)`;

let seedPromise: Promise<void> | null = null;

function parsePayload(value: unknown) {
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
  } satisfies MonitoringConfigItem;
}

function defaultSlaPolicies(): Array<Omit<MonitoringConfigItem<SlaPolicyConfig>, 'id' | 'createdAt' | 'updatedAt'>> {
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

type MonitoringConfigSeed = Omit<MonitoringConfigItem<unknown>, 'id' | 'createdAt' | 'updatedAt'>;

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
  await executeStatement(CONFIG_SCHEMA);
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
  })();
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

export async function upsertConfigItem(params: {
  type: ConfigItemType;
  key: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  payload: Record<string, unknown>;
}) {
  await seedDefaultConfigItems();
  const [result] = await getPool().execute<ResultSetHeader>(
    `INSERT INTO monitoring_config_items
      (item_type, item_key, label, enabled, sort_order, payload_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       enabled = VALUES(enabled),
       sort_order = VALUES(sort_order),
       payload_json = VALUES(payload_json)`,
    [
      params.type,
      params.key.trim().slice(0, 191),
      params.label.trim().slice(0, 191),
      params.enabled ? 1 : 0,
      Math.trunc(params.sortOrder || 0),
      JSON.stringify(params.payload),
    ],
  );
  return result.affectedRows > 0;
}

async function listEnabledPayloads<T>(type: ConfigItemType, fallback: T[]) {
  if (!isDatabaseConfigured()) return fallback;
  try {
    await seedDefaultConfigItems();
    const result = await listConfigItems(type);
    const items = result.items.filter((item) => item.enabled);
    if (items.length === 0) return fallback;
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
