import * as assert from 'assert';
import * as vscode from 'vscode';
import type * as ext from '../../src/extension';
import type { SearchResult } from '../../src/search/node-search';

suite('Search and navigation (mock)', () => {
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

  test('search returns results and gotoPath reveals the selected node', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/app', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/app/config', Buffer.from('{"role":"web"}'), 'PERSISTENT');
    await mock.create('/svc-1', Buffer.alloc(0), 'PERSISTENT');

    const results = (await vscode.commands.executeCommand('zkViewer.search', {
      mode: 'prefix',
      query: 'config',
    })) as SearchResult[];
    assert.deepStrictEqual(
      results.map((r) => r.path),
      ['/app/config'],
    );

    await vscode.commands.executeCommand('zkViewer.gotoPath', '/app/config');
    assert.strictEqual(
      api.lastRevealedPath(),
      '/app/config',
      `gotoPath should reveal the target node (last error: ${api.lastCommandError() ?? 'none'})`,
    );

    await vscode.commands.executeCommand('zkViewer.disconnect');
  });
});
