import * as vscode from 'vscode';
import { validateNodeName } from '../commands/node-commands';
import type { ImportExportMessages, NodeMessages, UiLanguage } from '../i18n/import-export-messages';
import type { ZkClient, CreateMode } from '../zk/zk-client';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class NodeCreatePanel {
  private static current: NodeCreatePanel | undefined;

  static getCurrentHtml(): string | undefined {
    return NodeCreatePanel.current?.panel.webview.html;
  }

  static open(args: {
    context: vscode.ExtensionContext;
    client: ZkClient;
    parentPath: string;
    messages: ImportExportMessages;
    language: UiLanguage;
    initial?: { name?: string; mode?: string; data?: string };
    onCreated?: (createdPath: string) => void;
  }): NodeCreatePanel {
    if (NodeCreatePanel.current) {
      NodeCreatePanel.current.dispose();
    }
    const panel = new NodeCreatePanel(args);
    NodeCreatePanel.current = panel;
    return panel;
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly client: ZkClient;
  private readonly parentPath: string;

  private constructor(
    private readonly args: {
      context: vscode.ExtensionContext;
      client: ZkClient;
      parentPath: string;
      messages: ImportExportMessages;
      language: UiLanguage;
      initial?: { name?: string; mode?: string; data?: string };
      onCreated?: (createdPath: string) => void;
    },
  ) {
    this.client = args.client;
    this.parentPath = args.parentPath;
    this.panel = vscode.window.createWebviewPanel(
      'zkViewer.nodeCreate',
      args.messages.node.addNodeTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(args.context.extensionUri, 'media')],
      },
    );
    this.panel.onDidDispose(() => {
      if (NodeCreatePanel.current === this) {
        NodeCreatePanel.current = undefined;
      }
    });
    this.panel.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message);
    });
    this.render();
  }

  private nodeMessages(): NodeMessages {
    return this.args.messages.node;
  }

  private async handleMessage(message: {
    type?: string;
    name?: string;
    mode?: string;
    data?: string;
  }): Promise<void> {
    if (message.type === 'cancel') {
      this.dispose();
      return;
    }
    if (message.type !== 'create') {
      return;
    }
    const name = (message.name ?? '').trim();
    if (!name) {
      void this.postError(this.nodeMessages().invalidName.empty);
      return;
    }
    const invalid = validateNodeName(name, this.nodeMessages().invalidName);
    if (invalid) {
      void this.postError(invalid);
      return;
    }
    const mode = (message.mode ?? 'PERSISTENT') as CreateMode;
    const fullPath = this.parentPath === '/' ? `/${name}` : `${this.parentPath}/${name}`;
    const data = message.data ?? '';
    try {
      const created = await this.client.create(fullPath, Buffer.from(data, 'utf8'), mode);
      this.args.onCreated?.(created);
      this.dispose();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      void this.postError(detail);
    }
  }

  private postError(message: string): void {
    void this.panel.webview.postMessage({
      type: 'nodeCreateError',
      message,
    });
  }

  dispose(): void {
    this.panel.dispose();
  }

  private render(): void {
    const messages = this.args.messages.node;
    this.panel.title = messages.addNodeTitle;
    const initial = this.args.initial ?? {};
    const initialJson = JSON.stringify({
      parentPath: this.parentPath,
      name: initial.name ?? '',
      mode: initial.mode ?? 'PERSISTENT',
      data: initial.data ?? '',
    }).replace(/</g, '\\u003c');
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.args.context.extensionUri, 'media', 'node-create.js'),
    );
    const dataEditorScriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.args.context.extensionUri, 'media', 'data-editor.js'),
    );
    const styleUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.args.context.extensionUri, 'media', 'styles.css'),
    );
    const nonce = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const detail = this.args.messages.detail;
    const detailMessagesJson = JSON.stringify(detail).replace(/</g, '\\u003c');
    const typeLabels = messages.typeLabels;
    const modeOptionsHtml = [
      ['PERSISTENT', typeLabels.PERSISTENT],
      ['PERSISTENT_SEQUENTIAL', typeLabels.PERSISTENT_SEQUENTIAL],
      ['EPHEMERAL', typeLabels.EPHEMERAL],
      ['EPHEMERAL_SEQUENTIAL', typeLabels.EPHEMERAL_SEQUENTIAL],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}"${(initial.mode ?? 'PERSISTENT') === value ? ' selected' : ''}>${escapeHtml(label)}</option>`,
      )
      .join('');
    this.panel.webview.html = `<!DOCTYPE html>
<html lang="${this.args.language === 'zh-cn' ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>${escapeHtml(messages.addNodeTitle)}</title>
</head>
<body>
  <main class="form-shell">
    <header class="form-header">
      <h1>${escapeHtml(messages.addNodeTitle)}</h1>
    </header>
    <form id="node-create-form" class="form-card">
      <label>
        <span>${escapeHtml(messages.parentPathTitle)}</span>
        <div class="static-value">${escapeHtml(this.parentPath)}</div>
      </label>
      <label>
        <span>${escapeHtml(messages.nodeNameLabel)}</span>
        <input id="n-name" type="text" value="${escapeHtml(initial.name ?? '')}" required>
      </label>
      <label>
        <span>${escapeHtml(messages.typePrompt)}</span>
        <select id="n-mode">${modeOptionsHtml}</select>
      </label>
      <section class="data-card" aria-labelledby="data-heading">
        <div class="data-toolbar">
          <h2 id="data-heading">${escapeHtml(detail.dataHeading)}</h2>
          <div class="toolbar display-toolbar">
            <span class="toolbar-label">${escapeHtml(detail.displayLabel)}</span>
            <div class="segmented-control" role="group" aria-label="${escapeHtml(detail.displayModeAria)}">
              <button id="display-json" type="button" aria-pressed="true">JSON</button>
              <button id="display-text" type="button" aria-pressed="false">TXT</button>
            </div>
            <button id="toggle-wrap" class="secondary-button" type="button" aria-pressed="true">${escapeHtml(detail.wrapOn)}</button>
            <button id="compact-json" class="secondary-button" type="button">${escapeHtml(detail.minifyJson)}</button>
          </div>
        </div>
        <textarea id="data" spellcheck="false" placeholder="${escapeHtml(detail.dataPlaceholder)}"></textarea>
        <footer class="action-bar">
          <span id="status" role="status" aria-live="polite"></span>
          <div class="action-buttons">
            <button id="cancel-create" class="secondary-button" type="button">${escapeHtml(messages.cancelNodeButton)}</button>
            <button id="save-create" class="primary-button" type="submit">${escapeHtml(messages.createNodeButton)}</button>
          </div>
        </footer>
      </section>
      <div id="node-create-error" class="form-error" role="alert"></div>
    </form>
  </main>
 <script nonce="${nonce}">window.zkViewerNodeCreateInitial = ${initialJson};</script>
  <script nonce="${nonce}">window.zkViewerDetailMessages = ${detailMessagesJson};</script>
 <script nonce="${nonce}" src="${dataEditorScriptUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
