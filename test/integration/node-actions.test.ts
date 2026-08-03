import * as assert from 'assert';
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
});
