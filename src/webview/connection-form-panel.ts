import * as vscode from 'vscode';
import type { ConnectionConfig } from '../connections/connection-store';
import type { ConnectionMessages, ImportExportMessages, UiLanguage } from '../i18n/import-export-messages';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface FormState {
  name: string;
  hosts: string;
  chroot: string;
  username: string;
  secure: boolean;
  sessionTimeoutMs: number | undefined;
}

export interface ConnectionFormResult {
  config: ConnectionConfig;
  /** undefined means the user did not change the password (edit mode). */
  password: string | undefined;
}

export class ConnectionFormPanel {
  private static current: ConnectionFormPanel | undefined;

  static getCurrentHtml(): string | undefined {
    return ConnectionFormPanel.current?.panel.webview.html;
  }

  static open(args: {
    context: vscode.ExtensionContext;
    messages: ImportExportMessages;
    language: UiLanguage;
    initial?: ConnectionConfig;
    onSave: (result: ConnectionFormResult) => Promise<void>;
    testConnection?: (config: ConnectionConfig, password?: string) => Promise<void>;
  }): ConnectionFormPanel {
    if (ConnectionFormPanel.current) {
      ConnectionFormPanel.current.dispose();
    }
    const panel = new ConnectionFormPanel(args);
    ConnectionFormPanel.current = panel;
    return panel;
  }

  private readonly panel: vscode.WebviewPanel;

