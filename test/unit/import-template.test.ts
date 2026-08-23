import * as assert from 'assert';
import { IMPORT_TEMPLATE_FILE_NAME, createImportTemplateDocument } from '../../src/commands/import-template';
import { collectNodeDataExport, serializeNodeDataExport } from '../../src/commands/export-node-data';
import { importNodeData, parseNodeDataImport } from '../../src/commands/import-node-data';
import { MockZkClient } from '../../src/zk/mock-zk';

describe('standard import template', () => {
  it('uses the production export document and import parser without a template-specific format', () => {
    assert.strictEqual(IMPORT_TEMPLATE_FILE_NAME, 'zk-viewer-import-template.json');

    const exported = createImportTemplateDocument();
    const serialized = serializeNodeDataExport(exported);
    const imported = parseNodeDataImport(serialized);

    assert.deepStrictEqual(Object.keys(JSON.parse(serialized)), [
      'format',
      'version',
      'rootPath',
      'recursive',
      'nodes',
    ]);
    assert.strictEqual(exported.format, 'zk-viewer-node-data');
    assert.strictEqual(exported.version, 1);
    assert.strictEqual(imported.rootPath, '/example');
    assert.deepStrictEqual(
      imported.nodes.map((node) => ({ path: node.path, data: node.data })),
      [
        { path: '/example', data: Buffer.from('{"name":"root"}') },
        { path: '/example/child', data: Buffer.from('plain text') },
        { path: '/example/binary', data: Buffer.from([0, 1, 2]) },
      ],
    );
  });

  it('round-trips real single-node and subtree exports through the production importer', async () => {
    const source = new MockZkClient();
    await source.connect();
    await source.create('/export', Buffer.from('root'), 'PERSISTENT');
    await source.create('/export/json', Buffer.from('{"enabled":true}'), 'PERSISTENT');
    await source.create('/export/binary', Buffer.from([0xff, 0x00, 0x61]), 'PERSISTENT');

    for (const recursive of [false, true]) {
      const exported = await collectNodeDataExport(source, '/export', recursive);
      const importedDocument = parseNodeDataImport(serializeNodeDataExport(exported));
      const target = new MockZkClient();
      await target.connect();
      await importNodeData(target, importedDocument, 'overwrite');

      const expectedPaths = recursive ? ['/export', '/export/json', '/export/binary'] : ['/export'];
      for (const path of expectedPaths) {
        assert.deepStrictEqual((await target.getData(path)).data, (await source.getData(path)).data);
      }
      assert.strictEqual(await target.exists('/export/json'), recursive);
      assert.strictEqual(await target.exists('/export/binary'), recursive);
    }
  });
});
