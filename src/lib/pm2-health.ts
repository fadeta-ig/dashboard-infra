import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import { promisify } from 'node:util';
import { listConfigItems } from '@/lib/config-store';
import { evaluateFreshness, type Freshness } from '@/lib/freshness';
import { resolvePm2Policy, type Pm2AppPolicy } from '@/lib/pm2-policy';

const execFileAsync = promisify(execFile);
const DEFAULT_REQUIRED_APPS = ['dashboard-infra', 'dashboard-history-collector'];
const PM2_TIMEOUT_MS = 4000;
const DEFAULT_SOURCE = 'server-wig';

interface Pm2JlistItem {
  name?: string;
  pm_id?: number;
  pid?: number;
  monit?: {
    memory?: number;
    cpu?: number;
  };
  pm2_env?: {
    status?: string;
    restart_time?: number;
    unstable_restarts?: number;
    pm_uptime?: number;
    created_at?: number;
    exec_mode?: string;
    instances?: number | string;
    version?: string;
  };
}

export interface Pm2ProcessHealth {
  source: string;
  name: string;
  pmId: number | null;
  pid: number | null;
  status: string;
  active: boolean;
  required: boolean;
  cpuPercent: number | null;
  memoryBytes: number | null;
  restartCount: number | null;
  unstableRestartCount: number | null;
  uptimeMs: number | null;
  execMode: string | null;
  instances: string | null;
}

export interface Pm2HealthSnapshot {
  available: boolean;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  requiredApps: string[];
  requiredDown: string[];
  processes: Pm2ProcessHealth[];
  sources: Array<{ label: string; available: boolean; error: string | null; kind: 'local' | 'snapshot'; freshness: Freshness }>;
  policySource: 'database' | 'environment';
  policyAvailable: boolean;
  policyOverrides: Pm2AppPolicy[];
  environmentPolicy: { requiredApps: string[]; ignoredApps: string[] };
  error: string | null;
  timestamp: string;
}

function readCsvEnv(name: string, fallback: string[]) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
  return values.length > 0 ? values : fallback;
}

function pm2Binary() {
  return process.env.PM2_BIN?.trim() || 'pm2';
}

function sourceLabel() {
  return process.env.PM2_SOURCE_LABEL?.trim() || process.env.USER?.trim() || DEFAULT_SOURCE;
}

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function processKey(source: string, name: string) {
  return `${source}:${name}`;
}

function isRequiredProcess(requiredApps: string[], source: string, name: string) {
  return requiredApps.includes(name) || requiredApps.includes(processKey(source, name));
}

function mapProcess(item: Pm2JlistItem, requiredApps: string[], source: string): Pm2ProcessHealth {
  const name = item.name || `pm2-${item.pm_id ?? 'unknown'}`;
  const status = item.pm2_env?.status || 'unknown';
  const uptimeStartedAt = toNumber(item.pm2_env?.pm_uptime);
  const uptimeMs = uptimeStartedAt === null ? null : Math.max(0, Date.now() - uptimeStartedAt);
  return {
    source,
    name,
    pmId: toNumber(item.pm_id),
    pid: toNumber(item.pid),
    status,
    active: status === 'online',
    required: isRequiredProcess(requiredApps, source, name),
    cpuPercent: toNumber(item.monit?.cpu),
    memoryBytes: toNumber(item.monit?.memory),
    restartCount: toNumber(item.pm2_env?.restart_time),
    unstableRestartCount: toNumber(item.pm2_env?.unstable_restarts),
    uptimeMs,
    execMode: item.pm2_env?.exec_mode || null,
    instances: item.pm2_env?.instances === undefined ? null : String(item.pm2_env.instances),
  };
}

function parseExtraJlistFiles() {
  const raw = process.env.PM2_EXTRA_JLIST_FILES?.trim();
  if (!raw) return [] as Array<{ label: string; path: string }>;
  return raw
    .split(',')
    .map((entry) => {
      const index = entry.indexOf(':');
      if (index <= 0) return null;
      const label = entry.slice(0, index).trim();
      const path = entry.slice(index + 1).trim();
      return label && path ? { label, path } : null;
    })
    .filter((entry): entry is { label: string; path: string } => Boolean(entry));
}

