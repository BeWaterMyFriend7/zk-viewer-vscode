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
    assert.ok(html.includes('id="display-json"'), 'the panel should provide a JSON display button');
    assert.ok(html.includes('id="display-text"'), 'the panel should provide a TXT display button');
    assert.ok(html.includes('id="toggle-wrap"'), 'the panel should provide a line-wrap button');
    assert.ok(html.includes('id="compact-json"'), 'the panel should provide a compact JSON button');
    assert.ok(html.includes('class="detail-shell"'), 'the panel should use the compact detail layout');
    assert.ok(html.includes('class="stat-card"'), 'node metadata should be grouped in a card');
    assert.ok(html.includes('class="segmented-control"'), 'display modes should be grouped together');
    assert.ok(html.includes('class="action-bar"'), 'editing actions should have a separate footer');

    await controller?.handleMessage({
      type: 'save',
      path: '/app/config',
      text: '{"role":"admin"}',
      version: loaded?.stat.version,
    });
    assert.strictEqual((await mock.getData('/app/config')).data.toString('utf8'), '{"role":"admin"}');

    await vscode.commands.executeCommand('zkViewer.disconnect');
  });

  test('closes the detail panel when the node is deleted', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/gone', Buffer.from('{"keep":true}'), 'PERSISTENT');

    await vscode.commands.executeCommand('zkViewer.openNodeDetail', { descriptor: { path: '/gone' } });
    assert.ok(api.detailController(), 'the detail panel should be open');
    // Give the async load/watch registration a moment to finish before deleting.
    await new Promise((resolve) => setTimeout(resolve, 100));

    await mock.remove('/gone');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(api.detailController(), undefined, 'the panel should close after the node is deleted');

    await vscode.commands.executeCommand('zkViewer.disconnect');
  });

  test('renders every detail action and label in the selected Chinese language', async () => {
    const config = vscode.workspace.getConfiguration('zkViewer');
    const previous = config.get<string>('uiLanguage');
    try {
      await vscode.commands.executeCommand('zkViewer.setLanguage', {
        preference: 'zh-cn',
        silent: true,
      });
      await api.store.clear();
      await vscode.commands.executeCommand('zkViewer.connect');
      const mock = api.mockClients.get('localhost:2181|');
      assert.ok(mock);
      mock.clear();
      await mock.create('/localized', Buffer.from('{"enabled":true}'), 'PERSISTENT');

      await vscode.commands.executeCommand('zkViewer.openNodeDetail', {
        descriptor: { path: '/localized' },
      });
      const html = api.detailPanelHtml() ?? '';
      for (const expected of [
        '节点信息',
        '节点数据',
        '显示',
        '换行：开',
        '压缩 JSON',
        '编辑',
        '保存',
        '只读',
      ]) {
        assert.ok(html.includes(expected), `detail panel should include Chinese text: ${expected}`);
      }
      for (const english of [
        'Node information',
        'Node data',
        'Display',
        'Wrap: On',
        'Minify JSON',
        '>Edit<',
        '>Save<',
      ]) {
        assert.ok(!html.includes(english), `detail panel should not include English UI text: ${english}`);
      }
    } finally {
      await vscode.commands.executeCommand('zkViewer.disconnect');
      await config.update('uiLanguage', previous, vscode.ConfigurationTarget.Global);
    }
  });
});
