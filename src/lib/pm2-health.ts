import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

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
  sources: Array<{ label: string; available: boolean; error: string | null }>;
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

function isIgnoredProcess(ignoredApps: string[], source: string, name: string) {
  return ignoredApps.includes(name) || ignoredApps.includes(processKey(source, name));
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

async function readCurrentSource(requiredApps: string[], label: string) {
  const { stdout } = await execFileAsync(pm2Binary(), ['jlist'], {
    timeout: PM2_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
    env: process.env,
  });
  const parsed = JSON.parse(stdout) as Pm2JlistItem[];
  return parsed.map((item) => mapProcess(item, requiredApps, label));
}

async function readFileSource(requiredApps: string[], label: string, path: string) {
  const content = await readFile(path, 'utf8');
  const parsed = JSON.parse(content) as Pm2JlistItem[];
  return parsed.map((item) => mapProcess(item, requiredApps, label));
}

export async function getPm2HealthSnapshot(): Promise<Pm2HealthSnapshot> {
  const requiredApps = readCsvEnv('PM2_REQUIRED_APPS', DEFAULT_REQUIRED_APPS);
  const ignoredApps = readCsvEnv('PM2_IGNORED_APPS', []);
  const primarySource = sourceLabel();
  const sources: Array<{ label: string; available: boolean; error: string | null }> = [];
  const processes: Pm2ProcessHealth[] = [];

  try {
    processes.push(...await readCurrentSource(requiredApps, primarySource));
    sources.push({ label: primarySource, available: true, error: null });
  } catch (error) {
    sources.push({
      label: primarySource,
      available: false,
      error: error instanceof Error ? error.message : 'Unable to read PM2 process list',
    });
  }

  for (const source of parseExtraJlistFiles()) {
    try {
      processes.push(...await readFileSource(requiredApps, source.label, source.path));
      sources.push({ label: source.label, available: true, error: null });
    } catch (error) {
      sources.push({
        label: source.label,
        available: false,
        error: error instanceof Error ? error.message : `Unable to read ${source.path}`,
      });
    }
  }

  const visibleProcesses = processes.filter((item) => !isIgnoredProcess(ignoredApps, item.source, item.name));
  const effectiveRequiredApps = requiredApps.filter((appName) => {
    const separatorIndex = appName.indexOf(':');
    const source = separatorIndex > 0 ? appName.slice(0, separatorIndex) : primarySource;
    const name = separatorIndex > 0 ? appName.slice(separatorIndex + 1) : appName;
    return !isIgnoredProcess(ignoredApps, source, name);
  });

  appendMissingRequired(visibleProcesses, effectiveRequiredApps, primarySource);
  visibleProcesses.sort((left, right) => (
    Number(right.required) - Number(left.required) ||
    left.source.localeCompare(right.source) ||
    left.name.localeCompare(right.name)
  ));
  const requiredDown = visibleProcesses.filter((item) => item.required && !item.active).map((item) => processKey(item.source, item.name));
  const available = sources.some((source) => source.available);
  const status = requiredDown.length > 0 ? 'critical' : !available ? 'unknown' : visibleProcesses.length === 0 ? 'warning' : 'healthy';
  const sourceErrors = sources.filter((source) => !source.available).map((source) => `${source.label}: ${source.error}`);

  return {
    available,
    status,
    requiredApps: effectiveRequiredApps,
    requiredDown,
    processes: visibleProcesses,
    sources,
    error: sourceErrors.length > 0 ? sourceErrors.join('; ') : null,
    timestamp: new Date().toISOString(),
  };
}
