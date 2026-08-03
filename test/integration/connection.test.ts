import * as assert from 'assert';
import * as vscode from 'vscode';
import type * as ext from '../../src/extension';

suite('Connection management (mock)', () => {
  let api: ReturnType<typeof ext.getTestApi>;

  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('zk-viewer.zk-viewer-vscode');
    assert.ok(extension, 'extension should be loaded');
    await extension?.activate();
    const testApi = (globalThis as { __zkViewerTestApi?: ReturnType<typeof ext.getTestApi> })
      .__zkViewerTestApi;
    assert.ok(testApi, 'test API should be published by the extension in mock mode');
    api = testApi!;
  });

  test('connect and disconnect roundtrip drives the mock client', async () => {
    await api.store.clear();

    await vscode.commands.executeCommand('zkViewer.connect');
    assert.strictEqual(api.manager.getState(), 'connected');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock, 'a default mock client should be created');

    await vscode.commands.executeCommand('zkViewer.disconnect');
    assert.strictEqual(api.manager.getState(), 'closed');
    assert.strictEqual(mock?.closeCalls, 1, 'disconnect should close the client');
  });

  test('connection config CRUD persists in the workspace', async () => {
    await api.store.clear();

    await api.store.save({ id: 't1', name: 'Test', hosts: 'h:2181' }, 'secret');
    const listed = await api.store.list();
    assert.strictEqual(listed.length, 1);
    assert.strictEqual(await api.store.getPassword('t1'), 'secret');

    await api.store.remove('t1');
    assert.strictEqual((await api.store.list()).length, 0);
  });
});
