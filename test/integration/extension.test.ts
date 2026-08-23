import * as assert from 'assert';
import * as vscode from 'vscode';
import { getImportExportMessages } from '../../src/i18n/import-export-messages';

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
      contributes?: {
        menus?: {
          'view/item/context'?: Array<{ command: string; when?: string; group?: string }>;
          'view/title'?: Array<{ command: string; when?: string; group?: string }>;
        };
      };
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
    assert.ok(
      commands.every((command) => !command.startsWith('zkViewer.importNodeData')),
      'node context menu must not include the global import command',
    );
    for (const command of [
      'zkViewer.exportNodeData.zh',
      'zkViewer.exportNodeData.en',
      'zkViewer.exportSubtreeData.zh',
      'zkViewer.exportSubtreeData.en',
    ]) {
      assert.ok(commands.includes(command), `context menu should include localized command ${command}`);
    }

    const titleItems = manifest?.contributes?.menus?.['view/title'] ?? [];
    const sort = titleItems.find((item) => item.command === 'zkViewer.setTreeSort');
    assert.strictEqual(sort?.group, 'zoo@3');
    for (const item of titleItems.filter((entry) => entry.command.startsWith('zkViewer.importNodeData.'))) {
      assert.strictEqual(item.group, 'zoo@4');
      assert.match(item.when ?? '', /zkViewer:connected == true/);
    }
    for (const item of titleItems.filter((entry) => entry.command.startsWith('zkViewer.openImportFormat.'))) {
      assert.strictEqual(item.group, 'zoo@5');
    }
    for (const item of titleItems.filter((entry) => entry.command.startsWith('zkViewer.setLanguage.'))) {
      assert.strictEqual(item.group, 'navigation@6');
    }
    assert.strictEqual(
      titleItems.filter((item) => item.command.startsWith('zkViewer.importNodeData.')).length,
      2,
      'the title menu should contain one Chinese and one English import alias',
    );
    assert.strictEqual(
      titleItems.filter((item) => item.command.startsWith('zkViewer.openImportFormat.')).length,
      2,
      'the title menu should contain one Chinese and one English format alias',
    );
    assert.strictEqual(
      titleItems.filter((item) => item.command.startsWith('zkViewer.setLanguage.')).length,
      2,
      'the title bar should contain one Chinese and one English language alias',
    );
  });

  test('import and export command titles follow the VS Code display language', () => {
    const manifest = vscode.extensions.getExtension('zk-viewer.zk-viewer-vscode')?.packageJSON as {
      contributes?: { commands?: Array<{ command: string; title: string }> };
    };
    const commands = manifest?.contributes?.commands ?? [];
    const messages = getImportExportMessages(vscode.env.language);
    assert.strictEqual(
      commands.find((item) => item.command === 'zkViewer.importNodeData')?.title,
      messages.importButton,
    );
    assert.strictEqual(
      commands.find((item) => item.command === 'zkViewer.exportNodeData')?.title,
      messages.exportNodeButton,
    );
  });

  test('language command persists an explicit preference globally', async () => {
    const config = vscode.workspace.getConfiguration('zkViewer');
    const previous = config.get<string>('uiLanguage');
    try {
      const chinese = await vscode.commands.executeCommand<string>('zkViewer.setLanguage', {
        preference: 'zh-cn',
        silent: true,
      });
      assert.strictEqual(chinese, 'zh-cn');
      assert.strictEqual(vscode.workspace.getConfiguration('zkViewer').get<string>('uiLanguage'), 'zh-cn');

      const english = await vscode.commands.executeCommand<string>('zkViewer.setLanguage', {
        preference: 'en',
        silent: true,
      });
      assert.strictEqual(english, 'en');
      assert.strictEqual(vscode.workspace.getConfiguration('zkViewer').get<string>('uiLanguage'), 'en');
    } finally {
      await config.update('uiLanguage', previous, vscode.ConfigurationTarget.Global);
    }
  });

  test('localized aliases can activate on VS Code 1.60 and language is application-scoped', () => {
    const manifest = vscode.extensions.getExtension('zk-viewer.zk-viewer-vscode')?.packageJSON as {
      activationEvents?: string[];
      contributes?: {
        commands?: Array<{ command: string }>;
        configuration?: {
          properties?: Record<string, { scope?: string }>;
        };
      };
    };
    const aliases = (manifest.contributes?.commands ?? [])
      .map((item) => item.command)
      .filter((command) => /\.(zh|en)$/.test(command));
    for (const command of aliases) {
      assert.ok(
        manifest.activationEvents?.includes(`onCommand:${command}`),
        `localized alias must explicitly activate the extension: ${command}`,
      );
    }
    assert.strictEqual(
      manifest.contributes?.configuration?.properties?.['zkViewer.uiLanguage']?.scope,
      'application',
    );
  });
});
