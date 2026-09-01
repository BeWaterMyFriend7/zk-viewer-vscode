import * as assert from 'assert';
import { formatZkTime } from '../../src/utils/time';

describe('formatZkTime', () => {
  it('formats a numeric millisecond timestamp as local date-time', () => {
    const fixed = new Date(2026, 8, 1, 18, 37, 33).getTime();
    const formatted = formatZkTime(fixed);
    assert.match(formatted, /^2026-09-01 \d{2}:\d{2}:\d{2}$/);
    assert.ok(formatted.includes('18:37:33') || formatted.includes('2026-09-01'));
  });

  it('formats an 8-byte big-endian Buffer from the native client', () => {
    const ms = 1700000000123;
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(ms));
    const formatted = formatZkTime(buf);
    const expected = new Date(ms);
    const pad = (n: number): string => n.toString().padStart(2, '0');
    const hh = pad(expected.getHours());
    const mm = pad(expected.getMinutes());
    const ss = pad(expected.getSeconds());
    assert.ok(formatted.includes(hh + ':' + mm + ':' + ss));
  });

  it('returns the input unchanged for unparseable values', () => {
    assert.strictEqual(formatZkTime('not-a-time'), 'not-a-time');
    assert.strictEqual(formatZkTime(undefined), '');
  });
});
