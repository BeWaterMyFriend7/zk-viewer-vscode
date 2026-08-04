import * as vscode from 'vscode';
import {
  ConnectionManager,
  type ClientFactory,
  type ConnectionManagerOptions,
} from './connections/connection-manager';
import {
  buildZkConnectionString,
  ConnectionStore,
  type ConnectionConfig,
  type KeyValueStorage,
} from './connections/connection-store';
import { SecretStorageWrapper, type SecretStorageLike } from './connections/secret-storage';
import { deleteNodeRecursively, validateNodeName } from './commands/node-commands';
import { log } from './log/activity-log';
import { searchNodes, type SearchOptions } from './search/node-search';
import { resolvePath } from './search/path-resolver';
import { findNodeInTree, NodeTreeProvider, revealPathInTree, type ZkNode } from './tree/node-tree-provider';
import { NodeDetailPanel } from './webview/node-detail-panel';
import { MockZkClient } from './zk/mock-zk';
import { NodeZkClient, ZkError, ZkErrorCode } from './zk/zk-client';

let store: ConnectionStore;
let manager: ConnectionManager;
let statusBar: vscode.StatusBarItem;
let activeConnection: ConnectionConfig | undefined;
let treeProvider: NodeTreeProvider;
let treeView: vscode.TreeView<ZkNode>;
let lastRevealedPath: string | undefined;
let lastCommandError: string | undefined;
let extensionContext: vscode.ExtensionContext;

const mockClients = new Map<string, MockZkClient>();

function isMockMode(): boolean {
  return (
    process.env.ZK_VIEWER_USE_MOCK === '1' ||
    vscode.workspace.getConfiguration('zkViewer').get<boolean>('dev.useMockClient') === true
  );
}

function createClientFactory(useMock: boolean): ClientFactory {
  if (!useMock) {
    return (config, options) =>
      new NodeZkClient(buildZkConnectionString(config), {
        sessionTimeoutMs: options.sessionTimeoutMs,
        username: config.username,
        password: options.password,
      });
  }
  return (config) => {
    const key = `${config.hosts}|${config.chroot ?? ''}`;
    let client = mockClients.get(key);
    if (!client) {
      client = new MockZkClient({
        username: config.username,
        password: config.username ? 'mock' : undefined,
      });
      mockClients.set(key, client);
    }
    return client;
  };
}

function registerCommand(
  context: vscode.ExtensionContext,
  command: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => unknown,
) {
  context.subscriptions.push(vscode.commands.registerCommand(command, handler));
}

function updateUiState(state: string): void {
  if (state === 'connected') {
    statusBar.text = `$(plug) ZK: ${activeConnection?.name ?? 'connected'}`;
    statusBar.tooltip = activeConnection
      ? `${activeConnection.hosts}${activeConnection.chroot ?? ''}`
      : undefined;
    statusBar.show();
  } else if (state === 'connecting') {
    statusBar.text = '$(sync~spin) ZK: connecting...';
    statusBar.show();
  } else {
    statusBar.text = '$(circle-slash) ZK: disconnected';
    statusBar.show();
  }
  void vscode.commands.executeCommand('setContext', 'zkViewer.connected', state === 'connected');
  treeProvider?.refresh();
}

async function pickConnection(placeholder: string): Promise<ConnectionConfig | undefined> {
  const configs = await store.list();
  if (configs.length === 0) {
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    configs.map((config) => ({
      label: config.name,
      detail: `${config.hosts}${config.chroot ?? ''}`,
      description: config.username ? `user: ${config.username}` : 'no auth',
      config,
    })),
    { placeHolder: placeholder },
  );
  return picked?.config;
}

