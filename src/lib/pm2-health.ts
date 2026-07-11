import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_REQUIRED_APPS = ['dashboard-infra', 'dashboard-history-collector'];
const PM2_TIMEOUT_MS = 4000;

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

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapProcess(item: Pm2JlistItem, requiredApps: string[]): Pm2ProcessHealth {
  const name = item.name || `pm2-${item.pm_id ?? 'unknown'}`;
  const status = item.pm2_env?.status || 'unknown';
  const uptimeStartedAt = toNumber(item.pm2_env?.pm_uptime);
  const uptimeMs = uptimeStartedAt === null ? null : Math.max(0, Date.now() - uptimeStartedAt);
  return {
    name,
    pmId: toNumber(item.pm_id),
    pid: toNumber(item.pid),
    status,
    active: status === 'online',
    required: requiredApps.includes(name),
    cpuPercent: toNumber(item.monit?.cpu),
    memoryBytes: toNumber(item.monit?.memory),
    restartCount: toNumber(item.pm2_env?.restart_time),
    unstableRestartCount: toNumber(item.pm2_env?.unstable_restarts),
    uptimeMs,
    execMode: item.pm2_env?.exec_mode || null,
    instances: item.pm2_env?.instances === undefined ? null : String(item.pm2_env.instances),
  };
}

function appendMissingRequired(processes: Pm2ProcessHealth[], requiredApps: string[]) {
  const existing = new Set(processes.map((item) => item.name));
  for (const appName of requiredApps) {
    if (existing.has(appName)) continue;
    processes.push({
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

export async function getPm2HealthSnapshot(): Promise<Pm2HealthSnapshot> {
  const requiredApps = readCsvEnv('PM2_REQUIRED_APPS', DEFAULT_REQUIRED_APPS);
  try {
    const { stdout } = await execFileAsync(pm2Binary(), ['jlist'], {
      timeout: PM2_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: process.env,
    });
    const parsed = JSON.parse(stdout) as Pm2JlistItem[];
    const processes = parsed.map((item) => mapProcess(item, requiredApps));
    appendMissingRequired(processes, requiredApps);
    processes.sort((left, right) => Number(right.required) - Number(left.required) || left.name.localeCompare(right.name));
    const requiredDown = processes.filter((item) => item.required && !item.active).map((item) => item.name);
    const status = requiredDown.length > 0 ? 'critical' : processes.length === 0 ? 'warning' : 'healthy';

    return {
      available: true,
      status,
      requiredApps,
      requiredDown,
      processes,
      error: null,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      available: false,
      status: 'unknown',
      requiredApps,
      requiredDown: [],
      processes: [],
      error: error instanceof Error ? error.message : 'Unable to read PM2 process list',
      timestamp: new Date().toISOString(),
    };
  }
}
