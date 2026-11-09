export const CONFIG_TYPES = ['network_target', 'mikrotik_interface', 'pm2_app', 'ubuntu_service', 'sla_policy', 'maintenance_window'] as const;
export type ConfigItemType = typeof CONFIG_TYPES[number];
export interface ConfigInput {
  type: ConfigItemType;
  key: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  payload: Record<string, unknown>;
  expectedVersion: string | null;
}

export class ConfigError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function text(value: unknown, label: string, max = 191) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f]/.test(value)) {
    throw new ConfigError(`${label} wajib diisi dan maksimal ${max} karakter.`);
  }
  return value.trim();
}

export function isHost(value: string) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) return value.split('.').every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  if (value.includes(':')) {
    try { return new URL(`http://[${value}]/`).hostname.length > 0; } catch { return false; }
  }
  return value.length <= 253 && value.split('.').every((part) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(part));
}

export function normalizeConfigInput(value: unknown): ConfigInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConfigError('Konfigurasi tidak valid.');
  const item = value as Record<string, unknown>;
  if (!CONFIG_TYPES.includes(item.type as ConfigItemType)) throw new ConfigError('Jenis konfigurasi tidak dikenal.');
  const type = item.type as ConfigItemType;
  const key = text(item.key, 'Identitas');
  const label = text(item.label, 'Nama tampilan');
  if (typeof item.enabled !== 'boolean') throw new ConfigError('Status aktif wajib berupa boolean.');
  if (!Number.isSafeInteger(item.sortOrder) || Number(item.sortOrder) < 0 || Number(item.sortOrder) > 100000) throw new ConfigError('Urutan harus bilangan bulat 0–100000.');
  if (item.expectedVersion !== null && !(typeof item.expectedVersion === 'string' && /^\d+$/.test(item.expectedVersion))) {
    throw new ConfigError('Versi konfigurasi tidak tersedia. Muat ulang halaman.', 409);
  }
  if (!item.payload || typeof item.payload !== 'object' || Array.isArray(item.payload)) throw new ConfigError('Isi konfigurasi wajib berupa objek.');
  const payload = { ...item.payload as Record<string, unknown> };
  if (JSON.stringify(payload).length > 16000) throw new ConfigError('Isi konfigurasi terlalu besar.');
  const choice = (field: string, values: readonly string[]) => {
    if (!values.includes(String(payload[field]))) throw new ConfigError(`${field}: pilih ${values.join(', ')}.`);
  };
  const number = (field: string, min: number, max: number, optional = false) => {
    if (optional && (payload[field] === undefined || payload[field] === '')) { delete payload[field]; return; }
    const n = payload[field];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new ConfigError(`${field} harus berupa angka ${min}–${max}.`);
  };
  const boolean = (field: string, optional = false) => {
    if (optional && payload[field] === undefined) return;
    if (typeof payload[field] !== 'boolean') throw new ConfigError(`${field} wajib berupa boolean.`);
  };
  const optionalText = (field: string, max = 1000) => {
    if (payload[field] === undefined || payload[field] === '') { delete payload[field]; return; }
    payload[field] = text(payload[field], FIELD_NAMES[field] || field, max);
  };
  if (type === 'network_target') {
    payload.target = text(payload.target, 'IP / hostname', 253);
    if (!isHost(payload.target as string)) throw new ConfigError('IP / hostname tidak valid. Isi tanpa protokol atau port.');
    choice('category', ['internet', 'cctv', 'fingerprint', 'voice', 'network']);
    payload.key = key;
    payload.label = label;
    optionalText('purpose');
  } else if (type === 'mikrotik_interface') {
    if (payload.name !== key) throw new ConfigError('Nama interface harus sama dengan identitas. Pilih interface yang benar.');
    choice('role', ['wan', 'lan', 'trunk', 'vlan', 'vpn', 'loopback', 'unused', 'unknown']);
    if (payload.isp) choice('isp', ['ISP 1', 'ISP 2']); else delete payload.isp;
    number('downloadCapacityMbps', 0.001, 1000000, true);
    number('uploadCapacityMbps', 0.001, 1000000, true);
    boolean('expectedUp');
    boolean('includeInWanTotal', true);
    if (payload.includeInWanTotal && payload.role !== 'wan') throw new ConfigError('Hanya interface WAN yang boleh masuk total WAN.');
    payload.displayName = label;
    optionalText('comment');
    optionalText('parent', 191);
    if (payload.parent === key) throw new ConfigError('Interface tidak boleh menjadi induk dirinya sendiri.');
  } else if (type === 'pm2_app') {
    payload.source = text(payload.source, 'Source PM2', 64);
    payload.name = text(payload.name, 'Nama aplikasi PM2', 120);
    if (/[:,\s]/.test(payload.source as string) || /[:,]/.test(payload.name as string)) throw new ConfigError('Source/nama PM2 tidak boleh mengandung titik dua atau koma.');
    if (key !== `${payload.source}:${payload.name}`) throw new ConfigError('Identitas PM2 harus source:nama-aplikasi.');
    choice('mode', ['required', 'optional', 'ignored']);
  } else if (type === 'ubuntu_service') {
    payload.key = key;
    payload.label = label;
    payload.matcher = text(payload.matcher, 'Pola unit systemd', 512);
    try { new RegExp(payload.matcher as string); } catch { throw new ConfigError('Pola unit systemd tidak valid.'); }
    if (/\(\?|\\[1-9]/.test(payload.matcher as string)) throw new ConfigError('Gunakan pola RE2 sederhana tanpa lookaround/backreference.');
    boolean('required');
  } else if (type === 'sla_policy') {
    payload.category = text(payload.category, 'Kategori', 64);
    payload.label = label;
    number('targetAvailabilityPercent', 0, 100);
    number('responseMinutes', 1, 525600);
    number('resolutionMinutes', 1, 525600);
    if (Number(payload.resolutionMinutes) < Number(payload.responseMinutes)) throw new ConfigError('Waktu pemulihan tidak boleh lebih singkat dari waktu respons.');
  } else {
    choice('scope', ['all', 'domain', 'entity']);
    if (payload.scope !== 'all') payload.value = text(payload.value, 'Target maintenance');
    for (const field of ['startsAt', 'endsAt']) {
      if (typeof payload[field] !== 'string' || !Number.isFinite(Date.parse(payload[field] as string))) throw new ConfigError('Waktu maintenance tidak valid.');
      payload[field] = new Date(payload[field] as string).toISOString();
    }
    if (Date.parse(String(payload.endsAt)) <= Date.parse(String(payload.startsAt))) throw new ConfigError('Waktu selesai harus setelah waktu mulai.');
    payload.reason = text(payload.reason, 'Alasan maintenance', 1000);
  }
  return { type, key, label, enabled: item.enabled, sortOrder: Number(item.sortOrder), payload, expectedVersion: item.expectedVersion as string | null };
}

