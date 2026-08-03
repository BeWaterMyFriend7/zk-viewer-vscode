import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension smoke', () => {
  test('extension activates', async () => {
    const ids = vscode.extensions.all.map((e) => e.id);
    const ext =
      vscode.extensions.getExtension('zk-viewer.zk-viewer-vscode') ??
      vscode.extensions.all.find((e) => e.id.toLowerCase().includes('zk-viewer'));
    assert.ok(ext, `extension should be installed. Available: ${ids.join(', ')}`);
    await ext?.activate();
    assert.ok(ext?.isActive, 'extension should be active');
  });

  test('all contributed commands are registered', async () => {
    const ext =
      vscode.extensions.getExtension('zk-viewer.zk-viewer-vscode') ??
      vscode.extensions.all.find((e) => e.id.toLowerCase().includes('zk-viewer'));
    const manifest = ext?.packageJSON as
      { contributes?: { commands?: Array<{ command: string }> } } | undefined;
    const contributed = manifest?.contributes?.commands ?? [];
    assert.ok(contributed.length >= 13, 'expected at least 13 contributed commands');
    for (const { command } of contributed) {
      const item = await vscode.commands.getCommands(true).then((all) => all.find((c) => c === command));
      assert.ok(item, `command should be registered: ${command}`);
    }
  });

  test('tree context menus contribute node actions', async () => {
    const manifest = vscode.extensions.getExtension('zk-viewer.zk-viewer-vscode')?.packageJSON as {
      contributes?: { menus?: { 'view/item/context'?: Array<{ command: string }> } };
    };
    const items = manifest?.contributes?.menus?.['view/item/context'] ?? [];
    const commands = items.map((item) => item.command);
    for (const command of [
      'zkViewer.openNodeDetail',
      'zkViewer.addNode',
      'zkViewer.editNode',
      'zkViewer.deleteNode',
      'zkViewer.copyPath',
      'zkViewer.refresh',
    ]) {
      assert.ok(commands.includes(command), `context menu should include ${command}`);
    }
  });
});
