import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type * as ext from '../../src/extension';

suite('Node actions (mock)', () => {
  let api: ReturnType<typeof ext.getTestApi>;

  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('zk-viewer.zk-viewer-vscode');
    assert.ok(extension);
    await extension?.activate();
    const testApi = (globalThis as { __zkViewerTestApi?: ReturnType<typeof ext.getTestApi> })
      .__zkViewerTestApi;
    assert.ok(testApi);
    api = testApi!;
  });

  test('create, edit and delete flow keeps the tree consistent', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/app', Buffer.alloc(0), 'PERSISTENT');

    await vscode.commands.executeCommand(
      'zkViewer.addNode',
      { descriptor: { path: '/app' } },
      {
        name: 'config',
        mode: 'PERSISTENT',
        data: '{"a":1}',
      },
    );
    assert.strictEqual(await mock.exists('/app/config'), true);
    assert.strictEqual((await mock.getData('/app/config')).data.toString('utf8'), '{"a":1}');

    await vscode.commands.executeCommand('zkViewer.openNodeDetail', { descriptor: { path: '/app/config' } });
    const controller = api.detailController();
    assert.ok(controller);
    const loaded = controller?.getLastLoad();
    await controller?.handleMessage({
      type: 'save',
      path: '/app/config',
      text: '{"a":2}',
      version: loaded?.stat.version,
    });
    assert.strictEqual((await mock.getData('/app/config')).data.toString('utf8'), '{"a":2}');

    await vscode.commands.executeCommand(
      'zkViewer.deleteNode',
      { descriptor: { path: '/app/config' } },
      { confirm: false, recursive: false },
    );
    assert.strictEqual(await mock.exists('/app/config'), false);

    const roots = await api.treeProvider.getChildren(undefined);
    const rootChildren = await api.treeProvider.getChildren(roots[0]);
    const appChildren = await api.treeProvider.getChildren(
      rootChildren.find((n) => n.descriptor.name === 'app')!,
    );
    assert.deepStrictEqual(
      appChildren.map((n) => n.descriptor.name),
      [],
      'tree should refresh after delete',
    );

    await vscode.commands.executeCommand('zkViewer.disconnect');
  });

  test('cancelled delete confirmation does not remove the node', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/keep', Buffer.alloc(0), 'PERSISTENT');

    await vscode.commands.executeCommand(
      'zkViewer.deleteNode',
      { descriptor: { path: '/keep' } },
      {
        confirm: 'cancel',
      },
    );
    assert.strictEqual(await mock.exists('/keep'), true, 'cancelled delete must not remove the node');

    await vscode.commands.executeCommand('zkViewer.disconnect');
  });

  test('recursive delete removes a subtree', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/svc', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/svc/instances', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/svc/instances/i1', Buffer.alloc(0), 'PERSISTENT');

    await vscode.commands.executeCommand(
      'zkViewer.deleteNode',
      { descriptor: { path: '/svc' } },
      {
        confirm: false,
        recursive: true,
      },
    );
    assert.strictEqual(await mock.exists('/svc'), false);
    assert.strictEqual(await mock.exists('/svc/instances/i1'), false);

    await vscode.commands.executeCommand('zkViewer.disconnect');
  });

  test('rejects invalid node names through the add command', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();

    await vscode.commands.executeCommand(
      'zkViewer.addNode',
      { descriptor: { path: '/' } },
      {
        name: 'bad/name',
        mode: 'PERSISTENT',
        data: '',
      },
    );
    assert.strictEqual(await mock.exists('/bad'), false);
    assert.strictEqual(await mock.exists('/bad/name'), false);

    await vscode.commands.executeCommand('zkViewer.disconnect');
  });

  test('exports one node or its complete subtree with paths and exact data', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/export', Buffer.from('root'), 'PERSISTENT');
    await mock.create('/export/child', Buffer.from('{"value":1}'), 'PERSISTENT');
    await mock.create('/export/child/leaf', Buffer.from('leaf'), 'PERSISTENT');

    const singleUri = vscode.Uri.file(path.join(os.tmpdir(), `zk-viewer-single-${Date.now()}.json`));
    const subtreeUri = vscode.Uri.file(path.join(os.tmpdir(), `zk-viewer-tree-${Date.now()}.json`));
    try {
      await vscode.commands.executeCommand(
        'zkViewer.exportNodeData',
        { descriptor: { path: '/export' } },
        { targetUri: singleUri },
      );
      await vscode.commands.executeCommand(
        'zkViewer.exportSubtreeData',
        { descriptor: { path: '/export' } },
        { targetUri: subtreeUri },
      );

      const single = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(singleUri)).toString('utf8'));
      const subtree = JSON.parse(
        Buffer.from(await vscode.workspace.fs.readFile(subtreeUri)).toString('utf8'),
      );
      assert.deepStrictEqual(single.nodes, [{ path: '/export', data: 'root', encoding: 'utf8' }]);
      assert.deepStrictEqual(
        subtree.nodes.map((node: { path: string }) => node.path),
        ['/export', '/export/child', '/export/child/leaf'],
      );
      assert.strictEqual(subtree.nodes[1].data, '{"value":1}');

      mock.clear();
      const imported = await vscode.commands.executeCommand<{
        created: number;
        updated: number;
        skipped: number;
      }>('zkViewer.importNodeData', {
        sourceUri: subtreeUri,
        conflictPolicy: 'overwrite',
      });
      assert.deepStrictEqual(imported, { created: 3, updated: 0, skipped: 0 });
      assert.strictEqual((await mock.getData('/export')).data.toString(), 'root');
      assert.strictEqual((await mock.getData('/export/child')).data.toString(), '{"value":1}');
      assert.strictEqual((await mock.getData('/export/child/leaf')).data.toString(), 'leaf');
    } finally {
      await Promise.all(
        [singleUri, subtreeUri].map(async (uri) => {
          try {
            await vscode.workspace.fs.delete(uri);
          } catch {
            // The command may fail before creating the temporary file.
          }
        }),
      );
      await vscode.commands.executeCommand('zkViewer.disconnect');
    }
  });
});