const FIELD_NAMES: Record<string, string> = { purpose: 'Keterangan perangkat', comment: 'Keterangan koneksi', parent: 'Interface induk' };

// A preview and its eventual transaction use the same rules; no router commands are executed.
export function planUplinkTransfer(items: ConfigInput[], fromKey: string, toKey: string, logicalKey: string): ConfigInput[] {
  if (new Set([fromKey, toKey, logicalKey]).size !== 3) throw new ConfigError('Port asal, port tujuan, dan PPPoE harus berbeda.');
  const find = (key: string) => {
    const item = items.find((entry) => entry.type === 'mikrotik_interface' && entry.key === key && entry.enabled);
    if (!item) throw new ConfigError(`Interface ${key} tidak ditemukan atau tidak aktif.`);
    return item;
  };
  const from = find(fromKey), to = find(toKey), logical = find(logicalKey);
  if (from.payload.role !== 'wan' || !from.payload.isp || from.payload.includeInWanTotal !== false) throw new ConfigError('Port asal harus uplink fisik dengan ISP, terpisah dari total WAN.');
  if (to.payload.role !== 'unused') throw new ConfigError('Port tujuan harus berperan unused agar koneksi lain tidak tertimpa.');
  if (!logical.key.startsWith('pppoe-') || logical.payload.role !== 'wan' || logical.payload.isp !== from.payload.isp || logical.payload.includeInWanTotal !== true) throw new ConfigError('Pilih PPPoE aktif dari ISP yang sama sebagai sumber total WAN.');
  return [
    { ...from, label: `${from.key} - Tidak digunakan`, payload: { name: from.key, displayName: `${from.key} - Tidak digunakan`, role: 'unused', comment: `Uplink dipindahkan ke ${to.key}`, expectedUp: false, includeInWanTotal: false } },
    { ...to, label: from.label, payload: { ...from.payload, name: to.key, displayName: from.label } },
    { ...logical, payload: { ...logical.payload, comment: `WAN logical PPPoE via ${to.key}`, parent: to.key } },
  ].map(normalizeConfigInput);
}
