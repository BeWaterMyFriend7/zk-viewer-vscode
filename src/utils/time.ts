/**
 * Formats a ZooKeeper millisecond timestamp (as an 8-byte big-endian long) or
 * a numeric string into a readable local-time "YYYY-MM-DD HH:mm:ss".
 * Unparseable input is returned unchanged so the UI never shows a blank time.
 */
export function formatZkTime(value: string | number | Buffer | undefined): string {
  const ms = toMillis(value);
  if (ms === undefined || Number.isNaN(ms)) {
    return value === undefined ? '' : String(value);
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * Resolves a ZooKeeper stat time field to milliseconds. Accepts the same
 * 8-byte big-endian long Buffer the native client returns, or a numeric
 * string. Returns undefined for anything that cannot be interpreted.
 */
function toMillis(value: string | number | Buffer | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Buffer.isBuffer(value)) {
    if (value.length !== 8) {
      return undefined;
    }
    return Number(value.readBigInt64BE(0));
  }
  if (typeof value === 'number') {
    return value;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  // Fall back to parsing an ISO-ish date (used by the mock client's clock).
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}