async function connectCommand(): Promise<void> {
  if (manager.getState() === 'connected') {
    void vscode.window.showInformationMessage('Already connected.');
    return;
  }
  let selected = await pickConnection('Select a connection');
  if (!selected) {
    if (process.env.ZK_VIEWER_USE_MOCK === '1') {
      selected = { id: 'mock-default', name: 'Mock ZooKeeper', hosts: 'localhost:2181' };
      await store.save(selected);
    } else {
      void vscode.window.showInformationMessage('No connections yet. Add one first.');
      return;
    }
  }
  activeConnection = selected;
  const password = await store.getPassword(selected.id);
  try {
    log(`Connecting to ${selected.hosts}${selected.chroot ?? ''}...`);
    await manager.connect(selected, password);
    log(`Connected to ${selected.name}`);
    void vscode.window.showInformationMessage(`Connected to ${selected.name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Connection failed: ${message}`, 'error');
    void vscode.window.showErrorMessage(`Connection failed: ${message}`);
  }
}

async function disconnectCommand(): Promise<void> {
  if (manager.getState() === 'closed') {
    return;
  }
  manager.disconnect();
  activeConnection = undefined;
  log('Disconnected');
  void vscode.window.showInformationMessage('Disconnected.');
}

async function addConnectionCommand(): Promise<void> {
  const name = await vscode.window.showInputBox({
    title: 'Connection name',
    value: 'ZooKeeper',
    ignoreFocusOut: true,
  });
  if (name === undefined) {
    return;
  }
  const hosts = await vscode.window.showInputBox({
    title: 'Hosts (comma separated)',
    value: 'localhost:2181',
    ignoreFocusOut: true,
  });
  if (hosts === undefined) {
    return;
  }
  const chroot = await vscode.window.showInputBox({
    title: 'Chroot (optional, e.g. /app)',
    value: '',
    ignoreFocusOut: true,
  });
  if (chroot === undefined) {
    return;
  }
  const username = await vscode.window.showInputBox({ title: 'Username (optional)', ignoreFocusOut: true });
  if (username === undefined) {
    return;
  }
  const securePick = await vscode.window.showQuickPick(
    [
      { label: 'No (plain zk://)', value: false },
      { label: 'Yes (TLS, ssl://)', value: true },
    ],
    { placeHolder: 'Use TLS?' },
  );
  if (!securePick) {
    return;
  }
  const password = await vscode.window.showInputBox({
    title: 'Password (optional)',
    password: true,
    ignoreFocusOut: true,
  });
  if (password === undefined) {
    return;
  }
  const config: ConnectionConfig = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || 'ZooKeeper',
    hosts: hosts.trim() || 'localhost:2181',
    chroot: chroot.trim() || undefined,
    username: username.trim() || undefined,
    secure: securePick.value,
    sessionTimeoutMs: vscode.workspace.getConfiguration('zkViewer').get<number>('sessionTimeout'),
  };
  await store.save(config, password || undefined);
  log(`Saved connection "${config.name}" (${config.hosts}${config.chroot ?? ''})`);
  void vscode.window.showInformationMessage(`Connection "${config.name}" saved.`);
}

async function editConnectionCommand(): Promise<void> {
  const config = await pickConnection('Edit connection');
  if (!config) {
    void vscode.window.showInformationMessage('No connections to edit.');
    return;
  }
  const password = await store.getPassword(config.id);
  const name = await vscode.window.showInputBox({
    title: 'Connection name',
    value: config.name,
    ignoreFocusOut: true,
  });
  if (name === undefined) {
    return;
  }
  const hosts = await vscode.window.showInputBox({
    title: 'Hosts',
    value: config.hosts,
    ignoreFocusOut: true,
  });
  if (hosts === undefined) {
    return;
  }
  const username = await vscode.window.showInputBox({
    title: 'Username (optional)',
    value: config.username ?? '',
    ignoreFocusOut: true,
  });
  if (username === undefined) {
    return;
  }
  const newPassword = await vscode.window.showInputBox({
    title: 'Password (leave empty to keep existing)',
    password: true,
    ignoreFocusOut: true,
  });
  if (newPassword === undefined) {
    return;
  }
  const updated: ConnectionConfig = {
    ...config,
    name: name.trim() || config.name,
    hosts: hosts.trim() || config.hosts,
    username: username.trim() || undefined,
  };
  await store.save(updated, newPassword !== '' ? newPassword : password);
  log(`Updated connection "${updated.name}"`);
}

