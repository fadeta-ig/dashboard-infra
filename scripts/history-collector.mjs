import fs from 'node:fs';
import path from 'node:path';

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

const baseUrl = process.env.APP_BASE_URL || 'http://127.0.0.1:3000';
const token = process.env.OPS_INTERNAL_TOKEN;
const intervalMsRaw = process.env.HISTORY_COLLECT_INTERVAL_MS || '60000';
const intervalMs = Number.parseInt(intervalMsRaw, 10);

if (!token) {
  console.error('OPS_INTERNAL_TOKEN wajib diisi untuk worker history collector.');
  process.exit(1);
}

if (!Number.isFinite(intervalMs) || intervalMs < 5000) {
  console.error(`HISTORY_COLLECT_INTERVAL_MS tidak valid: '${intervalMsRaw}'. Gunakan >= 5000.`);
  process.exit(1);
}

const endpoint = `${baseUrl.replace(/\/$/, '')}/api/ops/history/collect`;

async function collectOnce() {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-ops-token': token,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Collector failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  console.log(`[history-collector] ${new Date().toISOString()} ${JSON.stringify(body)}`);
}

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await collectOnce();
  } catch (error) {
    console.error('[history-collector] run failed:', error);
  } finally {
    running = false;
  }
}

console.log(`[history-collector] started. endpoint=${endpoint} intervalMs=${intervalMs}`);
await tick();
setInterval(() => {
  void tick();
}, intervalMs);
