import * as vscode from 'vscode';
import type { DetailMessages, ImportExportMessages } from '../i18n/import-export-messages';
import type { ZkClient } from '../zk/zk-client';
import { DetailPanelController, type DetailPanelDeps } from './detail-controller';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function webviewMessages(messages: DetailMessages): Record<string, unknown> {
  return {
    htmlLanguage: messages.htmlLanguage,
    documentTitle: messages.documentTitle,
    eyebrow: messages.eyebrow,
    wrapOn: messages.wrapOn,
    wrapOff: messages.wrapOff,
    minifyJson: messages.minifyJson,
    edit: messages.edit,
    save: messages.save,
    informationHeading: messages.informationHeading,
    dataHeading: messages.dataHeading,
    displayLabel: messages.displayLabel,
    displayModeAria: messages.displayModeAria,
    dataPlaceholder: messages.dataPlaceholder,
    readOnlyLabel: messages.readOnlyLabel,
    statLabels: messages.statLabels,
    kindReadOnly: messages.kindReadOnly('{kind}'),
    editingStatus: messages.editingStatus,
    readOnlyStatus: messages.readOnlyStatus,
    invalidJson: messages.invalidJson('{detail}'),
    savedAtVersion: messages.savedAtVersion('{version}'),
    error: messages.error('{detail}'),
    minifySuccess: messages.minifySuccess,
    minifyInvalid: messages.minifyInvalid('{detail}'),
  };
}

export class NodeDetailPanel {
  private static current: NodeDetailPanel | undefined;

  static getController(): DetailPanelController | undefined {
    return NodeDetailPanel.current?.controller;
  }

  static getCurrentHtml(): string | undefined {
    return NodeDetailPanel.current?.panel.webview.html;
  }

  static refresh(messages: ImportExportMessages): void {
    if (!NodeDetailPanel.current) {
      return;
    }
    NodeDetailPanel.current.messages = messages;
    NodeDetailPanel.current.controller.setMessages(messages.detail);
    void NodeDetailPanel.current.panel.webview.postMessage({
      type: 'languageChanged',
      messages: webviewMessages(messages.detail),
    });
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly controller: DetailPanelController;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    path: string,
    private messages: ImportExportMessages,
    deps: DetailPanelDeps,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'zkViewer.nodeDetail',
      `ZooKeeper: ${path}`,
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      },
    );
    this.controller = new DetailPanelController(
      {
        ...deps,
        messages: messages.detail,
        notifyError:
          deps.notifyError ??
          ((message: string) => {
            void vscode.window.showErrorMessage(message);
          }),
        onNodeDeleted: (nodePath) => {
          deps.onNodeDeleted?.(nodePath);
          this.panel.dispose();
        },
      },
      {
        postMessage: (message) => {
          void this.panel.webview.postMessage(message);
        },
      },
    );
    this.panel.webview.html = this.buildHtml(this.panel.webview, path);
    this.panel.onDidDispose(() => {
      this.controller.dispose();
      if (NodeDetailPanel.current === this) {
        NodeDetailPanel.current = undefined;
      }
    });
    this.panel.webview.onDidReceiveMessage((message) => {
      void this.controller.handleMessage(message);
    });
    void this.controller.load(path);
  }

  static async open(
    context: vscode.ExtensionContext,
    client: ZkClient,
    path: string,
    messages: ImportExportMessages,
    extra?: Partial<DetailPanelDeps>,
  ): Promise<NodeDetailPanel> {
    if (NodeDetailPanel.current) {
      NodeDetailPanel.current.panel.dispose();
    }
    const panel = new NodeDetailPanel(context, path, messages, {
      getNodeData: (nodePath) => client.getData(nodePath),
      saveNodeData: (nodePath, data, version) => client.setData(nodePath, data, version),
      watchNode: (nodePath, onEvent) => client.watchData(nodePath, onEvent),
      ...extra,
    });
    NodeDetailPanel.current = panel;
    return panel;
  }

  private buildHtml(webview: vscode.Webview, path: string): string {
    const messages = this.messages.detail;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'detail.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'styles.css'),
    );
    const nonce = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const initialMessages = JSON.stringify(webviewMessages(messages)).replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html lang="${messages.htmlLanguage}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>${escapeHtml(messages.documentTitle)}</title>
</head>
<body>
  <main class="detail-shell">
    <header class="detail-header">
      <span class="eyebrow">${escapeHtml(messages.eyebrow)}</span>
      <h1 id="path">${escapeHtml(path)}</h1>
    </header>

    <section class="stat-card" aria-labelledby="stat-heading">
      <h2 id="stat-heading">${escapeHtml(messages.informationHeading)}</h2>
      <div id="stat"></div>
    </section>

    <section class="data-card" aria-labelledby="data-heading">
      <div class="data-toolbar">
        <h2 id="data-heading">${escapeHtml(messages.dataHeading)}</h2>
        <div class="toolbar display-toolbar">
          <span class="toolbar-label">${escapeHtml(messages.displayLabel)}</span>
          <div class="segmented-control" role="group" aria-label="${escapeHtml(messages.displayModeAria)}">
            <button id="display-json" type="button" aria-pressed="true">JSON</button>
            <button id="display-text" type="button" aria-pressed="false">TXT</button>
          </div>
          <button id="toggle-wrap" class="secondary-button" type="button" aria-pressed="true">${escapeHtml(messages.wrapOn)}</button>
          <button id="compact-json" class="secondary-button" type="button">${escapeHtml(messages.minifyJson)}</button>
        </div>
      </div>

      <textarea id="data" spellcheck="false" placeholder="${escapeHtml(messages.dataPlaceholder)}"></textarea>

      <footer class="action-bar">
        <span id="status" role="status" aria-live="polite">${escapeHtml(messages.readOnlyStatus)}</span>
        <div class="action-buttons">
          <button id="edit" class="secondary-button" type="button">${escapeHtml(messages.edit)}</button>
          <button id="save" class="primary-button" type="button">${escapeHtml(messages.save)}</button>
        </div>
      </footer>
    </section>
  </main>
  <script nonce="${nonce}">window.zkViewerDetailMessages = ${initialMessages};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