async function removeConnectionCommand(): Promise<void> {
  const config = await pickConnection('Remove connection');
  if (!config) {
    return;
  }
  const confirmed = await vscode.window.showWarningMessage(
    `Remove connection "${config.name}"?`,
    { modal: true },
    'Remove',
  );
  if (confirmed !== 'Remove') {
    return;
  }
  await store.remove(config.id);
  if (activeConnection?.id === config.id) {
    manager.disconnect();
    activeConnection = undefined;
  }
  log(`Removed connection "${config.name}"`);
}

async function gotoPathCommand(targetPath?: string): Promise<void> {
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage('Not connected.');
    return;
  }
  const input =
    targetPath ??
    (await vscode.window.showInputBox({ title: 'Node path', value: '/', prompt: 'e.g. /app/config' }));
  if (!input) {
    return;
  }
  try {
    const resolved = await resolvePath(client, input);
    const node = await findNodeInTree(treeProvider, resolved);
    lastRevealedPath = resolved;
    try {
      await treeView.reveal(node, { expand: true, focus: true, select: true });
    } catch {
      log(`Tree view not visible; resolved ${resolved} in data`, 'error');
    }
    log(`Revealed ${resolved}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastCommandError = message;
    log(`Goto path failed: ${message}`, 'error');
    void vscode.window.showErrorMessage(message);
  }
}

async function promptSearchOptions(): Promise<SearchOptions | undefined> {
  const modePick = await vscode.window.showQuickPick(
    [
      { label: 'Name prefix', mode: 'prefix' as const },
      { label: 'Path wildcard (e.g. /app/*/config)', mode: 'wildcard' as const },
      { label: 'Path regex (e.g. ^/svc-\\d+$)', mode: 'regex' as const },
      { label: 'Content', mode: 'content' as const },
    ],
    { placeHolder: 'Search mode' },
  );
  if (!modePick) {
    return undefined;
  }
  const query = await vscode.window.showInputBox({
    title: `Search query (${modePick.label})`,
    ignoreFocusOut: true,
  });
  if (query === undefined || query.trim() === '') {
    return undefined;
  }
  let subtree: string | undefined;
  if (modePick.mode === 'content') {
    const input = await vscode.window.showInputBox({
      title: 'Subtree root (optional, default /)',
      value: '/',
    });
    if (input === undefined) {
      return undefined;
    }
    subtree = input.trim() || undefined;
  }
  return { mode: modePick.mode, query: query.trim(), subtree };
}

async function searchCommand(options?: SearchOptions): Promise<unknown> {
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage('Not connected.');
    return;
  }
  const opts = options ?? (await promptSearchOptions());
  if (!opts) {
    return;
  }
  const maxNodes = vscode.workspace.getConfiguration('zkViewer').get<number>('maxSearchNodes') ?? 2000;
  try {
    const results = await searchNodes(client, { ...opts, maxNodes });
    log(`Search "${opts.query}" (${opts.mode}): ${results.length} results`);
    if (options) {
      return results;
    }
    if (results.length === 0) {
      void vscode.window.showInformationMessage('No matching nodes.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      results.map((result) => ({ label: result.path, description: result.matchedBy })),
      { placeHolder: 'Search results', matchOnDescription: true },
    );
    if (picked) {
      await revealPathInTree(treeView, treeProvider, picked.label);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Search failed: ${message}`, 'error');
    void vscode.window.showErrorMessage(message);
  }
  return;
}

