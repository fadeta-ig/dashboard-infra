// Focused checks only. Integration requires an explicitly isolated local test database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile, utimes } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@/') ? pathToFileURL(path.join(root, 'src', `${specifier.slice(2)}.ts`)).href : specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith('.ts')) return next(url, context);
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
  },
});
const { normalizeConfigInput, planUplinkTransfer, isHost } = await import('../src/lib/config-validation.ts');
const { evaluateFreshness } = await import('../src/lib/freshness.ts');
const { resolvePm2Policy } = await import('../src/lib/pm2-policy.ts');
const { MIKROTIK_INTERFACES } = await import('../src/lib/monitoring-config.ts');
const defaults = MIKROTIK_INTERFACES.map((payload) => ({ type: 'mikrotik_interface', key: payload.name, label: payload.displayName, enabled: true, sortOrder: 10, expectedVersion: '1', payload }));
const network = { type: 'network_target', key: 'cctv', label: 'CCTV Baru', enabled: true, sortOrder: 10, expectedVersion: null, payload: { target: '192.168.40.253', category: 'cctv' } };

await test('Accept IPv4, IPv6 and hostnames; reject invalid addresses and URLs', () => {
  for (const host of ['192.168.1.1', '2001:db8::1', 'router.internal', 'localhost']) assert.equal(isHost(host), true, host);
  for (const host of ['999.1.1.1', '192.168.1.999', 'http://host', 'host:9100', 'host/path', '-host']) assert.equal(isHost(host), false, host);
});
await test('Network identity and display label remain synchronized', () => {
  const item = normalizeConfigInput({ ...network, payload: { ...network.payload, key: 'wrong', label: 'old' } });
  assert.equal(item.payload.key, 'cctv'); assert.equal(item.payload.label, 'CCTV Baru');
});
await test('Reject missing concurrency version and mismatched interface identity', () => {
  assert.throws(() => normalizeConfigInput({ ...network, expectedVersion: undefined }), /Versi/);
  assert.throws(() => normalizeConfigInput({ ...defaults[1], payload: { name: 'ether4', role: 'wan', expectedUp: true } }), /Nama interface/);
});
await test('Reject negative capacity and WAN totals on an unused port', () => {
  assert.throws(() => normalizeConfigInput({ ...defaults[1], payload: { ...defaults[1].payload, downloadCapacityMbps: -5 } }), /downloadCapacity/);
  assert.throws(() => normalizeConfigInput({ ...defaults[1], payload: { ...defaults[1].payload, role: 'unused' } }), /total WAN/);
});
await test('Reject malformed optional fields and self-parent interfaces', () => {
  assert.throws(() => normalizeConfigInput({ ...defaults[1], payload: { ...defaults[1].payload, comment: { invalid: true } } }), /Keterangan koneksi/);
  assert.throws(() => normalizeConfigInput({ ...defaults[1], payload: { ...defaults[1].payload, parent: 'pppoe-out1' } }), /induk dirinya/);
});
await test('Reject reversed maintenance dates and invalid SLA', () => {
  assert.throws(() => normalizeConfigInput({ ...network, type: 'maintenance_window', payload: { scope: 'all', startsAt: '2026-11-09T08:00:00Z', endsAt: '2026-11-09T07:00:00Z', reason: 'Test' } }), /setelah/);
  assert.throws(() => normalizeConfigInput({ ...network, type: 'sla_policy', payload: { category: 'server', targetAvailabilityPercent: 101, responseMinutes: 15, resolutionMinutes: 120 } }), /targetAvailability/);
});
await test('Transfer changes exactly three interfaces without double-counting WAN', () => {
  const changes = planUplinkTransfer(defaults, 'ether2', 'ether4', 'pppoe-out1');
  assert.equal(changes.length, 3);
  const [from, to, logical] = changes;
  assert.equal(from.key, 'ether2'); assert.equal(from.payload.role, 'unused'); assert.equal(from.payload.expectedUp, false);
  assert.equal(to.key, 'ether4'); assert.equal(to.payload.name, 'ether4'); assert.equal(to.payload.isp, 'ISP 2');
  assert.equal(to.payload.includeInWanTotal, false); assert.equal(logical.payload.includeInWanTotal, true);
  assert.equal(logical.payload.parent, 'ether4'); assert.equal(defaults.find((item) => item.key === 'ether4').payload.role, 'unused');
});
await test('Reject transfer into an occupied port or wrong PPPoE', () => {
  assert.throws(() => planUplinkTransfer(defaults, 'ether2', 'ether3', 'pppoe-out1'), /unused/);
  assert.throws(() => planUplinkTransfer(defaults, 'ether2', 'ether4', 'ether1-INDIHOME'), /PPPoE/);
  assert.throws(() => planUplinkTransfer(defaults, 'ether2', 'ether2', 'pppoe-out1'), /berbeda/);
});
await test('PM2 exact-source override precedes wildcard and legacy env rules', () => {
  const policies = [{ source: '*', name: 'hris', mode: 'ignored' }, { source: 'root', name: 'hris', mode: 'required' }];
  assert.equal(resolvePm2Policy('root', 'hris', policies, [], ['hris']), 'required');
  assert.equal(resolvePm2Policy('other', 'hris', policies, ['hris'], []), 'ignored');
  assert.equal(resolvePm2Policy('root', 'old-app', [{ source: 'root', name: 'old-app', mode: 'optional' }], ['root:old-app'], []), 'optional');
});
await test('Freshness rejects old, missing and future timestamps', () => {
  const now = Date.parse('2026-11-09T08:00:00Z');
  assert.equal(evaluateFreshness('2026-11-09T07:59:00Z', 180000, now).state, 'fresh');
  assert.equal(evaluateFreshness('2026-11-09T07:50:00Z', 180000, now).state, 'stale');
  assert.equal(evaluateFreshness('2026-11-09T09:00:00Z', 180000, now).state, 'stale');
  assert.equal(evaluateFreshness(null, 180000, now).state, 'unavailable');
});

