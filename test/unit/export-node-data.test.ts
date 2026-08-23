import * as assert from 'assert';
import { collectNodeDataExport, serializeNodeDataExport } from '../../src/commands/export-node-data';
import { MockZkClient } from '../../src/zk/mock-zk';

describe('node data export', () => {
  let client: MockZkClient;

  beforeEach(async () => {
    client = new MockZkClient();
    await client.connect();
    await client.create('/app', Buffer.from('root data'), 'PERSISTENT');
    await client.create('/app/z-last', Buffer.from('z'), 'PERSISTENT');
    await client.create('/app/config', Buffer.from('{"role":"web"}'), 'PERSISTENT');
    await client.create('/app/config/nested', Buffer.from('leaf data'), 'PERSISTENT');
  });

  it('exports only the selected node with its complete path and exact UTF-8 data', async () => {
    const exported = await collectNodeDataExport(client, '/app', false);

    assert.strictEqual(exported.format, 'zk-viewer-node-data');
    assert.strictEqual(exported.version, 1);
    assert.strictEqual(exported.rootPath, '/app');
    assert.strictEqual(exported.recursive, false);
    assert.deepStrictEqual(exported.nodes, [
      {
        path: '/app',
        data: 'root data',
        encoding: 'utf8',
      },
    ]);
  });

  it('exports the selected node and every descendant in deterministic path order', async () => {
    const exported = await collectNodeDataExport(client, '/app', true);

    assert.deepStrictEqual(
      exported.nodes.map((node) => node.path),
      ['/app', '/app/config', '/app/config/nested', '/app/z-last'],
    );
    assert.deepStrictEqual(
      exported.nodes.map((node) => node.data),
      ['root data', '{"role":"web"}', 'leaf data', 'z'],
    );
  });

  it('uses base64 when UTF-8 cannot preserve the original bytes', async () => {
    await client.create('/binary', Buffer.from([0xff, 0x00, 0x61]), 'PERSISTENT');

    const exported = await collectNodeDataExport(client, '/binary', false);
    const entry = exported.nodes[0];

    assert.strictEqual(entry.encoding, 'base64');
    assert.deepStrictEqual(Buffer.from(entry.data, 'base64'), Buffer.from([0xff, 0x00, 0x61]));
  });

  it('serializes a readable JSON document that round-trips without data loss', async () => {
    const exported = await collectNodeDataExport(client, '/app', true);
    const text = serializeNodeDataExport(exported);

    assert.ok(text.endsWith('\n'));
    assert.deepStrictEqual(JSON.parse(text), exported);
  });
});