function appendMissingRequired(processes: Pm2ProcessHealth[], requiredApps: string[], defaultSource: string) {
  const existingNames = new Set(processes.map((item) => item.name));
  const existingKeys = new Set(processes.map((item) => processKey(item.source, item.name)));
  for (const requiredName of requiredApps) {
    const separatorIndex = requiredName.indexOf(':');
    const source = separatorIndex > 0 ? requiredName.slice(0, separatorIndex) : defaultSource;
    const appName = separatorIndex > 0 ? requiredName.slice(separatorIndex + 1) : requiredName;
    const exists = separatorIndex > 0 ? existingKeys.has(requiredName) : existingNames.has(appName);
    if (exists) continue;
    processes.push({
      source,
      name: appName,
      pmId: null,
      pid: null,
      status: 'missing',
      active: false,
      required: true,
      cpuPercent: null,
      memoryBytes: null,
      restartCount: null,
      unstableRestartCount: null,
      uptimeMs: null,
      execMode: null,
      instances: null,
    });
  }
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function parsePm2Jlist(value: string) {
  const clean = stripAnsi(value).trim();
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('PM2 jlist output does not contain a JSON array');
  }
  const parsed = JSON.parse(clean.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('PM2 jlist output is not a JSON array');
  }
  return parsed as Pm2JlistItem[];
}

async function readCurrentSource(requiredApps: string[], label: string) {
  const { stdout } = await execFileAsync(pm2Binary(), ['jlist'], {
    timeout: PM2_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
    env: process.env,
  });
  const parsed = parsePm2Jlist(stdout);
  return parsed.map((item) => mapProcess(item, requiredApps, label));
}

async function readFileSource(requiredApps: string[], label: string, path: string, maxAgeMs: number) {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    const freshness = evaluateFreshness(info.mtime.toISOString(), maxAgeMs);
    if (freshness.state !== 'fresh') return { processes: [], freshness };
    if (info.size > 1024 * 1024) throw new Error('Snapshot PM2 melebihi 1 MB.');
    const parsed = parsePm2Jlist(await file.readFile('utf8'));
    return { processes: parsed.map((item) => mapProcess(item, requiredApps, label)), freshness };
  } finally { await file.close(); }
}

