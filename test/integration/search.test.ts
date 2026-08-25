import * as assert from 'assert';
import * as vscode from 'vscode';
import type * as ext from '../../src/extension';
import { isSearchOptions, type SearchOutcome } from '../../src/search/node-search';
import { activateExtension } from './extension-helper';

suite('Search and navigation (mock)', () => {
  let api: ReturnType<typeof ext.getTestApi>;

  suiteSetup(async () => {
    await activateExtension();
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

    const outcome = (await vscode.commands.executeCommand('zkViewer.search', {
      mode: 'prefix',
      query: 'config',
    })) as SearchOutcome;
    assert.deepStrictEqual(
      outcome.results.map((r) => r.path),
      ['/app/config'],
    );
    assert.strictEqual(outcome.truncated, false);

    await vscode.commands.executeCommand('zkViewer.gotoPath', '/app/config');
    assert.strictEqual(
      api.lastRevealedPath(),
      '/app/config',
      `gotoPath should reveal the target node (last error: ${api.lastCommandError() ?? 'none'})`,
    );

    await vscode.commands.executeCommand('zkViewer.disconnect');
  });

  test('title-bar invocation (TreeView argument) prompts instead of short-circuiting', async () => {
    // VS Code passes the TreeView as the first argument to view/title commands.
    // It must not be mistaken for explicit SearchOptions (which would silently
    // skip the interactive search prompt).
    assert.strictEqual(isSearchOptions(api.treeView), false, 'TreeView must not look like SearchOptions');
    assert.strictEqual(isSearchOptions({ mode: 'prefix', query: 'config' }), true);
  });

  test('exact path search locates and reveals the target node', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/app', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/app/config', Buffer.from('{"role":"web"}'), 'PERSISTENT');

    const outcome = (await vscode.commands.executeCommand('zkViewer.search', {
      mode: 'exact',
      query: '/app/config',
    })) as SearchOutcome;
    assert.deepStrictEqual(
      outcome.results.map((r) => r.path),
      ['/app/config'],
    );
    assert.strictEqual(outcome.truncated, false);

    await vscode.commands.executeCommand('zkViewer.disconnect');
  });

  test('path contains search matches text at any depth', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/sg', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/sg/abc', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/sg/abc/192.168.126.100:28080', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/sg/abc/192.168.126.100:28080/1.0', Buffer.alloc(0), 'PERSISTENT');

    const outcome = (await vscode.commands.executeCommand('zkViewer.search', {
      mode: 'contains',
      query: '168',
    })) as SearchOutcome;

    assert.deepStrictEqual(
      outcome.results.map((result) => result.path),
      ['/sg/abc/192.168.126.100:28080', '/sg/abc/192.168.126.100:28080/1.0'],
    );

    await vscode.commands.executeCommand('zkViewer.disconnect');
  });

  test('subtree search limits results to the target node subtree', async () => {
    await api.store.clear();
    await vscode.commands.executeCommand('zkViewer.connect');
    const mock = api.mockClients.get('localhost:2181|');
    assert.ok(mock);
    mock.clear();
    await mock.create('/app', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/app/config', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/app/config-prod', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/svc-1', Buffer.alloc(0), 'PERSISTENT');
    await mock.create('/svc-1/config', Buffer.alloc(0), 'PERSISTENT');

    // Right-click passes the node as the first argument; explicit options
    // skip the interactive prompts but the subtree is forced to the node path.
    const outcome = (await vscode.commands.executeCommand(
      'zkViewer.searchSubtree',
      { descriptor: { path: '/app' } },
      { mode: 'prefix', query: 'config' },
    )) as SearchOutcome;

    assert.deepStrictEqual(
      outcome.results.map((r) => r.path),
      ['/app/config', '/app/config-prod'],
      'matches outside the subtree must be excluded',
    );
    assert.strictEqual(outcome.truncated, false);

    await vscode.commands.executeCommand('zkViewer.disconnect');
  });
});
