// Use only with the isolated verification server on 127.0.0.1:33081.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:33081';
const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'verification-only', password: 'verification-local-only-20261109' }) });
assert.equal(login.status, 200, 'Run the isolated verification server, never a production server.');
const cookie = login.headers.get('set-cookie').split(';')[0];
const request = (url, body, extraHeaders = {}) => fetch(`${base}${url}`, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json', ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
const load = async () => { const response = await request('/api/ops/config'); assert.equal(response.status, 200); return response.json(); };
const input = (item) => ({ ...item, expectedVersion: item.version });

await test('Anonymous config API access is rejected', async () => {
  assert.equal((await fetch(`${base}/api/ops/config`)).status, 401);
});
await test('Config API rejects collector-token-only mutation and foreign origin', async () => {
  const tokenOnly = await fetch(`${base}/api/ops/config`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ops-token': 'verification-internal-token-20261109' }, body: '{}' });
  assert.equal(tokenOnly.status, 401);
  assert.equal((await request('/api/ops/config', {}, { Origin: 'https://foreign.example' })).status, 403);
});
await test('Validation rejects invalid IP and missing version without writing', async () => {
  const item = (await load()).items.find((row) => row.type === 'network_target');
  assert.equal((await request('/api/ops/config', { ...input(item), payload: { ...item.payload, target: '999.999.1.1' } })).status, 400);
  const missing = input(item); delete missing.expectedVersion;
  assert.equal((await request('/api/ops/config', missing)).status, 409);
  assert.equal((await load()).items.find((row) => row.key === item.key).version, item.version);
});
await test('Save, conflict and restore work through authenticated HTTP API', async () => {
  const item = (await load()).items.find((row) => row.type === 'network_target');
  const response = await request('/api/ops/config', { ...input(item), label: 'HTTP verification target' });
  assert.equal(response.status, 200); const saved = await response.json();
  assert.equal((await request('/api/ops/config', input(item))).status, 409);
  assert.equal((await request('/api/ops/config', { action: 'restore', changeId: saved.changeId })).status, 200);
  assert.equal((await load()).items.find((row) => row.key === item.key).label, item.label);
});
await test('HTTP uplink transfer and restore update all three entries', async () => {
  const interfaces = (await load()).items.filter((item) => item.type === 'mikrotik_interface');
  const response = await request('/api/ops/config', { action: 'transfer', fromKey: 'ether2', toKey: 'ether4', logicalKey: 'pppoe-out1', versions: Object.fromEntries(interfaces.map((item) => [item.key, item.version])) });
  assert.equal(response.status, 200); const saved = await response.json();
  assert.equal(saved.items.find((item) => item.key === 'ether4').payload.role, 'wan');
  assert.equal(saved.items.find((item) => item.key === 'pppoe-out1').payload.parent, 'ether4');
  assert.equal((await request('/api/ops/config', { action: 'restore', changeId: saved.changeId })).status, 200);
});
await test('Freshness uses source sample timestamp, not fresh HTTP response time', async () => {
  await fetch('http://127.0.0.1:33080/fixture/stale?value=false');
  let health = await (await request('/api/metrics/health')).json();
  assert.equal(health.sources.find((source) => source.key === 'prometheus').freshness.state, 'fresh');
  await fetch('http://127.0.0.1:33080/fixture/stale?value=true');
  health = await (await request('/api/metrics/health')).json();
  assert.equal(health.sources.find((source) => source.key === 'prometheus').freshness.state, 'stale');
  await fetch('http://127.0.0.1:33080/fixture/stale?value=false');
});
await test('Completed collector cycle persists a fresh heartbeat', async () => {
  const response = await fetch(`${base}/api/ops/history/collect`, { method: 'POST', headers: { 'x-ops-token': 'verification-internal-token-20261109' } });
  assert.equal(response.status, 200);
  const health = await (await request('/api/metrics/health')).json();
  assert.equal(health.sources.find((source) => source.key === 'collector').freshness.state, 'fresh');
});
await test('Retiring a required PM2 app closes its incident without claiming recovery', async () => {
  await writeFile(new URL('../.verification/root-pm2.json', import.meta.url), JSON.stringify([{ name: 'verification-app', pm_id: 1, pid: 123, pm2_env: { status: 'online' } }]));
  let policy = (await load()).items.find((item) => item.key === 'root:retirement-check');
  const body = policy ? input(policy) : { type: 'pm2_app', key: 'root:retirement-check', label: 'Retirement verification', enabled: true, sortOrder: 100, expectedVersion: null, payload: { source: 'root', name: 'retirement-check', mode: 'required' } };
  body.payload = { ...body.payload, mode: 'required' };
  assert.equal((await request('/api/ops/config', body)).status, 200);
  const collect = () => fetch(`${base}/api/ops/history/collect`, { method: 'POST', headers: { 'x-ops-token': 'verification-internal-token-20261109' } });
  assert.equal((await collect()).status, 200);
  let incidents = await (await request('/api/ops/history/incidents?status=open&search=retirement-check')).json();
  assert.equal(incidents.incidents.length, 1);
  policy = (await load()).items.find((item) => item.key === 'root:retirement-check');
  assert.equal((await request('/api/ops/config', { ...input(policy), payload: { ...policy.payload, mode: 'ignored' } })).status, 200);
  assert.equal((await collect()).status, 200);
  incidents = await (await request('/api/ops/history/incidents?status=resolved&search=retirement-check')).json();
  assert.equal(incidents.incidents[0].metadata.resolution, 'Monitoring requirement removed');
});
