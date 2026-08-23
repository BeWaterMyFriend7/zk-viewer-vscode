import * as vscode from 'vscode';
import type { ZkClient } from '../zk/zk-client';
import { DetailPanelController, type DetailPanelDeps } from './detail-controller';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class NodeDetailPanel {
  private static current: NodeDetailPanel | undefined;

  static getController(): DetailPanelController | undefined {
    return NodeDetailPanel.current?.controller;
  }

  static getCurrentHtml(): string | undefined {
    return NodeDetailPanel.current?.panel.webview.html;
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly controller: DetailPanelController;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    path: string,
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
    this.panel.webview.html = this.buildHtml(this.panel.webview);
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
    extra?: Partial<DetailPanelDeps>,
  ): Promise<NodeDetailPanel> {
    if (NodeDetailPanel.current) {
      NodeDetailPanel.current.panel.dispose();
    }
    const panel = new NodeDetailPanel(context, path, {
      getNodeData: (nodePath) => client.getData(nodePath),
      saveNodeData: (nodePath, data, version) => client.setData(nodePath, data, version),
      watchNode: (nodePath, onEvent) => client.watchData(nodePath, onEvent),
      ...extra,
    });
    NodeDetailPanel.current = panel;
    return panel;
  }

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'detail.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'styles.css'),
    );
    const nonce = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Node detail</title>
</head>
<body>
  <h1 id="path">${escapeHtml(this.panel.title)}</h1>
  <div id="stat"></div>
  <div class="toolbar display-toolbar">
    <span>Display:</span>
    <button id="display-json" type="button" aria-pressed="true">JSON</button>
    <button id="display-text" type="button" aria-pressed="false">TXT</button>
    <button id="toggle-wrap" type="button" aria-pressed="true">Wrap: On</button>
    <button id="compact-json" type="button">Minify JSON</button>
  </div>
  <textarea id="data" spellcheck="false" placeholder="Node data"></textarea>
  <div class="toolbar">
    <button id="edit" type="button">Edit</button>
    <button id="save" type="button">Save</button>
    <span id="status"></span>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