  private constructor(
    private readonly args: {
      context: vscode.ExtensionContext;
      messages: ImportExportMessages;
      language: UiLanguage;
      initial?: ConnectionConfig;
      onSave: (result: ConnectionFormResult) => Promise<void>;
      testConnection?: (config: ConnectionConfig, password?: string) => Promise<void>;
    },
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'zkViewer.connectionForm',
      this.messages().formTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(args.context.extensionUri, 'media')],
      },
    );
    this.panel.onDidDispose(() => {
      if (ConnectionFormPanel.current === this) {
        ConnectionFormPanel.current = undefined;
      }
    });
    this.panel.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message);
    });
    this.render();
  }

  private messages(): ConnectionMessages {
    return this.args.messages.connection;
  }

  private async handleMessage(message: {
    type?: string;
    state?: FormState;
    newPassword?: string;
  }): Promise<void> {
    if (message.type === 'cancel') {
      this.dispose();
      return;
    }
    if (message.type === 'test' && message.state) {
      const state = message.state;
      if (!state.hosts.trim()) {
        void this.panel.webview.postMessage({
          type: 'testResult',
          ok: false,
          message: this.messages().hostsRequired,
        });
        return;
      }
      const config: ConnectionConfig = {
        id: this.args.initial?.id ?? 'test',
        name: state.name.trim() || 'ZooKeeper',
        hosts: state.hosts.trim(),
        chroot: state.chroot.trim() || undefined,
        username: state.username.trim() || undefined,
        secure: state.secure,
        sessionTimeoutMs: state.sessionTimeoutMs,
      };
      const test = this.args.testConnection;
      if (!test) {
        return;
      }
      try {
        await test(config, message.newPassword);
        void this.panel.webview.postMessage({
          type: 'testResult',
          ok: true,
          message: this.messages().testSuccess,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        void this.panel.webview.postMessage({
          type: 'testResult',
          ok: false,
          message: this.messages().testFailed(detail),
        });
      }
      return;
    }
    if (message.type !== 'save' || !message.state) {
      return;
    }
    const state = message.state;
    if (!state.hosts.trim()) {
      void this.panel.webview.postMessage({
        type: 'error',
        message: this.messages().hostsRequired,
      });
      return;
    }
    let id: string;
    if (this.args.initial) {
      id = this.args.initial.id;
    } else {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const config: ConnectionConfig = {
      id,
      name: state.name.trim() || 'ZooKeeper',
      hosts: state.hosts.trim(),
      chroot: state.chroot.trim() || undefined,
      username: state.username.trim() || undefined,
      secure: state.secure,
      sessionTimeoutMs: state.sessionTimeoutMs,
    };
    await this.args.onSave({
      config,
      // In edit mode an unchanged password is represented as undefined. The
      // UI sends an explicit newPassword only when the field changed.
      password: message.newPassword === undefined ? undefined : message.newPassword,
    });
    this.dispose();
  }

  dispose(): void {
    this.panel.dispose();
  }

  private render(): void {
    const messages = this.messages();
    this.panel.title = messages.formTitle;
    const initial = this.args.initial;
    const state: FormState = {
      name: initial?.name ?? '',
      hosts: initial?.hosts ?? '',
      chroot: initial?.chroot ?? '',
      username: initial?.username ?? '',
      secure: initial?.secure ?? false,
      sessionTimeoutMs: initial?.sessionTimeoutMs ?? 10000,
    };
    this.panel.webview.html = this.buildHtml(this.panel.webview, state);
  }

  private buildHtml(webview: vscode.Webview, state: FormState): string {
    const messages = this.messages();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.args.context.extensionUri, 'media', 'connection-form.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.args.context.extensionUri, 'media', 'styles.css'),
    );
    const nonce = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const initialJson = JSON.stringify(state).replace(/</g, '\\u003c');
    const connectionFormMessagesJson = JSON.stringify({
      testConnectionButton: messages.testConnectionButton,
    }).replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html lang="${this.args.language === 'zh-cn' ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>${escapeHtml(messages.formTitle)}</title>
</head>
<body>
  <main class="form-shell">
    <header class="form-header">
      <h1>${escapeHtml(messages.formTitle)}</h1>
    </header>
    <form id="connection-form" class="form-card">
      <label>
        <span>${escapeHtml(messages.connectionNameTitle)}</span>
        <input id="f-name" type="text" value="${escapeHtml(state.name)}" required>
      </label>
      <label>
        <span>${escapeHtml(messages.hostsCommaTitle)}</span>
        <input id="f-hosts" type="text" value="${escapeHtml(state.hosts)}" required>
      </label>
      <label>
        <span>${escapeHtml(messages.chrootTitle)}</span>
        <input id="f-chroot" type="text" value="${escapeHtml(state.chroot)}">
      </label>
      <label>
        <span>${escapeHtml(messages.usernameOptionalTitle)}</span>
        <input id="f-username" type="text" value="${escapeHtml(state.username)}">
      </label>
      <label>
        <span>${escapeHtml(messages.passwordOptionalTitle)}</span>
        <input id="f-password" type="password" value="">
      </label>
      <label>
        <span>${escapeHtml(messages.tlsPrompt)}</span>
        <select id="f-secure">
          <option value="no" ${state.secure ? '' : 'selected'}>${escapeHtml(messages.tlsNoLabel)}</option>
          <option value="yes" ${state.secure ? 'selected' : ''}>${escapeHtml(messages.tlsYesLabel)}</option>
        </select>
      </label>
      <label>
        <span>${escapeHtml(messages.sessionTimeoutTitle)}</span>
        <input id="f-timeout" type="number" min="1000" value="${state.sessionTimeoutMs ?? 10000}">
      </label>
      <div id="form-error" class="form-error" role="alert"></div>
      <footer class="form-actions">
        <button id="test-connection" class="secondary-button" type="button">${escapeHtml(messages.testConnectionButton)}</button>
        <button id="cancel" class="secondary-button" type="button">${escapeHtml(messages.cancelButton)}</button>
        <button id="save" class="primary-button" type="submit">${escapeHtml(messages.saveButton)}</button>
      </footer>
    </form>
  </main>
  <script nonce="${nonce}">window.zkViewerConnectionFormInitial = ${initialJson};</script>
  <script nonce="${nonce}">window.zkViewerConnectionFormMessages = ${connectionFormMessagesJson};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
