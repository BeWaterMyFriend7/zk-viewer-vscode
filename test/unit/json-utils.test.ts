import * as assert from 'assert';
import { classifyNodeData, formatData, hexDump, validateJson } from '../../src/webview/json-utils';

describe('json-utils', () => {
  it('classifies node data as json, text or binary', () => {
    assert.strictEqual(classifyNodeData(Buffer.from('{"a":1}')), 'json');
    assert.strictEqual(classifyNodeData(Buffer.from('hello world')), 'text');
    assert.strictEqual(classifyNodeData(Buffer.from('')), 'text');
    assert.strictEqual(classifyNodeData(Buffer.from([0x00, 0x01, 0x02])), 'binary');
    assert.strictEqual(classifyNodeData(Buffer.from('text\x00with-null')), 'binary');
  });

  it('formats JSON with 2-space indentation and preserves key order', () => {
    const formatted = formatData(Buffer.from('{"z":1,"a":2}'));
    assert.strictEqual(formatted.kind, 'json');
    assert.strictEqual(formatted.text, '{\n  "z": 1,\n  "a": 2\n}');
  });

  it('falls back to plain text for invalid JSON without throwing', () => {
    const formatted = formatData(Buffer.from('{not json'));
    assert.strictEqual(formatted.kind, 'text');
    assert.strictEqual(formatted.text, '{not json');
  });

  it('produces a hex dump for binary data', () => {
    const formatted = formatData(Buffer.from([0x00, 0x0a, 0x41]));
    assert.strictEqual(formatted.kind, 'binary');
    assert.match(formatted.text, /^00000000\s+00 0a 41/);
    assert.ok(formatted.text.includes('A'));
    assert.doesNotThrow(() => hexDump(Buffer.alloc(0)));
  });

  it('validates JSON text', () => {
    assert.deepStrictEqual(validateJson('{"ok":true}'), { valid: true });
    const invalid = validateJson('{"broken"');
    assert.strictEqual(invalid.valid, false);
    assert.ok('error' in invalid && invalid.error.length > 0);
  });
});
