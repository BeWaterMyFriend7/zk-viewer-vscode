import * as assert from 'assert';
import * as vscode from 'vscode';
import type * as ext from '../../src/extension';

suite('Detail panel (mock)', () => {
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

  test('opens the detail panel, loads stat, and saves JSON data', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/app', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/app/config', Buffer.from('{"role":"web"}'), 'PERSISTENT');

    await vscode.commands.executeCommand('zkViewer.openNodeDetail', { descriptor: { path: '/app/config' } });
    const controller = api.detailController();
    assert.ok(controller, 'the detail panel should expose a controller');
    const loaded = controller?.getLastLoad();
    assert.strictEqual(loaded?.path, '/app/config');
    assert.strictEqual(loaded?.stat.numChildren, 0);

    const html = api.detailPanelHtml() ?? '';
    assert.ok(html.includes('id="edit"'), 'the panel should provide an Edit button');

    await controller?.handleMessage({
      type: 'save',
      path: '/app/config',
      text: '{"role":"admin"}',
      version: loaded?.stat.version,
    });
    assert.strictEqual((await mock.getData('/app/config')).data.toString('utf8'), '{"role":"admin"}');

    await vscode.commands.executeCommand('zkViewer.disconnect');
  });
});