export async function getPm2HealthSnapshot(): Promise<Pm2HealthSnapshot> {
  const requiredApps = readCsvEnv('PM2_REQUIRED_APPS', DEFAULT_REQUIRED_APPS);
  const ignoredApps = readCsvEnv('PM2_IGNORED_APPS', []);
  const primarySource = sourceLabel();
  const sources: Pm2HealthSnapshot['sources'] = [];
  const processes: Pm2ProcessHealth[] = [];
  let policies: Pm2AppPolicy[] = [];
  let policySource: Pm2HealthSnapshot['policySource'] = 'environment';
  let policyAvailable = true;
  try {
    const result = await listConfigItems('pm2_app');
    if (result.storageEnabled) {
      policySource = 'database';
      policies = result.items.filter((item) => item.enabled).map((item) => item.payload as unknown as Pm2AppPolicy);
    }
  } catch { policyAvailable = false; }
  const rawAge = Number(process.env.PM2_SNAPSHOT_MAX_AGE_MS || 180000);
  const maxAgeMs = Number.isFinite(rawAge) && rawAge >= 1000 ? rawAge : 180000;

  try {
    processes.push(...await readCurrentSource(requiredApps, primarySource));
    sources.push({ label: primarySource, available: true, error: null, kind: 'local', freshness: evaluateFreshness(new Date().toISOString(), maxAgeMs) });
  } catch (error) {
    sources.push({
      label: primarySource,
      available: false,
      error: error instanceof Error ? error.message : 'Unable to read PM2 process list',
      kind: 'local', freshness: evaluateFreshness(null, maxAgeMs),
    });
  }

  for (const source of parseExtraJlistFiles()) {
    if (sources.some((item) => item.label === source.label)) {
      const existing = sources.find((item) => item.label === source.label)!;
      existing.available = false;
      existing.error = 'Label source PM2 ganda. Gunakan label unik untuk setiap source.';
      existing.freshness = evaluateFreshness(null, maxAgeMs);
      continue;
    }
    try {
      const snapshot = await readFileSource(requiredApps, source.label, source.path, maxAgeMs);
      processes.push(...snapshot.processes);
      const fresh = snapshot.freshness.state === 'fresh';
      sources.push({ label: source.label, available: fresh, error: fresh ? null : 'Snapshot kedaluwarsa atau waktu file tidak sesuai. Periksa pembaruan snapshot.', kind: 'snapshot', freshness: snapshot.freshness });
    } catch (error) {
      sources.push({
        label: source.label,
        available: false,
        error: error instanceof Error ? error.message : `Unable to read ${source.path}`,
        kind: 'snapshot', freshness: evaluateFreshness(null, maxAgeMs),
      });
    }
  }

  const mode = (source: string, name: string) => resolvePm2Policy(source, name, policies, requiredApps, ignoredApps);
  const visibleProcesses = processes.filter((item) => mode(item.source, item.name) !== 'ignored');
  const candidates = [...new Set([...requiredApps, ...policies.filter((item) => item.mode === 'required').map((item) => item.source === '*' ? item.name : processKey(item.source, item.name))])];
  const effectiveRequiredApps = candidates.filter((appName) => {
    const separatorIndex = appName.indexOf(':');
    const source = separatorIndex > 0 ? appName.slice(0, separatorIndex) : primarySource;
    const name = separatorIndex > 0 ? appName.slice(separatorIndex + 1) : appName;
    return mode(source, name) === 'required';
  });

  for (const appName of effectiveRequiredApps) {
    const separator = appName.indexOf(':');
    const label = separator > 0 ? appName.slice(0, separator) : primarySource;
    if (!sources.some((source) => source.label === label)) sources.push({ label, available: false, kind: 'snapshot', error: 'Source ini belum dikonfigurasi. Periksa PM2_EXTRA_JLIST_FILES.', freshness: evaluateFreshness(null, maxAgeMs) });
  }

  appendMissingRequired(visibleProcesses, effectiveRequiredApps, primarySource);
  for (const item of visibleProcesses) {
    item.required = mode(item.source, item.name) === 'required';
    if (!sources.some((source) => source.label === item.source && source.available)) {
      item.status = 'unknown';
      item.active = false;
      item.cpuPercent = item.memoryBytes = item.uptimeMs = null;
    }
  }
  visibleProcesses.sort((left, right) => (
    Number(right.required) - Number(left.required) ||
    left.source.localeCompare(right.source) ||
    left.name.localeCompare(right.name)
  ));
  const requiredDown = policyAvailable ? [...new Set(visibleProcesses.filter((item) => item.required && !item.active && sources.some((source) => source.label === item.source && source.available)).map((item) => processKey(item.source, item.name)))] : [];
  const available = sources.some((source) => source.available);
  const status = !available || !policyAvailable ? 'unknown' : requiredDown.length > 0 ? 'critical' : sources.some((source) => !source.available) || visibleProcesses.length === 0 ? 'warning' : 'healthy';
  const sourceErrors = sources.filter((source) => !source.available).map((source) => `${source.label}: ${source.error}`);
  if (!policyAvailable) sourceErrors.push('Kebijakan PM2 tersimpan tidak dapat dibaca. Status aplikasi wajib belum dapat dievaluasi.');

  return {
    available,
    status,
    requiredApps: effectiveRequiredApps,
    requiredDown,
    processes: visibleProcesses,
    sources,
    policySource,
    policyAvailable,
    policyOverrides: policies,
    environmentPolicy: { requiredApps, ignoredApps },
    error: sourceErrors.length > 0 ? sourceErrors.join('; ') : null,
    timestamp: new Date().toISOString(),
  };
}
