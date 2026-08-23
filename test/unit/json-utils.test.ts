import * as assert from 'assert';
import {
  classifyNodeData,
  compactJson,
  formatData,
  formatJson,
  hexDump,
  validateJson,
} from '../../src/webview/json-utils';

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

  it('compacts JSON whitespace without changing whitespace inside string values', () => {
    assert.strictEqual(
      compactJson('{\n  "message": "hello world",\n  "nested": { "ok": true }\n}'),
      '{"message":"hello world","nested":{"ok":true}}',
    );
    assert.strictEqual(compactJson('{"line":"a\\nb","spaces":"a  b"}'), '{"line":"a\\nb","spaces":"a  b"}');
  });

  it('rejects invalid JSON instead of removing whitespace destructively', () => {
    assert.throws(() => compactJson('not json with spaces'));
  });

  it('formats and compacts without changing large numbers or duplicate keys', () => {
    const source = '{"id": 900719925474099312345, "value": -0, "same": 1, "same": 2}';
    const compact = '{"id":900719925474099312345,"value":-0,"same":1,"same":2}';

    assert.strictEqual(compactJson(source), compact);
    assert.strictEqual(
      formatJson(source),
      '{\n  "id": 900719925474099312345,\n  "value": -0,\n  "same": 1,\n  "same": 2\n}',
    );
    assert.strictEqual(compactJson(formatJson(source)), compact);
  });
});
