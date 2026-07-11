import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';

const DEFAULT_MYSQL_PORT = 3307;
type SqlParam = string | number | boolean | Date | null;

let pool: Pool | null = null;

function readString(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readPort() {
  const raw = process.env.MYSQL_PORT?.trim();
  if (!raw) return DEFAULT_MYSQL_PORT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_MYSQL_PORT;
}

export function getDatabaseConfig() {
  return {
    host: readString('MYSQL_HOST'),
    port: readPort(),
    user: readString('MYSQL_USER'),
    password: readString('MYSQL_PASSWORD'),
    database: readString('MYSQL_DATABASE'),
  };
}

export function isDatabaseConfigured() {
  const config = getDatabaseConfig();
  return Boolean(config.host && config.user && config.database);
}

export function getDatabaseUnavailableReason() {
  if (!isDatabaseConfigured()) {
    return 'MySQL belum dikonfigurasi. Isi MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, dan MYSQL_DATABASE.';
  }
  return null;
}

export function getPool() {
  if (!isDatabaseConfigured()) {
    throw new Error(getDatabaseUnavailableReason() || 'Database unavailable');
  }

  if (!pool) {
    const config = getDatabaseConfig();
    pool = mysql.createPool({
      host: config.host as string,
      port: config.port,
      user: config.user as string,
      password: config.password || undefined,
      database: config.database as string,
      timezone: 'Z',
      dateStrings: ['DATE', 'DATETIME', 'TIMESTAMP'],
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    pool.on('connection', (connection) => {
      void connection.query("SET time_zone = '+00:00'");
    });
  }

  return pool;
}

export async function testDatabaseConnection() {
  const connection = await getPool().getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function queryRows<T extends RowDataPacket>(sql: string, params: SqlParam[] = []) {
  const [rows] = await getPool().query<T[]>(sql, params);
  return rows;
}

export async function executeStatement(sql: string, params: SqlParam[] = []) {
  await getPool().execute(sql, params);
}