async function openNodeDetailCommand(node?: ZkNode): Promise<void> {
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage('Not connected.');
    return;
  }
  let path: string | undefined = (node as ZkNode | undefined)?.descriptor?.path;
  if (!path) {
    const selected = treeView.selection[0] as ZkNode | undefined;
    path = selected?.descriptor.path;
  }
  if (!path) {
    path = await vscode.window.showInputBox({ title: 'Node path', value: '/' });
  }
  if (!path) {
    return;
  }
  try {
    const resolved = await resolvePath(client, path);
    await NodeDetailPanel.open(extensionContext, client, resolved);
    log(`Opened detail panel for ${resolved}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Open detail failed: ${message}`, 'error');
    void vscode.window.showErrorMessage(message);
  }
}

async function addNodeCommand(
  node?: ZkNode,
  options?: { name?: string; mode?: string; data?: string },
): Promise<void> {
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage('Not connected.');
    return;
  }
  const parentPath = node?.descriptor.path ?? treeView.selection[0]?.descriptor.path;
  const resolvedParent =
    parentPath ?? (await vscode.window.showInputBox({ title: 'Parent path', value: '/' }));
  if (!resolvedParent) {
    return;
  }
  const name =
    options?.name ?? (await vscode.window.showInputBox({ title: `Node name under ${resolvedParent}` }));
  if (!name) {
    return;
  }
  const invalid = validateNodeName(name);
  if (invalid) {
    void vscode.window.showErrorMessage(invalid);
    log(`Add node rejected: ${invalid}`, 'error');
    return;
  }
  const mode =
    options?.mode ??
    (
      await vscode.window.showQuickPick(
        [
          { label: 'Persistent', mode: 'PERSISTENT' },
          { label: 'Persistent Sequential', mode: 'PERSISTENT_SEQUENTIAL' },
          { label: 'Ephemeral', mode: 'EPHEMERAL' },
          { label: 'Ephemeral Sequential', mode: 'EPHEMERAL_SEQUENTIAL' },
        ],
        { placeHolder: 'Node type' },
      )
    )?.mode;
  if (!mode) {
    return;
  }
  const data =
    options?.data ?? (await vscode.window.showInputBox({ title: 'Node data (optional)', value: '' }));
  if (data === undefined) {
    return;
  }
  const fullPath = resolvedParent === '/' ? `/${name}` : `${resolvedParent}/${name}`;
  try {
    const created = await client.create(
      fullPath,
      Buffer.from(data, 'utf8'),
      mode as Parameters<typeof client.create>[2],
    );
    log(`Created ${created} (${mode})`);
    treeProvider.refresh();
    void vscode.window.showInformationMessage(`Created ${created}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Add node failed: ${message}`, 'error');
    void vscode.window.showErrorMessage(message);
  }
}

async function deleteNodeCommand(
  node?: ZkNode,
  options?: { recursive?: boolean; confirm?: boolean | 'cancel' },
): Promise<void> {
  const client = manager.getClient();
  if (!client) {
    void vscode.window.showInformationMessage('Not connected.');
    return;
  }
  const path = node?.descriptor.path ?? treeView.selection[0]?.descriptor.path;
  if (!path) {
    return;
  }
  if (path === '/') {
    void vscode.window.showWarningMessage('The root node cannot be deleted.');
    return;
  }
  let recursive = options?.recursive ?? false;
  if (options?.confirm === 'cancel') {
    log('Delete cancelled');
    return;
  }
  if (options?.confirm !== false) {
    const choice = await vscode.window.showWarningMessage(
      `Delete ${path}?`,
      { modal: true },
      'Delete',
      'Delete Recursively',
    );
    if (choice === undefined) {
      log('Delete cancelled');
      return;
    }
    recursive = choice === 'Delete Recursively';
  }
  try {
    if (recursive) {
      await deleteNodeRecursively(client, path);
    } else {
      await client.remove(path);
    }
    log(`Deleted ${path}`);
    treeProvider.refresh();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof ZkError && err.code === ZkErrorCode.NOT_EMPTY) {
      void vscode.window.showErrorMessage('Node is not empty. Use "Delete Recursively".');
    } else {
      void vscode.window.showErrorMessage(message);
    }
    log(`Delete failed: ${message}`, 'error');
  }
}

