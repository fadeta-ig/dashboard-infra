import fs from 'node:fs';

const REQUIRED_ENV = [
  'PROMETHEUS_URL',
  'DASHBOARD_BASIC_USER',
  'DASHBOARD_BASIC_PASS',
  'DASHBOARD_SESSION_SECRET',
  'MYSQL_HOST',
  'MYSQL_USER',
  'MYSQL_DATABASE',
  'OPS_INTERNAL_TOKEN',
];

function loadDotEnv() {
  if (!fs.existsSync('.env')) return;
  const content = fs.readFileSync('.env', 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`Missing required env: ${missing.join(', ')}`);
  process.exitCode = 1;
}

const weakPasswords = ['admin', 'admin123', 'password', '123456'];
if (weakPasswords.includes((process.env.DASHBOARD_BASIC_PASS || '').trim().toLowerCase())) {
  console.error('DASHBOARD_BASIC_PASS masih lemah. Ganti sebelum deploy production.');
  process.exitCode = 1;
}

if ((process.env.DASHBOARD_SESSION_SECRET || '').trim().length < 32) {
  console.error('DASHBOARD_SESSION_SECRET minimal 32 karakter.');
  process.exitCode = 1;
}

if ((process.env.OPS_INTERNAL_TOKEN || '').trim().length < 32) {
  console.error('OPS_INTERNAL_TOKEN minimal 32 karakter.');
  process.exitCode = 1;
}

if (!process.exitCode) {
  console.log('Deploy check passed.');
}
