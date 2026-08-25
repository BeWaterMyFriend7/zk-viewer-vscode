import * as assert from 'assert';
import * as vscode from 'vscode';
import type * as ext from '../../src/extension';
import { activateExtension } from './extension-helper';

suite('Node tree (mock)', () => {
  let api: ReturnType<typeof ext.getTestApi>;

  suiteSetup(async () => {
    await activateExtension();
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

  test('tree sort configuration reorders children', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/zeta', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/alpha', Buffer.alloc(0), 'PERSISTENT');

    const config = vscode.workspace.getConfiguration('zkViewer');
    await config.update('treeSort', 'none', vscode.ConfigurationTarget.Global);
    const roots = await api.treeProvider.getChildren(undefined);
    const serverOrder = await api.treeProvider.getChildren(roots[0]);
    assert.deepStrictEqual(
      serverOrder.map((node) => node.descriptor.name),
      ['zeta', 'alpha'],
    );

    await config.update('treeSort', 'name', vscode.ConfigurationTarget.Global);
    const sorted = await api.treeProvider.getChildren(roots[0]);
    assert.deepStrictEqual(
      sorted.map((node) => node.descriptor.name),
      ['alpha', 'zeta'],
    );

    await config.update('treeSort', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('zkViewer.disconnect');
  });

  test('creation-time sort configuration takes effect through the provider', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/z1', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/a2', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/m3', Buffer.alloc(0), 'PERSISTENT');

    const config = vscode.workspace.getConfiguration('zkViewer');
    await config.update('treeSort', 'ctime-desc', vscode.ConfigurationTarget.Global);
    const roots = await api.treeProvider.getChildren(undefined);
    const children = await api.treeProvider.getChildren(roots[0]);
    assert.deepStrictEqual(
      children.map((node) => node.descriptor.name),
      ['m3', 'a2', 'z1'],
      'newest created node comes first with ctime-desc',
    );

    await config.update('treeSort', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('zkViewer.disconnect');
  });
});
