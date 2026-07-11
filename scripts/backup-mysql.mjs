import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_RETENTION_DAYS = 14;

function readEnv(name, fallback = '') {
  return (process.env[name] || fallback).trim();
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function waitForStream(stream) {
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { stdout, ...spawnOptions } = options;
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'], ...spawnOptions });
    if (stdout) child.stdout.pipe(stdout);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function main() {
  const database = readEnv('MYSQL_DATABASE', 'infra');
  const host = readEnv('MYSQL_HOST', '127.0.0.1');
  const port = readEnv('MYSQL_PORT', '3306');
  const user = readEnv('MYSQL_USER', 'root');
  const password = process.env.MYSQL_PASSWORD || '';
  const backupDir = path.resolve(readEnv('MYSQL_BACKUP_DIR', './backups/mysql'));
  const retentionDays = Number.parseInt(readEnv('MYSQL_BACKUP_RETENTION_DAYS', String(DEFAULT_RETENTION_DAYS)), 10);

  fs.mkdirSync(backupDir, { recursive: true });
  const outputPath = path.join(backupDir, `${database}-${timestamp()}.sql`);
  const output = fs.createWriteStream(outputPath, { flags: 'wx' });
  const outputFinished = waitForStream(output);
  const args = [`--host=${host}`, `--port=${port}`, `--user=${user}`, '--single-transaction', '--routines', '--triggers', database];
  try {
    await run('mysqldump', args, {
      env: { ...process.env, MYSQL_PWD: password },
      stdout: output,
    });
  } finally {
    output.end();
  }
  await outputFinished;

  if (Number.isFinite(retentionDays) && retentionDays > 0) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    for (const file of fs.readdirSync(backupDir)) {
      if (!file.endsWith('.sql')) continue;
      const fullPath = path.join(backupDir, file);
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(fullPath);
    }
  }

  console.log(`Backup created: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
