import * as assert from 'assert';
import * as vscode from 'vscode';
import type * as ext from '../../src/extension';

suite('Node tree (mock)', () => {
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

  test('tree renders the root node and refreshes after changes', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    assert.strictEqual(api.manager.getState(), 'connected');

    const roots = await api.treeProvider.getChildren(undefined);
    assert.strictEqual(roots.length, 1);
    assert.strictEqual(roots[0].descriptor.path, '/');

    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/app', Buffer.from('{}'), 'PERSISTENT');
    await mock.create('/app/config', Buffer.from('{"a":1}'), 'PERSISTENT');

    await vscode.commands.executeCommand('zkViewer.refresh');
    const rootChildren = await api.treeProvider.getChildren(roots[0]);
    assert.deepStrictEqual(
      rootChildren.map((node) => node.descriptor.name),
      ['app'],
    );

    const appChildren = await api.treeProvider.getChildren(rootChildren[0]);
    assert.deepStrictEqual(
      appChildren.map((node) => node.descriptor.name),
      ['config'],
    );

    await vscode.commands.executeCommand('zkViewer.disconnect');
    assert.deepStrictEqual(await api.treeProvider.getChildren(roots[0]), []);
  });
});