async function copyPathCommand(node?: ZkNode): Promise<void> {
  const path = node?.descriptor.path ?? treeView.selection[0]?.descriptor.path;
  if (!path) {
    return;
  }
  await vscode.env.clipboard.writeText(path);
  log(`Copied path ${path}`);
  void vscode.window.showInformationMessage(`Copied ${path}`);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('zk-viewer-vscode activating');
  extensionContext = context;

  store = new ConnectionStore(
    context.workspaceState as unknown as KeyValueStorage,
    new SecretStorageWrapper(context.secrets as unknown as SecretStorageLike),
  );

  const config = vscode.workspace.getConfiguration('zkViewer');
  const managerOptions: ConnectionManagerOptions = {
    maxReconnectAttempts: config.get<number>('maxReconnectAttempts') ?? 3,
    reconnectDelayMs: config.get<number>('reconnectDelayMs') ?? 2000,
  };
  manager = new ConnectionManager(createClientFactory(isMockMode()), managerOptions);
  manager.onStateChange((state) => updateUiState(state));

  treeProvider = new NodeTreeProvider(() => manager.getClient());
  treeView = vscode.window.createTreeView('zkViewer.tree', { treeDataProvider: treeProvider });
  context.subscriptions.push(treeView);

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  context.subscriptions.push(statusBar);
  updateUiState(manager.getState());

  if (process.env.ZK_VIEWER_USE_MOCK === '1') {
    (globalThis as { __zkViewerTestApi?: unknown }).__zkViewerTestApi = getTestApi();
  }

  registerCommand(context, 'zkViewer.connect', connectCommand);
  registerCommand(context, 'zkViewer.disconnect', disconnectCommand);
  registerCommand(context, 'zkViewer.addConnection', addConnectionCommand);
  registerCommand(context, 'zkViewer.editConnection', editConnectionCommand);
  registerCommand(context, 'zkViewer.removeConnection', removeConnectionCommand);

  registerCommand(context, 'zkViewer.refresh', () => treeProvider.refresh());
  registerCommand(context, 'zkViewer.search', searchCommand);
  registerCommand(context, 'zkViewer.gotoPath', gotoPathCommand);
  registerCommand(context, 'zkViewer.addNode', addNodeCommand);
  registerCommand(context, 'zkViewer.editNode', openNodeDetailCommand);
  registerCommand(context, 'zkViewer.deleteNode', deleteNodeCommand);
  registerCommand(context, 'zkViewer.copyPath', copyPathCommand);
  registerCommand(context, 'zkViewer.openNodeDetail', openNodeDetailCommand);

  log('zk-viewer-vscode activated');
}

export function deactivate(): void {
  if (manager) {
    manager.disconnect();
  }
  log('zk-viewer-vscode deactivated');
}

/**
 * Test-only accessor used by integration tests running in the extension host.
 */
export function getTestApi(): {
  manager: ConnectionManager;
  store: ConnectionStore;
  mockClients: Map<string, MockZkClient>;
  treeProvider: NodeTreeProvider;
  treeView: vscode.TreeView<ZkNode>;
  detailController: () => ReturnType<typeof NodeDetailPanel.getController>;
  detailPanelHtml: () => string | undefined;
  lastRevealedPath: () => string | undefined;
  lastCommandError: () => string | undefined;
  getActiveConnection: () => ConnectionConfig | undefined;
} {
  return {
    manager,
    store,
    mockClients,
    treeProvider,
    treeView,
    detailController: () => NodeDetailPanel.getController(),
    detailPanelHtml: () => NodeDetailPanel.getCurrentHtml(),
    lastRevealedPath: () => lastRevealedPath,
    lastCommandError: () => lastCommandError,
    getActiveConnection: () => activeConnection,
  };
}
