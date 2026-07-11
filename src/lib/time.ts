const MYSQL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MYSQL_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

export function toMysqlDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime value: ${String(value)}`);
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function mysqlDateTimeToIsoString(value: Date | string | null | undefined) {
  if (!value) return value ?? null;
  if (value instanceof Date) return value.toISOString();

  const normalized = value.trim();
  if (MYSQL_DATE_PATTERN.test(normalized)) {
    return `${normalized}T00:00:00.000Z`;
  }
  if (MYSQL_DATETIME_PATTERN.test(normalized)) {
    const isoValue = normalized.replace(' ', 'T');
    return isoValue.includes('.') ? `${isoValue}Z` : `${isoValue}.000Z`;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return normalized;
  return date.toISOString();
}

export function utcDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${String(value)}`);
  }
  return date.toISOString().slice(0, 10);
}
