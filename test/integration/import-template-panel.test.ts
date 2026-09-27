import * as assert from 'assert';
import * as vscode from 'vscode';
import { createImportTemplateDocument } from '../../src/commands/import-template';
import { serializeNodeDataExport } from '../../src/commands/export-node-data';
import type * as ext from '../../src/extension';
import { activateExtension } from './extension-helper';

suite('Import format panel', () => {
  let api: ReturnType<typeof ext.getTestApi>;

  suiteSetup(async () => {
    await activateExtension();
    const testApi = (globalThis as { __zkViewerTestApi?: ReturnType<typeof ext.getTestApi> })
      .__zkViewerTestApi;
    assert.ok(testApi);
    api = testApi!;
  });

  test('shows the canonical template as read-only content', async () => {
    await vscode.commands.executeCommand('zkViewer.openImportFormat');
    const html = api.importTemplateHtml();
    assert.ok(html, 'import format panel should be open');
    assert.match(html, /<pre[^>]*id="import-template"/);
    assert.doesNotMatch(html, /<textarea/i);
    assert.doesNotMatch(html, /contenteditable/i);
    assert.ok(html.includes('&quot;format&quot;: &quot;zk-viewer-node-data&quot;'));
    assert.ok(html.includes('id="download-template"'));
    assert.ok(html.includes('id="close-template"'));
  });

  test('downloads the exact canonical serialized template', async () => {
    const targetUri = vscode.Uri.joinPath(
      vscode.Uri.file(__dirname),
      `zk-viewer-import-template-${Date.now()}.json`,
    );
    try {
      await vscode.commands.executeCommand('zkViewer.downloadImportTemplate', { targetUri, silent: true });
      const actual = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString('utf8');
      assert.strictEqual(actual, serializeNodeDataExport(createImportTemplateDocument()));
    } finally {
      try {
        await vscode.workspace.fs.delete(targetUri);
      } catch {
        // The assertion already reports a missing download more clearly.
      }
    }
  });

  test('refreshes the open panel after an explicit language switch', async () => {
    const previous = vscode.workspace.getConfiguration('zkViewer').get<string>('uiLanguage');
    try {
      await vscode.commands.executeCommand('zkViewer.setLanguage', {
        preference: 'zh-cn',
        silent: true,
      });
      await vscode.commands.executeCommand('zkViewer.openImportFormat');
      assert.ok(api.importTemplateHtml()?.includes('ZooKeeper 导入格式'));
      assert.ok(api.importTemplateHtml()?.includes('<html lang="zh-CN">'));

      await vscode.commands.executeCommand('zkViewer.setLanguage', {
        preference: 'en',
        silent: true,
      });
      assert.ok(api.importTemplateHtml()?.includes('ZooKeeper Import Format'));
      assert.ok(api.importTemplateHtml()?.includes('<html lang="en">'));
    } finally {
      await vscode.workspace
        .getConfiguration('zkViewer')
        .update('uiLanguage', previous, vscode.ConfigurationTarget.Global);
    }
  });
});
