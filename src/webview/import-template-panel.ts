import * as vscode from 'vscode';
import { createImportTemplateDocument } from '../commands/import-template';
import { serializeNodeDataExport } from '../commands/export-node-data';
import type { ImportExportMessages, UiLanguage } from '../i18n/import-export-messages';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class ImportTemplatePanel {
  private static current: ImportTemplatePanel | undefined;

  static getCurrentHtml(): string | undefined {
    return ImportTemplatePanel.current?.panel.webview.html;
  }

  static open(
    context: vscode.ExtensionContext,
    messages: ImportExportMessages,
    language: UiLanguage,
    onDownload: () => Promise<unknown>,
  ): ImportTemplatePanel {
    if (ImportTemplatePanel.current) {
      ImportTemplatePanel.current.messages = messages;
      ImportTemplatePanel.current.language = language;
      ImportTemplatePanel.current.render();
      ImportTemplatePanel.current.panel.reveal(vscode.ViewColumn.Two);
      return ImportTemplatePanel.current;
    }
    const panel = new ImportTemplatePanel(context, messages, language, onDownload);
    ImportTemplatePanel.current = panel;
    return panel;
  }

  static refresh(messages: ImportExportMessages, language: UiLanguage): void {
    if (ImportTemplatePanel.current) {
      ImportTemplatePanel.current.messages = messages;
      ImportTemplatePanel.current.language = language;
      ImportTemplatePanel.current.render();
    }
  }

  private readonly panel: vscode.WebviewPanel;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private messages: ImportExportMessages,
    private language: UiLanguage,
    private readonly onDownload: () => Promise<unknown>,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'zkViewer.importFormat',
      messages.importFormatTitle,
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      },
    );
    this.panel.onDidDispose(() => {
      if (ImportTemplatePanel.current === this) {
        ImportTemplatePanel.current = undefined;
      }
    });
    this.panel.webview.onDidReceiveMessage((message: { command?: unknown }) => {
      if (message.command === 'download') {
        void this.onDownload();
      } else if (message.command === 'close') {
        this.panel.dispose();
      }
    });
    this.render();
  }

  private render(): void {
    this.panel.title = this.messages.importFormatTitle;
    this.panel.webview.html = this.buildHtml(this.panel.webview);
  }

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'import-template.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'styles.css'),
    );
    const nonce = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const template = escapeHtml(serializeNodeDataExport(createImportTemplateDocument()));
    return `<!DOCTYPE html>
<html lang="${this.language === 'zh-cn' ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>${escapeHtml(this.messages.importFormatTitle)}</title>
</head>
<body>
  <main class="template-shell">
    <header class="template-header">
      <span class="eyebrow">ZooKeeper</span>
      <h1>${escapeHtml(this.messages.importFormatTitle)}</h1>
      <p>${escapeHtml(this.messages.importFormatDescription)}</p>
    </header>
    <section class="template-card" aria-label="${escapeHtml(this.messages.importFormatTitle)}">
      <pre id="import-template" tabindex="0"><code>${template}</code></pre>
      <p class="template-hint">${escapeHtml(this.messages.importFormatDataHint)}</p>
      <footer class="template-actions">
        <button id="close-template" class="secondary-button" type="button">${escapeHtml(this.messages.closeButton)}</button>
        <button id="download-template" class="primary-button" type="button">${escapeHtml(this.messages.downloadTemplateButton)}</button>
      </footer>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