if (process.argv.includes('--integration')) {
  if (process.env.MYSQL_HOST !== '127.0.0.1' || !/^infra_verify_[a-z\d_]+$/.test(process.env.MYSQL_DATABASE || '') || process.env.MYSQL_PORT !== '33079') throw new Error('Integration checks require isolated localhost:33079 / infra_verify_* database.');
  const mysql = (await import('mysql2/promise')).default;
  const admin = await mysql.createConnection({ host: '127.0.0.1', port: 33079, user: 'root', password: '' });
  const database = process.env.MYSQL_DATABASE;
  await admin.query(`CREATE DATABASE \`${database}\``);
  await admin.query(`USE \`${database}\``);
  // Deliberately create the old schema to exercise the non-destructive migration.
  await admin.query(`CREATE TABLE monitoring_config_items (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, item_type VARCHAR(64) NOT NULL, item_key VARCHAR(191) NOT NULL, label VARCHAR(191) NOT NULL, enabled TINYINT NOT NULL DEFAULT 1, sort_order INT NOT NULL DEFAULT 0, payload_json JSON, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uniq_type_key (item_type, item_key))`);
  const store = await import('../src/lib/config-store.ts');
  const db = await import('../src/lib/db.ts');
  try {
    let items;
    await test('Migrate legacy config schema; round-trip native MySQL JSON payloads', async () => {
      items = (await store.listConfigItems()).items;
      assert.equal(items.find((item) => item.key === 'ether2').payload.isp, 'ISP 2');
      assert.equal(items[0].version, '1');
      const [columns] = await admin.query("SHOW COLUMNS FROM monitoring_config_items LIKE 'revision'");
      assert.equal(columns.length, 1);
    });
    const input = (item) => ({ ...item, expectedVersion: item.version });
    const find = (key) => items.find((item) => item.key === key);
    await test('Stale version rejects entire three-interface transaction and revision history', async () => {
      const changes = planUplinkTransfer(items.map(input), 'ether2', 'ether4', 'pppoe-out1');
      changes[2].expectedVersion = '0';
      await assert.rejects(store.saveConfigChanges(changes, 'verification', 'transfer'), /sudah berubah/);
      const current = (await store.listConfigItems()).items;
      assert.equal(current.find((item) => item.key === 'ether2').payload.role, 'wan');
      assert.equal(current.find((item) => item.key === 'ether4').payload.role, 'unused');
      assert.equal((await store.listConfigRevisions()).length, 0);
    });
    let moved;
    await test('Transfer commits all interfaces and records actor plus before/after', async () => {
      moved = await store.saveConfigChanges(planUplinkTransfer(items.map(input), 'ether2', 'ether4', 'pppoe-out1'), 'verification', 'transfer');
      assert.equal(moved.items.length, 3);
      assert.equal(moved.items.find((item) => item.key === 'ether4').payload.role, 'wan');
      assert.equal(moved.items[0].version, '2');
      const history = await store.listConfigRevisions();
      assert.equal(history[0].actor, 'verification'); assert.equal(history[0].before.length, 3);
    });
    await test('Restore is atomic and stale restore cannot overwrite newer values', async () => {
      await store.restoreConfigRevision(moved.changeId, 'verification');
      await assert.rejects(store.restoreConfigRevision(moved.changeId, 'verification'), /sudah berubah/);
      items = (await store.listConfigItems()).items;
      assert.equal(find('ether4').payload.role, 'unused'); assert.equal(find('ether2').payload.role, 'wan');
    });
    await test('Concurrent saves with same version permit exactly one winner', async () => {
      const item = find('ether2');
      const results = await Promise.allSettled(['A', 'B'].map((suffix) => store.saveConfigChanges([{ ...input(item), label: `Citranet ${suffix}` }], 'verification')));
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.status === 409).length, 1);
    });
    await test('Disabled targets do not reappear from static fallback', async () => {
      const targets = (await store.listConfigItems('network_target')).items;
      const saved = await store.saveConfigChanges(targets.map((item) => ({ ...input(item), enabled: false })), 'verification');
      assert.deepEqual(await store.getNetworkPingTargetConfigs(), []);
      await store.restoreConfigRevision(saved.changeId, 'verification');
    });
    await test('Rollback of a newly created policy deactivates it without deletion', async () => {
      const created = await store.saveConfigChanges([{ ...network, type: 'pm2_app', key: 'root:old-app', payload: { source: 'root', name: 'old-app', mode: 'ignored' } }], 'verification');
      await store.restoreConfigRevision(created.changeId, 'verification');
      assert.equal((await store.listConfigItems('pm2_app')).items.find((item) => item.key === 'root:old-app').enabled, false);
    });
    const fixtureDir = path.join(root, '.verification');
    await mkdir(fixtureDir, { recursive: true });
    const snapshotPath = path.join(fixtureDir, 'root-pm2.json');
    const snapshot = [{ name: 'verification-app', pm_id: 1, pid: 123, pm2_env: { status: 'online' }, monit: { cpu: 1, memory: 1024 } }];
    process.env.PM2_BIN = path.join(fixtureDir, 'missing-pm2');
    process.env.PM2_REQUIRED_APPS = 'root:verification-app';
    process.env.PM2_EXTRA_JLIST_FILES = `root:${snapshotPath}`;
    const { getPm2HealthSnapshot } = await import('../src/lib/pm2-health.ts');
    await test('Fresh snapshot identifies source and healthy required app', async () => {
      await writeFile(snapshotPath, JSON.stringify(snapshot));
      const result = await getPm2HealthSnapshot();
      assert.equal(result.sources.find((source) => source.label === 'root').freshness.state, 'fresh');
      assert.equal(result.processes.find((item) => item.name === 'verification-app').active, true);
      assert.deepEqual(result.requiredDown, []);
    });
    await test('Stale PM2 snapshot never reports its old online state as live/down', async () => {
      const old = new Date(Date.now() - 600000);
      await utimes(snapshotPath, old, old);
      const result = await getPm2HealthSnapshot();
      assert.equal(result.sources.find((source) => source.label === 'root').freshness.state, 'stale');
      assert.equal(result.processes.find((item) => item.name === 'verification-app').status, 'unknown');
      assert.equal(result.available, false); assert.deepEqual(result.requiredDown, []);
    });
    await test('Source-specific stored policy overrides legacy required entry without restart', async () => {
      await writeFile(snapshotPath, JSON.stringify([{ ...snapshot[0], pm2_env: { status: 'stopped' } }]));
      const policy = { ...network, type: 'pm2_app', key: 'root:verification-app', payload: { source: 'root', name: 'verification-app', mode: 'optional' } };
      await store.saveConfigChanges([policy], 'verification');
      const result = await getPm2HealthSnapshot();
      assert.equal(result.processes.find((item) => item.name === 'verification-app').required, false);
      assert.deepEqual(result.requiredDown, []);
    });
  } finally { await db.getPool().end(); await admin.end(); }
}
