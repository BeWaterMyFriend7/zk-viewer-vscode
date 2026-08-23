import * as assert from 'assert';
import { importNodeData, parseNodeDataImport } from '../../src/commands/import-node-data';
import { MockZkClient } from '../../src/zk/mock-zk';

describe('node data import', () => {
  it('parses the exported document and decodes UTF-8 and Base64 without data loss', () => {
    const document = parseNodeDataImport(
      JSON.stringify({
        format: 'zk-viewer-node-data',
        version: 1,
        rootPath: '/app',
        recursive: true,
        nodes: [
          { path: '/app', data: 'root data', encoding: 'utf8' },
          { path: '/app/binary', data: '/wBh', encoding: 'base64' },
        ],
      }),
    );

    assert.strictEqual(document.rootPath, '/app');
    assert.deepStrictEqual(document.nodes[0], { path: '/app', data: Buffer.from('root data') });
    assert.deepStrictEqual(document.nodes[1], {
      path: '/app/binary',
      data: Buffer.from([0xff, 0x00, 0x61]),
    });
  });

  it('creates missing nodes parent-first and restores their exact data', async () => {
    const client = new MockZkClient();
    await client.connect();
    const document = parseNodeDataImport(
      JSON.stringify({
        format: 'zk-viewer-node-data',
        version: 1,
        rootPath: '/app',
        recursive: true,
        nodes: [
          { path: '/app/config/leaf', data: '/wBh', encoding: 'base64' },
          { path: '/app', data: 'root data', encoding: 'utf8' },
          { path: '/app/config', data: '{"enabled":true}', encoding: 'utf8' },
        ],
      }),
    );

    const result = await importNodeData(client, document, 'overwrite');

    assert.deepStrictEqual(result, { created: 3, updated: 0, skipped: 0 });
    assert.strictEqual((await client.getData('/app')).data.toString(), 'root data');
    assert.strictEqual((await client.getData('/app/config')).data.toString(), '{"enabled":true}');
    assert.deepStrictEqual((await client.getData('/app/config/leaf')).data, Buffer.from([0xff, 0x00, 0x61]));
  });

  it('supports overwriting or skipping nodes that already exist', async () => {
    const document = parseNodeDataImport(
      JSON.stringify({
        format: 'zk-viewer-node-data',
        version: 1,
        rootPath: '/existing',
        recursive: false,
        nodes: [{ path: '/existing', data: 'imported', encoding: 'utf8' }],
      }),
    );

    const skippedClient = new MockZkClient();
    await skippedClient.connect();
    await skippedClient.create('/existing', Buffer.from('original'), 'PERSISTENT');
    assert.deepStrictEqual(await importNodeData(skippedClient, document, 'skip'), {
      created: 0,
      updated: 0,
      skipped: 1,
    });
    assert.strictEqual((await skippedClient.getData('/existing')).data.toString(), 'original');

    const overwrittenClient = new MockZkClient();
    await overwrittenClient.connect();
    await overwrittenClient.create('/existing', Buffer.from('original'), 'PERSISTENT');
    assert.deepStrictEqual(await importNodeData(overwrittenClient, document, 'overwrite'), {
      created: 0,
      updated: 1,
      skipped: 0,
    });
    assert.strictEqual((await overwrittenClient.getData('/existing')).data.toString(), 'imported');
  });

  it('rejects malformed, out-of-root, duplicate, or lossy import entries', () => {
    const valid = {
      format: 'zk-viewer-node-data',
      version: 1,
      rootPath: '/app',
      recursive: true,
      nodes: [{ path: '/app', data: 'root', encoding: 'utf8' }],
    };
    const invalidDocuments = [
      { ...valid, rootPath: 'app' },
      { ...valid, recursive: 'yes' },
      { ...valid, nodes: [] },
      { ...valid, nodes: [{ path: '/other', data: 'x', encoding: 'utf8' }] },
      { ...valid, nodes: [{ path: '/app/', data: 'x', encoding: 'utf8' }] },
      {
        ...valid,
        nodes: [
          { path: '/app', data: 'one', encoding: 'utf8' },
          { path: '/app', data: 'two', encoding: 'utf8' },
        ],
      },
      { ...valid, nodes: [{ path: '/app', data: '***not-base64***', encoding: 'base64' }] },
      {
        ...valid,
        recursive: false,
        nodes: [
          { path: '/app', data: 'root', encoding: 'utf8' },
          { path: '/app/child', data: 'child', encoding: 'utf8' },
        ],
      },
    ];

    assert.throws(() => parseNodeDataImport('{broken'));
    for (const document of invalidDocuments) {
      assert.throws(() => parseNodeDataImport(JSON.stringify(document)));
    }
  });

  it('checks missing external parents before making any changes', async () => {
    const client = new MockZkClient();
    await client.connect();
    const document = parseNodeDataImport(
      JSON.stringify({
        format: 'zk-viewer-node-data',
        version: 1,
        rootPath: '/app',
        recursive: true,
        nodes: [
          { path: '/app', data: 'root', encoding: 'utf8' },
          { path: '/app/missing/leaf', data: 'leaf', encoding: 'utf8' },
        ],
      }),
    );

    await assert.rejects(() => importNodeData(client, document, 'overwrite'), /Parent node does not exist/);
    assert.strictEqual(await client.exists('/app'), false, 'preflight must prevent a partial import');
  });
});
